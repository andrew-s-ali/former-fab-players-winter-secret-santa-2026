import { readFile } from "node:fs/promises";
import { randomInt, randomUUID } from "node:crypto";
import { drawAssignments } from "#lib/draw";
import type { EventData, Participant } from "#lib/participants";
import { dedupeSignups, type ParticipantInput, type SignupEntry } from "#lib/signup";
import { writeEvent, readEvent, describeTarget } from "#lib/store";
import { mintToken } from "#lib/tokens";
import { parseCsv, toParticipantInputs } from "#scripts/csv";
import { fetchSubmissions, toSignupEntries } from "#scripts/netlify-forms";

/** Crypto-backed float in [0, 1) — the spec requires the real draw not use Math.random. */
const cryptoRng = () => randomInt(2 ** 30) / 2 ** 30;

const USAGE =
  "Usage:\n" +
  "  npm run draw -- <responses.csv> [--force]\n" +
  "  npm run draw -- --from=netlify-forms [--latest-wins] [--force]";

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
 * Usage: see USAGE.
 *
 * Refuses to overwrite an existing draw without --force: rerunning reshuffles
 * everyone, invalidating links already sent out.
 */
async function main() {
  const args = process.argv.slice(2);
  const flags = args.filter((arg) => arg.startsWith("--"));
  const [path] = args.filter((arg) => !arg.startsWith("--"));
  const useForms = flags.includes("--from=netlify-forms");

  if (!useForms && !path) {
    throw new Error(USAGE);
  }
  if (useForms && path) {
    throw new Error(
      `Cannot read from both Netlify Forms and "${path}" — pick one source.\n${USAGE}`
    );
  }

  console.log(describeTarget());

  const existing = await readEvent();
  if (existing.participants.length > 0 && !flags.includes("--force")) {
    throw new Error(
      `A draw already exists with ${existing.participants.length} participants. ` +
        "Re-running reshuffles everyone and breaks links already sent. " +
        "Use scripts/update-participant.ts to fix details, or pass --force to redraw."
    );
  }

  const inputs = useForms
    ? await fromNetlifyForms(flags.includes("--latest-wins"))
    : toParticipantInputs(parseCsv(await readFile(path, "utf8")));

  if (inputs.length < 2) {
    throw new Error(
      `Need at least 2 participants to draw; found ${inputs.length}.`
    );
  }

  const people = inputs.map((input) => ({ ...input, id: randomUUID() }));
  const assignments = drawAssignments(people, cryptoRng);

  const participants: Participant[] = people.map((person) => ({
    id: person.id,
    name: person.name,
    recipientId: assignments.get(person.id)!,
    token: mintToken(),
    colorVeto: person.colorVeto,
    themeVeto: person.themeVeto,
    themeWish: person.themeWish,
  }));

  const event: EventData = { participants, revealedAt: null };
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
