import { fileURLToPath } from "node:url";
import {
  describePlan,
  isRunnable,
  planForget,
  redactParticipant,
  type ForgetPlan,
  type ForgetTarget,
  type SubmissionRow,
} from "#lib/forget";
import { deleteAllSelections } from "#lib/card-selections";
import { deleteAllDeckBuilds, deleteDeckBuilds } from "#lib/deck-builds";
import {
  deleteAllSignups,
  deleteSignups,
  readSignupIdentities,
} from "#lib/signups";
import { SIGNUP_FIELDS } from "#lib/signup";
import { deleteEventData, describeTarget, readEvent, writeEvent } from "#lib/store";
import {
  deleteSubmission,
  fetchSubmissions,
  type FormSubmission,
} from "#scripts/netlify-forms";

/**
 * Erases somebody's personal data, or all of it.
 *
 * Usage:
 *   npm run forget -- "Ada Lovelace"              # show the plan, change nothing
 *   npm run forget -- "Ada Lovelace" --yes        # withdraw them before the draw
 *   npm run forget -- "Ada Lovelace" --redact --yes   # after the draw
 *   npm run forget -- --everyone --yes            # post-event wipe
 *
 * Prints the plan and stops unless `--yes` is given. None of this is
 * reversible and some of it — the blob backups, the form submissions — is the
 * only remaining copy, so the default is to describe rather than do.
 *
 * What counts as personal data and what each mode touches is decided in
 * `src/lib/forget.ts`, which is pure and unit-tested. This file reads, prints,
 * and executes.
 */

const USAGE =
  "Usage:\n" +
  '  npm run forget -- "<name>"            show what erasing them would touch\n' +
  '  npm run forget -- "<name>" --yes      remove a sign-up before the draw\n' +
  '  npm run forget -- "<name>" --redact --yes\n' +
  "                                        blank their details, keep the ring\n" +
  "  npm run forget -- --everyone --yes    erase the whole event, after it ends";

function nameOf(submission: FormSubmission): string {
  return (submission.data?.[SIGNUP_FIELDS.name] ?? "").trim();
}

/**
 * Every submission Netlify holds, verified and spam alike.
 *
 * The spam list is not optional here. Akismet holds back real sign-ups often
 * enough that this project already has a whole reconciliation step for it, and
 * a held-back submission contains exactly the same name and email as a
 * verified one. Erasing someone while leaving their address in the spam list
 * would be erasing nothing.
 *
 * Returns null — not an empty list — when there are no credentials, so the
 * plan can say "not checked" instead of "nothing found".
 */
async function readSubmissions(): Promise<
  { rows: SubmissionRow[]; byId: Map<string, string> } | null
> {
  const siteId = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (!siteId || !token) {
    return null;
  }

  const [verified, spam] = await Promise.all([
    fetchSubmissions(siteId, token),
    fetchSubmissions(siteId, token, { state: "spam" }),
  ]);

  const all = [...verified, ...spam];
  return {
    rows: all.map((submission) => ({
      id: submission.id,
      name: nameOf(submission),
      createdAt: submission.created_at,
    })),
    byId: new Map(all.map((submission) => [submission.id, nameOf(submission)])),
  };
}

/**
 * Carries out a plan.
 *
 * The order is deliberate and runs from the outside in, leaving `event.json`
 * until last. That file is the only thing mapping a random participant id back
 * to a person, so if a later step fails with it already gone, the rows it was
 * meant to reach can no longer be identified — and re-running would not fix
 * it. Losing the map last means a partial failure is always recoverable by
 * running the command again.
 */
async function execute(
  plan: ForgetPlan,
  token: string | undefined
): Promise<string[]> {
  const done: string[] = [];

  for (const id of plan.submissionIds) {
    // No token here would be a bug, not a state: the plan only ever names
    // submissions that were read with one.
    if (!token) {
      throw new Error("Netlify credentials vanished between reading and deleting.");
    }
    await deleteSubmission(id, token);
  }
  if (plan.submissionIds.length > 0) {
    done.push(`Deleted ${plan.submissionIds.length} Netlify Forms submission(s).`);
  }

  if (plan.wipeSignups) {
    done.push(`Deleted ${await deleteAllSignups()} sign-up row(s).`);
  } else if (plan.signupIds.length > 0) {
    done.push(`Deleted ${await deleteSignups(plan.signupIds)} sign-up row(s).`);
  }

  if (plan.wipeDeckBuilds) {
    done.push(`Deleted ${await deleteAllDeckBuilds()} deck build(s).`);
  } else if (plan.deckBuildIds.length > 0) {
    done.push(
      `Deleted ${await deleteDeckBuilds(plan.deckBuildIds)} deck build(s).`
    );
  }

  if (plan.wipeSelections) {
    const { selections, secretSets } = await deleteAllSelections();
    done.push(
      `Deleted ${selections} card selection(s) and ${secretSets} shortlist(s).`
    );
  }

  if (plan.redactIds.length > 0) {
    const event = await readEvent();
    const ids = new Set(plan.redactIds);
    event.participants = event.participants.map((participant) =>
      ids.has(participant.id) ? redactParticipant(participant) : participant
    );
    await writeEvent(event);
    done.push(`Blanked the personal fields of ${plan.redactIds.length} participant(s).`);
  }

  if (plan.wipeEventStore) {
    const keys = await deleteEventData();
    done.push(
      keys.length > 0
        ? `Deleted ${keys.length} event file(s): ${keys.join(", ")}.`
        : "No event data was present to delete."
    );
  }

  return done;
}

function parseTarget(args: string[]): ForgetTarget {
  if (args.includes("--everyone")) {
    return { everyone: true };
  }

  const names = args.filter((arg) => !arg.startsWith("--"));
  if (names.length !== 1) {
    throw new Error(
      (names.length === 0
        ? "Name somebody, or pass --everyone."
        : `Erase one person at a time — got ${names.length} names.`) +
        `\n${USAGE}`
    );
  }
  return { name: names[0], redact: args.includes("--redact") };
}

export async function main(
  args: string[] = process.argv.slice(2)
): Promise<void> {
  const target = parseTarget(args);
  const confirmed = args.includes("--yes");

  console.log(describeTarget());

  const event = await readEvent();

  // A failure here has to stop the run. Planning without the sign-up rows
  // would produce a plan that silently leaves them behind, and reporting that
  // as an erasure is worse than refusing to start.
  let signups;
  try {
    signups = await readSignupIdentities();
  } catch (error) {
    throw new Error(
      "Could not read the sign-ups, so nothing has been deleted. " +
        "NETLIFY_DB_URL must point at the event's database.\n" +
        `  ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const submissions = await readSubmissions();
  const plan = planForget({
    event,
    signups,
    submissions: submissions?.rows ?? null,
    target,
  });

  for (const line of describePlan(plan)) {
    console.log(line);
  }

  if (!isRunnable(plan)) {
    process.exitCode = 1;
    return;
  }

  if (!confirmed) {
    console.log("\nNothing has been changed. Re-run with --yes to carry this out.");
    return;
  }

  console.log("");
  for (const line of await execute(plan, process.env.NETLIFY_AUTH_TOKEN)) {
    console.log(line);
  }
  console.log("Done.");
}

const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
    process.argv[1].endsWith("scripts/forget.ts") ||
    process.argv[1].endsWith("forget.ts"));

if (isDirectRun && process.env.NODE_ENV !== "test") {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
