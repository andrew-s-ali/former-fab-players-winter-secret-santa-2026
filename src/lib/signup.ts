import { countdownPhase } from "./countdown";
import { EXCHANGE_AT, EXCHANGE_CANDIDATES, SIGNUPS_CLOSE_AT } from "./event";

/**
 * The shape the draw consumes, whatever the source.
 *
 * Canonical home is here rather than in `scripts/csv.ts` because there are now
 * two producers — the CSV importer and the Netlify Forms importer — plus one
 * consumer in the browser (the sign-up form itself needs the colour list).
 * `scripts/csv.ts` re-exports it so the operator scripts read unchanged.
 */
export type ParticipantInput = {
  name: string;
  colorVeto: "W" | "U" | "B" | "R" | "G" | null;
  themeVeto: string | null;
  themeWish: string | null;
};

/**
 * Netlify form name. Must be unique per site, and must match the `name`
 * attribute in `public/__forms.html` exactly — Netlify validates submissions
 * against the registered form and silently drops mismatches.
 */
export const SIGNUP_FORM_NAME = "santa-signup";

/**
 * Where the browser POSTs a sign-up.
 *
 * Deliberately the static skeleton file and not `/`. This is a server-rendered
 * Next.js site, so `POST /` is swallowed by Netlify's `___netlify-server-handler`
 * function and never reaches form processing — the submission appears to
 * succeed and is never recorded.
 */
export const SIGNUP_ACTION = "/__forms.html";

/**
 * Honeypot field. Netlify quietly rejects any submission where it is filled,
 * and such rejections appear in neither the verified nor the spam list.
 */
export const HONEYPOT_FIELD = "bot-field";

/**
 * Field names, shared by the rendered form, the skeleton file and the importer.
 *
 * Every one of those three has to agree, and two of them are files a human
 * edits by hand, so they are named once here and referenced everywhere else.
 */
export const SIGNUP_FIELDS = {
  name: "name",
  colorVeto: "colorVeto",
  themeVeto: "themeVeto",
  themeWish: "themeWish",
} as const;

export const COLOR_CODES: Record<string, ParticipantInput["colorVeto"]> = {
  white: "W",
  blue: "U",
  black: "B",
  red: "R",
  green: "G",
};

/** Colour options in the order the form renders them. */
export const COLOR_CHOICES = [
  { value: "", label: "No preference" },
  { value: "white", label: "White" },
  { value: "blue", label: "Blue" },
  { value: "black", label: "Black" },
  { value: "red", label: "Red" },
  { value: "green", label: "Green" },
] as const;

/** Blank, whitespace, or the literal "no preference" all mean "unset". */
export function blankToNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "" || /^no preference$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/**
 * Turns a colour word into its code.
 *
 * `who` only shapes the error message — an unrecognised colour has to name the
 * person it came from, or the organiser has to grep the submissions by hand.
 */
export function parseColorWord(
  raw: string | null,
  who: string
): ParticipantInput["colorVeto"] {
  if (!raw) {
    return null;
  }

  const code = COLOR_CODES[raw.toLowerCase()] ?? null;
  if (code === null) {
    throw new Error(
      `Unrecognised colour "${raw}" for "${who}". ` +
        `Known colours: ${Object.keys(COLOR_CODES).join(", ")}. ` +
        "Update COLOR_CODES in src/lib/signup.ts to match the form's wording."
    );
  }
  return code;
}

/**
 * Normalises one submission's raw fields.
 *
 * `label` describes where the record came from ("row 4 of the CSV", "the
 * submission from 2026-09-02") so a failure points at something the organiser
 * can actually open and look at.
 */
export function normalizeSignup(
  fields: Record<string, string | undefined>,
  label: string
): ParticipantInput {
  const name = (fields[SIGNUP_FIELDS.name] ?? "").trim();
  if (name === "") {
    throw new Error(`${label} has an empty name.`);
  }

  return {
    name,
    colorVeto: parseColorWord(blankToNull(fields[SIGNUP_FIELDS.colorVeto]), name),
    themeVeto: blankToNull(fields[SIGNUP_FIELDS.themeVeto]),
    themeWish: blankToNull(fields[SIGNUP_FIELDS.themeWish]),
  };
}

/** One normalised sign-up plus when it arrived, for resolving resubmissions. */
export type SignupEntry = {
  input: ParticipantInput;
  /** ISO timestamp. Ordering only — never stored on the participant. */
  submittedAt: string;
};

/**
 * Collapses entries to one per person, case-insensitively by name.
 *
 * Names have to be unique because `update-participant` looks people up by
 * name, not by row. With a CSV that guarantee came from the organiser tidying
 * the export by hand; with a live form it does not, because resubmitting is
 * how someone fixes a typo. So the policy is explicit rather than guessed:
 *
 * - default: fail and name the person, matching the CSV importer's behaviour;
 * - `latestWins`: keep the newest submission per name and report what it
 *   superseded, for the common "Dave signed up twice" case.
 *
 * Two genuinely different people who share a name still have to be told apart
 * by hand ("Dave K."), under either policy.
 */
export function dedupeSignups(
  entries: SignupEntry[],
  { latestWins = false }: { latestWins?: boolean } = {}
): { inputs: ParticipantInput[]; superseded: string[] } {
  const byName = new Map<string, SignupEntry>();
  const superseded: string[] = [];

  for (const entry of entries) {
    const key = entry.input.name.toLowerCase();
    const existing = byName.get(key);

    if (!existing) {
      byName.set(key, entry);
      continue;
    }

    if (!latestWins) {
      throw new Error(
        `Two sign-ups are both named "${entry.input.name}". ` +
          "Names identify people when correcting entries later, so either " +
          'make them distinct (for example "Dave K.") or pass --latest-wins ' +
          "to keep only the most recent submission per name."
      );
    }

    const winner = entry.submittedAt >= existing.submittedAt ? entry : existing;
    const loser = winner === entry ? existing : entry;
    byName.set(key, winner);
    superseded.push(
      `${loser.input.name} (kept ${winner.submittedAt}, dropped ${loser.submittedAt})`
    );
  }

  return { inputs: [...byName.values()].map((e) => e.input), superseded };
}

/**
 * Whether the sign-up form should still accept entries.
 *
 * Derived from the same phase function the home page countdown uses, so the
 * two cannot drift into saying different things about the same day.
 */
export function signupsOpen(now: Date = new Date()): boolean {
  return (
    countdownPhase(now, {
      signupsCloseAt: SIGNUPS_CLOSE_AT,
      exchangeCandidates: EXCHANGE_CANDIDATES,
      exchangeAt: EXCHANGE_AT,
    }).kind === "before-signups"
  );
}
