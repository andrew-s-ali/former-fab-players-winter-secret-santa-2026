import { SIGNUP_FIELDS } from "#lib/signup";
import type { FormSubmission } from "#scripts/netlify-forms";

/**
 * Compares what Netlify Forms holds against what reached the database.
 *
 * There are two ways a real sign-up can vanish between the form and the draw,
 * and neither leaves a trace where anybody would look:
 *
 * - Akismet flags it. It lands in the spam list, the submitter sees success,
 *   and nothing downstream ever mentions it. Short answers arriving in a burst
 *   from one friend group look a lot like spam.
 * - `signup-submitted` throws. Platform-event functions run in the background,
 *   so the submitter still sees success; if the retries also fail — Scryfall
 *   down, a card renamed out of the pool — no row is ever written.
 *
 * Either way the person is simply absent, the draw succeeds, and the ring is
 * quietly one short. This is the only thing that looks.
 */

export type ReconcileReport = {
  /** Verified submissions with no matching row: the function never recorded them. */
  unrecorded: { name: string; submittedAt: string }[];
  /** Submissions Akismet held back, which nobody sees unless they go looking. */
  heldAsSpam: { name: string; submittedAt: string }[];
  /** Rows with no verified submission behind them, e.g. one deleted since. */
  unmatched: string[];
};

function nameOf(submission: FormSubmission): string {
  return (submission.data?.[SIGNUP_FIELDS.name] ?? "").trim();
}

function key(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Matched by name, case-insensitively.
 *
 * Names are already required to be unique — `update-participant` looks people
 * up by them — and it is the only field both sides reliably share: the row's
 * timestamp records when the function ran, not when the form was submitted.
 * Somebody resubmitting to fix a typo collapses to one entry, which is right:
 * the question here is whether a person is represented at all.
 */
export function reconcileSignups({
  verified,
  spam,
  storedNames,
}: {
  verified: FormSubmission[];
  spam: FormSubmission[];
  storedNames: string[];
}): ReconcileReport {
  const stored = new Set(storedNames.map(key));
  const seen = new Set<string>();

  const unrecorded: ReconcileReport["unrecorded"] = [];
  for (const submission of verified) {
    const name = nameOf(submission);
    seen.add(key(name));
    // A nameless submission cannot be matched either way; `normalizeSignup`
    // will reject it loudly at import, so it is not reported twice here.
    if (name !== "" && !stored.has(key(name))) {
      unrecorded.push({ name, submittedAt: submission.created_at });
    }
  }

  return {
    unrecorded,
    heldAsSpam: spam.map((submission) => ({
      name: nameOf(submission) || "(no name)",
      submittedAt: submission.created_at,
    })),
    unmatched: storedNames.filter((name) => !seen.has(key(name))),
  };
}

/** True when nothing needs the organiser's attention. */
export function isClean(report: ReconcileReport): boolean {
  return (
    report.unrecorded.length === 0 &&
    report.heldAsSpam.length === 0 &&
    report.unmatched.length === 0
  );
}

/** The report as lines to print, most serious first. Empty when clean. */
export function describeReconciliation(report: ReconcileReport): string[] {
  const lines: string[] = [];

  if (report.unrecorded.length > 0) {
    lines.push(
      `⚠  ${report.unrecorded.length} verified sign-up(s) never reached the database.`,
      "   Netlify Forms accepted them but signup-submitted did not record them —",
      "   check the function log for that deploy. Drawing now leaves these people",
      "   out of the ring permanently, and re-drawing invalidates every link.",
      ...report.unrecorded.map((s) => `   missing: ${s.name} — submitted ${s.submittedAt}`),
      ""
    );
  }

  if (report.heldAsSpam.length > 0) {
    lines.push(
      `⚠  ${report.heldAsSpam.length} submission(s) are sitting in the spam list.`,
      "   Short answers from a burst of people look like spam to Akismet, and a",
      "   wrongly-filtered person is simply missing with no other symptom.",
      "   Review at: Netlify UI > Forms > santa-signup > Spam, mark any real ones",
      "   as verified, and run the draw again.",
      ...report.heldAsSpam.map((s) => `   held back: ${s.name} — ${s.submittedAt}`),
      ""
    );
  }

  if (report.unmatched.length > 0) {
    lines.push(
      `ℹ  ${report.unmatched.length} row(s) in the database have no verified submission behind them.`,
      "   Usually a submission deleted or re-flagged as spam after it was recorded.",
      "   They will still be drawn.",
      ...report.unmatched.map((name) => `   unmatched: ${name}`),
      ""
    );
  }

  return lines;
}
