import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { randomInt, randomUUID } from "node:crypto";
import { drawAssignments } from "#lib/draw";
import { buildRing } from "#lib/ring";
import {
  MINIMUM_PARTICIPANTS,
  type EventData,
  type Participant,
} from "#lib/participants";
import type { CommanderPick } from "#lib/pairing";
import { fetchCommanderPool } from "#lib/scryfall/pool";
import {
  dedupeSignups,
  resolveSelfCards,
  type ParticipantInput,
  type SignupEntry,
} from "#lib/signup";
import { writeEvent, readEvent, describeTarget } from "#lib/store";
import { mintToken } from "#lib/tokens";
import { readSignups, type StoredSignup } from "#lib/signups";
import { parseCsv, toParticipantInputs } from "#scripts/csv";
import { fetchSubmissions, toSignupEntries } from "#scripts/netlify-forms";
import {
  describeReconciliation,
  isClean,
  reconcileSignups,
} from "#scripts/reconcile";

/** Crypto-backed float in [0, 1) — the spec requires the real draw not use Math.random. */
const cryptoRng = () => randomInt(2 ** 30) / 2 ** 30;

const USAGE =
  "Usage:\n" +
  "  npm run draw                     rehearse: do everything, write nothing\n" +
  "  npm run draw -- --yes            draw for real\n" +
  "\n" +
  "  Note the `--`. Without it npm keeps the flag for itself and the script\n" +
  "  never sees it — which is why the real draw needs one rather than the\n" +
  "  rehearsal: a lost separator then costs you a rehearsal, not a ring.\n" +
  "\n" +
  "  Sources:  (default) the database\n" +
  "            -- <responses.csv>\n" +
  "            -- --from=netlify-forms\n" +
  "  Options:  --latest-wins          merge duplicate names, newest wins\n" +
  "            --ignore-unrecorded    draw though sign-ups are missing rows\n" +
  "            --force                redraw over an existing draw";

/**
 * Flags this script understands. `from` carries a value; the rest are bare.
 */
const KNOWN_FLAGS = [
  "force",
  "latest-wins",
  "ignore-unrecorded",
  "dry-run",
  "yes",
  "from",
] as const;

/**
 * Rejects anything this script does not recognise, rather than ignoring it.
 *
 * Silently dropping an unknown flag is not survivable here. `--dry-rn` would
 * have been discarded and the **real, irreversible draw** would have run in
 * its place — reshuffling everyone and invalidating every link already sent,
 * on a command the operator typed specifically to avoid that. A safety flag
 * that fails open is worse than no safety flag.
 *
 * The same goes for stray positional arguments: the first is read as a CSV
 * path and the rest were quietly ignored, so a mistyped command could go
 * looking for a file nobody meant to name.
 */
function checkArguments(flags: string[], paths: string[]): void {
  for (const flag of flags) {
    const name = flag.slice(2).split("=")[0];
    if (!KNOWN_FLAGS.includes(name as (typeof KNOWN_FLAGS)[number])) {
      throw new Error(
        `Unrecognised option "${flag}".\n` +
          `Known: ${KNOWN_FLAGS.map((f) => `--${f}`).join(", ")}.\n${USAGE}`
      );
    }
    if (name === "from" && flag !== "--from=netlify-forms") {
      throw new Error(
        `"${flag}" is not a source this script reads. The only --from value ` +
          `is netlify-forms.\n${USAGE}`
      );
    }
  }

  if (paths.length > 1) {
    throw new Error(
      `Expected at most one CSV path, got ${paths.length}: ` +
        `${paths.map((p) => `"${p}"`).join(", ")}.\n${USAGE}`
    );
  }
}

/** One person ready to be drawn: their answers plus their resolved pool cards. */
type DrawInput = { input: ParticipantInput; cards: [CommanderPick, CommanderPick] };

/**
 * Reads sign-ups the Netlify function has already mirrored into the database.
 *
 * The default source. Card picks were resolved against the pool when each
 * submission arrived, so nothing here can fail on a set release that happened
 * afterwards — unlike the two import paths below, which still resolve names.
 *
 * Needs `NETLIFY_DB_URL`; it is a read, so a missing or wrong one fails the
 * run before anything is written.
 */
async function fromDatabase(
  latestWins: boolean,
  ignoreUnrecorded: boolean
): Promise<DrawInput[]> {
  let stored;
  try {
    stored = await readSignups();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not read the sign-ups. Nothing has been written.\n  ${detail}\n\n` +
        "The database is the default source and needs NETLIFY_DB_URL — copy it\n" +
        "from the Netlify UI under Data & Storage > Database. A full run also\n" +
        "wants NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN, without which the draw\n" +
        "cross-checks nothing against Netlify Forms and writes to the local\n" +
        "file rather than the live event."
    );
  }
  console.log(`Read ${stored.length} sign-up(s) from the database.`);

  await checkAgainstForms(stored, ignoreUnrecorded);

  const { entries, superseded } = dedupeSignups<StoredSignup>(stored, { latestWins });
  for (const note of superseded) {
    console.log(`Superseded duplicate sign-up: ${note}`);
  }

  return entries.map((entry) => ({ input: entry.input, cards: entry.cards }));
}

/**
 * Compares the rows against Netlify Forms before drawing.
 *
 * The draw is the irreversible step: re-running it reshuffles everyone and
 * invalidates every link already sent. So a sign-up that never reached the
 * database **stops** the run rather than warning, because carrying on writes
 * a ring that is permanently short a person. Spam only warns — whether those
 * are real people is a judgement the organiser has to make in the Netlify UI.
 */
async function checkAgainstForms(
  stored: StoredSignup[],
  ignoreUnrecorded: boolean
): Promise<void> {
  const siteId = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;

  if (!siteId || !token) {
    // Loud rather than silent: the whole point of this check is that the
    // failures it catches leave no other trace.
    console.warn(
      "\n⚠  Skipping the Netlify Forms cross-check — NETLIFY_SITE_ID and " +
        "NETLIFY_AUTH_TOKEN are not both set.\n" +
        "   Sign-ups held back as spam, or dropped by a failing " +
        "signup-submitted, cannot be detected without them.\n"
    );
    return;
  }

  let report;
  try {
    const [verified, spam] = await Promise.all([
      fetchSubmissions(siteId, token),
      fetchSubmissions(siteId, token, { state: "spam" }),
    ]);
    report = reconcileSignups({
      verified,
      spam,
      storedNames: stored.map((entry) => entry.input.name),
    });
  } catch (error) {
    // A Forms API blip should not block a draw that is otherwise fine, but the
    // organiser has to know the check did not happen.
    console.warn(
      `\n⚠  Could not reach Netlify Forms to cross-check the sign-ups ` +
        `(${error instanceof Error ? error.message : String(error)}).\n` +
        "   Missing or spam-flagged sign-ups cannot be detected. Re-run when " +
        "the API is reachable if you want that assurance.\n"
    );
    return;
  }

  if (isClean(report)) {
    console.log("Cross-checked against Netlify Forms: every submission is accounted for.");
    return;
  }

  console.warn("");
  for (const line of describeReconciliation(report)) {
    console.warn(line);
  }

  if (report.unrecorded.length > 0 && !ignoreUnrecorded) {
    throw new Error(
      `Refusing to draw with ${report.unrecorded.length} sign-up(s) missing from ` +
        "the database. Fix them — re-submit the form, or add them with the CSV " +
        "path — then run the draw again. Pass --ignore-unrecorded to draw " +
        "without them anyway."
    );
  }
}

/**
 * Pulls sign-ups from the live Netlify form.
 *
 * Deliberately loud about the spam list. Akismet filters every submission, and
 * a false positive is invisible: the person is simply absent, the draw still
 * succeeds, and the ring is short one participant with nothing to indicate
 * why. Printing the held-back count on every run makes that failure mode
 * something the organiser trips over rather than discovers on reveal day.
 */
async function fromNetlifyForms(latestWins: boolean): Promise<ParticipantInput[]> {
  const siteId = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;

  if (!siteId || !token) {
    throw new Error(
      "Reading Netlify Forms needs both NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN."
    );
  }

  const submissions = await fetchSubmissions(siteId, token);
  const entries: SignupEntry[] = toSignupEntries(submissions);
  console.log(`Fetched ${entries.length} verified sign-ups from Netlify Forms.`);

  const spam = await fetchSubmissions(siteId, token, { state: "spam" });
  if (spam.length > 0) {
    console.warn(
      `\n⚠  ${spam.length} submission(s) are sitting in the spam list and are ` +
        "NOT included below.\n" +
        "   Short answers from a burst of people look like spam to Akismet, so " +
        "check these before drawing —\n" +
        "   a wrongly-filtered person is simply missing from the ring with no " +
        "other symptom.\n" +
        "   Review at: Netlify UI > Forms > santa-signup > Spam, and mark any " +
        "real ones as verified.\n"
    );
    for (const submission of spam) {
      console.warn(`   held back: ${submission.data?.name ?? "(no name)"} — ${submission.created_at}`);
    }
    console.warn("");
  }

  const { inputs, superseded } = dedupeSignups(entries, { latestWins });
  for (const note of superseded) {
    console.log(`Superseded duplicate sign-up: ${note}`);
  }

  return inputs;
}

/**
 * Turns every sign-up's two card names into real commanders.
 *
 * Reports every bad pick at once rather than dying on the first. The organiser
 * has to go back to the people involved to fix these, and finding out about
 * the second name only after chasing the first turns one round trip into
 * several.
 */
async function resolveEverySelfPick(
  inputs: ParticipantInput[]
): Promise<Map<string, [CommanderPick, CommanderPick]>> {
  console.log("Fetching the commander pool to check the card picks…");
  const pool = await fetchCommanderPool();

  const resolved = new Map<string, [CommanderPick, CommanderPick]>();
  const problems: string[] = [];

  for (const input of inputs) {
    try {
      resolved.set(input.name, resolveSelfCards(input, pool));
    } catch (error) {
      problems.push(`  - ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `${problems.length} sign-up(s) name a card that cannot be used:\n` +
        `${problems.join("\n")}\n\n` +
        "Fix the submissions (Netlify UI > Forms > santa-signup, or the CSV) " +
        "and run the draw again. Nothing has been written."
    );
  }

  console.log(`Checked ${inputs.length * 2} commander choices against the pool.`);
  return resolved;
}

/**
 * Usage: see USAGE.
 *
 * Refuses to overwrite an existing draw without --force: rerunning reshuffles
 * everyone, invalidating links already sent out.
 */
export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  const flags = args.filter((arg) => arg.startsWith("--"));
  const paths = args.filter((arg) => !arg.startsWith("--"));
  checkArguments(flags, paths);

  const [path] = paths;
  const useForms = flags.includes("--from=netlify-forms");
  const useDatabase = !useForms && !path;
  /**
   * A rehearsal unless `--yes` is given.
   *
   * The safe direction is the default because the unsafe one cannot be typed
   * by accident. `npm run draw --yes`, with the `--` separator missing, hands
   * the flag to npm instead of the script — so a slip costs a rehearsal rather
   * than a ring that reshuffles everyone and invalidates every link already
   * sent. `--dry-run` is still accepted and means the same as saying nothing.
   *
   * `npm run forget` has worked this way from the start. This is the more
   * destructive of the two.
   */
  const dryRun = !flags.includes("--yes");

  if (useForms && path) {
    throw new Error(
      `Cannot read from both Netlify Forms and "${path}" — pick one source.\n${USAGE}`
    );
  }

  console.log(describeTarget());

  const existing = await readEvent();
  if (existing.participants.length > 0 && !flags.includes("--force") && !dryRun) {
    throw new Error(
      `A draw already exists with ${existing.participants.length} participants. ` +
        "Re-running reshuffles everyone and breaks links already sent. " +
        "Use scripts/update-participant.ts to fix details, or pass --force to redraw."
    );
  }
  // A rehearsal writes nothing, so an existing draw is no reason to refuse it
  // — but it is a reason to say that what follows is not that draw.
  if (existing.participants.length > 0 && dryRun) {
    console.log(
      `\nNote: a draw already exists with ${existing.participants.length} participants. ` +
        "This rehearsal builds a fresh ring with fresh tokens and leaves that one alone.\n"
    );
  }

  let drawInputs: DrawInput[];
  if (useDatabase) {
    drawInputs = await fromDatabase(
      flags.includes("--latest-wins"),
      flags.includes("--ignore-unrecorded")
    );
  } else {
    // The two import paths carry card *names*, so they still have to be
    // resolved here. Before anything is written: a bad name should fail the
    // run, not leave a drawn event whose pools cannot be filled.
    const inputs = useForms
      ? await fromNetlifyForms(flags.includes("--latest-wins"))
      : toParticipantInputs(parseCsv(await readFile(path, "utf8")));
    const resolved = await resolveEverySelfPick(inputs);
    drawInputs = inputs.map((input) => ({ input, cards: resolved.get(input.name)! }));
  }

  if (drawInputs.length < MINIMUM_PARTICIPANTS) {
    throw new Error(
      `Need at least ${MINIMUM_PARTICIPANTS} participants to draw; found ${drawInputs.length}. ` +
        "Each person's shortlist is four unique cards taken from their pool " +
        "minus their deck builder's own contribution, which leaves exactly as " +
        "many cards as there are participants — so fewer than " +
        `${MINIMUM_PARTICIPANTS} can never unlock the exchange.`
    );
  }

  const people = drawInputs.map((entry) => ({ ...entry, id: randomUUID() }));
  const assignments = drawAssignments(
    people.map((person) => ({ id: person.id, name: person.input.name })),
    cryptoRng
  );

  const participants: Participant[] = people.map((person) => ({
    id: person.id,
    name: person.input.name,
    email: person.input.email,
    recipientId: assignments.get(person.id)!,
    token: mintToken(),
    colorVeto: person.input.colorVeto,
    themeVeto: person.input.themeVeto,
    themeWish: person.input.themeWish,
    // Not collected at sign-up: the organiser fills it in on the console once
    // they know who is playing. See `Participant.discord`.
    discord: null,
    exchangeRanking: person.input.exchangeRanking,
    selfCards: person.cards,
  }));

  const event: EventData = { participants, revealedAt: null };

  if (dryRun) {
    reportRehearsal(participants);
    return;
  }

  await writeEvent(event);

  const base = process.env.SITE_URL ?? "http://localhost:3000";
  console.log(`\nDrew ${participants.length} participants.\n`);
  console.log(
    "Send each link privately — anyone holding one can see that assignment.\n"
  );
  for (const p of participants) {
    console.log(`${p.name}\t${base}/s/${p.token}`);
  }
}

/**
 * What a rehearsal reports.
 *
 * **The example ring is shown, and spoils nothing.** The real run prints no
 * assignments because whoever runs it is playing too — but that reasoning does
 * not carry over here. A rehearsal mints fresh ids and shuffles again with
 * `cryptoRng`, so the ring below is thrown away and the real draw produces an
 * independent one. Knowing this example tells you nothing about that.
 *
 * It is worth showing precisely because it is the output nobody can check any
 * other way: that the cycle closes, that nobody has themselves, that the names
 * are the people you expect. The label says plainly that it is discarded, so
 * it cannot be mistaken for the real pairing later.
 *
 * **Tokens stay out.** Those are minted fresh too, so printing them would put
 * link-shaped strings that lead nowhere in front of somebody about to send
 * links out.
 */
function reportRehearsal(participants: Participant[]): void {
  console.log(`\nRehearsal — nothing has been written.\n`);
  console.log(`  ${participants.length} participants would be drawn:`);
  for (const person of [...participants].sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`    ${person.name} <${person.email}>`);
  }

  // The same validation the reveal page runs. Throws if the derangement is not
  // one complete cycle.
  const ring = buildRing(participants);
  console.log(
    `\n  Ring: a single closed cycle across ${ring.steps.length} people.\n`
  );
  for (const step of ring.steps) {
    console.log(`    ${step.from} builds for ${step.to}`);
  }
  console.log(
    "\n  That pairing is an EXAMPLE and is discarded with this run. The real\n" +
      "  draw shuffles again from scratch and will not produce it — so this is\n" +
      "  safe to look at even though you are playing. Tokens are not printed:\n" +
      "  these are throwaway too, and link-shaped strings that lead nowhere are\n" +
      "  no use to somebody about to send links out."
  );
  console.log(
    "\nTo draw for real:  npm run draw -- --yes\n" +
      "That mints the tokens, writes the event, and prints one private link\n" +
      "per person. The `--` matters: without it npm keeps the flag and you get\n" +
      "another rehearsal.\n"
  );
}

const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
    process.argv[1].endsWith("scripts/draw.ts") ||
    process.argv[1].endsWith("draw.ts"));

if (isDirectRun && process.env.NODE_ENV !== "test") {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
