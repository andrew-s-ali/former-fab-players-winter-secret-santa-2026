import type { EventData, Participant } from "#lib/participants";

/**
 * Erasing somebody from the event.
 *
 * The sign-up form collects real names and email addresses, and those spread
 * further than they look. By the time an event has run they are in five
 * places, and three of them are places nothing else in this codebase ever
 * touches again:
 *
 * 1. Netlify Forms — the original submission. Outlives everything here,
 *    because deleting our copy does nothing to Netlify's.
 * 2. `signups` — the mirrored row.
 * 3. `event.json` in Blobs — the drawn participant record.
 * 4. **Every `event.backup-*.json` sibling.** `writeEvent` snapshots before
 *    each write and never cleans up, so an event that has been edited a few
 *    times has several complete copies of everyone's address. Deleting
 *    `event.json` alone leaves all of them.
 * 5. `deck_builds.notes` — free text a builder wrote about a named person.
 *
 * `card_selections` and `secret_card_sets` are the exception: random ids and
 * card names, no personal data once the event record they map back to is gone.
 *
 * This module is the written-down version of that list, and it only plans.
 * Nothing here reads or deletes anything — `scripts/forget.ts` executes a plan
 * — so what gets erased is decided by code that can be tested without a
 * database, a Netlify account, or the nerve to run it once and find out.
 */

/** A `signups` row, reduced to what matching needs. */
export type SignupRow = { id: string; name: string };

/** A Netlify Forms submission, reduced to what matching needs. */
export type SubmissionRow = { id: string; name: string; createdAt: string };

export type ForgetTarget =
  /** Wipe the whole event after it has finished. */
  | { everyone: true }
  /**
   * One person. `redact` keeps their place in the ring and blanks the personal
   * fields; without it they are removed outright, which only works before the
   * draw.
   */
  | { everyone?: false; name: string; redact: boolean };

export type ForgetPlan = {
  mode: "delete" | "redact" | "everyone";
  /** Who this is about, spelled as the data spells it. */
  people: string[];
  /** Participants whose event record is blanked in place, by id. */
  redactIds: string[];
  /** Delete `event.json` and every backup snapshot of it. */
  wipeEventStore: boolean;
  /** `signups` rows to delete, by primary key. */
  signupIds: string[];
  /** Delete every `signups` row. */
  wipeSignups: boolean;
  /** Netlify Forms submissions to delete, by id. */
  submissionIds: string[];
  /** `deck_builds` rows to delete, by giver id. */
  deckBuildIds: string[];
  /** Delete every `deck_builds` row. */
  wipeDeckBuilds: boolean;
  /** Delete every `card_selections` and `secret_card_sets` row. */
  wipeSelections: boolean;
  /** Why this cannot run. Non-empty means nothing is executed. */
  refusals: string[];
  /** What survives, and what the operator still has to do by hand. */
  notes: string[];
};

const key = (name: string): string => name.trim().toLowerCase();

/**
 * What a redacted participant looks like.
 *
 * The name, id, token, assignment and pool cards all stay. Every one of them
 * is load-bearing after a draw: the ring is a cycle through the ids, the
 * private link is the token, and the pool cards are already sitting in four
 * other people's shortlists. Blanking them would not anonymise this person, it
 * would break somebody else's page.
 *
 * So what goes is what is actually theirs and actually identifying: the
 * address, the Discord account, and the two free-text answers they wrote.
 */
export function redactParticipant(participant: Participant): Participant {
  return {
    ...participant,
    email: "",
    themeVeto: null,
    themeWish: null,
    discord: null,
  };
}

/** True once `redactParticipant` has been through this record. */
export function isRedacted(participant: Participant): boolean {
  return participant.email === "";
}

function empty(mode: ForgetPlan["mode"]): ForgetPlan {
  return {
    mode,
    people: [],
    redactIds: [],
    wipeEventStore: false,
    signupIds: [],
    wipeSignups: false,
    submissionIds: [],
    deckBuildIds: [],
    wipeDeckBuilds: false,
    wipeSelections: false,
    refusals: [],
    notes: [],
  };
}

/**
 * Decides what erasing someone would touch, without touching it.
 *
 * `submissions` is `null` rather than empty when Netlify Forms could not be
 * checked. The distinction matters more than it looks: an empty list means
 * "nothing of theirs is in Forms", `null` means "the copy that outlives
 * everything else here was never looked at", and only one of those deserves a
 * warning.
 */
export function planForget({
  event,
  signups,
  submissions,
  target,
}: {
  event: EventData;
  signups: SignupRow[];
  submissions: SubmissionRow[] | null;
  target: ForgetTarget;
}): ForgetPlan {
  return target.everyone
    ? planEveryone({ event, signups, submissions })
    : planPerson({ event, signups, submissions, target });
}

/**
 * The post-event wipe.
 *
 * Whole tables rather than a list of ids, so a row belonging to somebody who
 * was never drawn — a withdrawn sign-up, a stale selection from a redraw —
 * goes too. The point of this mode is that nothing is left, and per-id
 * deletion can only remove what the current event still knows about.
 */
function planEveryone({
  event,
  signups,
  submissions,
}: {
  event: EventData;
  signups: SignupRow[];
  submissions: SubmissionRow[] | null;
}): ForgetPlan {
  const plan = empty("everyone");
  plan.people = event.participants.map((participant) => participant.name);
  plan.wipeEventStore = true;
  plan.wipeSignups = signups.length > 0;
  plan.wipeDeckBuilds = true;
  plan.wipeSelections = true;
  plan.submissionIds = (submissions ?? []).map((submission) => submission.id);

  plan.notes.push(
    "Every private link stops working: the tokens are in event.json and nowhere else.",
    "There is no undo — the backups are part of what this deletes."
  );
  plan.notes.push(...formsNote(submissions));
  return plan;
}

function planPerson({
  event,
  signups,
  submissions,
  target,
}: {
  event: EventData;
  signups: SignupRow[];
  submissions: SubmissionRow[] | null;
  target: Extract<ForgetTarget, { name: string }>;
}): ForgetPlan {
  const plan = empty(target.redact ? "redact" : "delete");
  const wanted = key(target.name);

  const participant =
    event.participants.find((candidate) => key(candidate.name) === wanted) ?? null;
  const matchedSignups = signups.filter((row) => key(row.name) === wanted);
  const matchedSubmissions = (submissions ?? []).filter(
    (row) => key(row.name) === wanted
  );

  plan.people = [participant?.name ?? matchedSignups[0]?.name ?? target.name];
  plan.signupIds = matchedSignups.map((row) => row.id);
  plan.submissionIds = matchedSubmissions.map((row) => row.id);

  if (
    !participant &&
    matchedSignups.length === 0 &&
    matchedSubmissions.length === 0
  ) {
    plan.refusals.push(
      `Nothing found for "${target.name}". ` +
        (event.participants.length > 0
          ? `Drawn participants: ${event.participants
              .map((candidate) => candidate.name)
              .join(", ")}.`
          : "No draw has run, and no sign-up matches that name.") +
        (submissions === null
          ? " Netlify Forms was not checked — see the note below."
          : "")
    );
    plan.notes.push(...formsNote(submissions));
    return plan;
  }

  if (participant) {
    // Their id is the giver key for the notes and the recipient key for
    // somebody else's shortlist, so it is reachable either way.
    plan.deckBuildIds = [participant.id];
  }

  if (participant && !target.redact) {
    const giver = event.participants.find(
      (candidate) => candidate.recipientId === participant.id
    );
    plan.refusals.push(
      `${participant.name} has already been drawn, so they cannot simply be ` +
        "removed: the ring is a single cycle, and dropping one person leaves " +
        `${giver ? giver.name : "whoever draws them"} with nobody to build for ` +
        "and this person's cards still sitting in everyone else's pools.\n" +
        "  Re-run the draw without them if the exchange has not started " +
        "(everyone gets a new link), or pass --redact to blank their personal " +
        "details and leave the ring intact."
    );
    return plan;
  }

  if (participant) {
    plan.redactIds = [participant.id];
    plan.notes.push(
      `${participant.name}'s name, private link, assignment and two pool cards stay — ` +
        "the ring and other people's shortlists are built from them.",
      "If the name has to go too, the only honest answer is --everyone once the " +
        "exchange has finished."
    );
  } else {
    plan.notes.push(
      "They are not in a drawn event, so nothing but the sign-up needs removing. " +
        "Run this before the draw and they are simply never included."
    );
  }

  plan.notes.push(
    "card_selections and secret_card_sets are left alone: random ids and card " +
      "names, which identify nobody once the event record is gone."
  );
  plan.notes.push(...formsNote(submissions));
  return plan;
}

/**
 * The Netlify Forms caveat.
 *
 * Worth its own function because it is the failure that would make the rest of
 * this theatre: every other copy could be deleted perfectly and the original
 * submission, with the address in it, would still be sitting in the dashboard.
 */
function formsNote(submissions: SubmissionRow[] | null): string[] {
  if (submissions === null) {
    return [
      "⚠  Netlify Forms was NOT checked — NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN " +
        "are not both set.",
      "   The original submission still holds their name and email, and it " +
        "outlives everything this script can reach.",
      "   Delete it by hand at: Netlify UI > Forms > santa-signup (check the " +
        "Spam list too).",
    ];
  }
  return [];
}

/** The plan as lines to print. Refusals first — they stop the run. */
export function describePlan(plan: ForgetPlan): string[] {
  const lines: string[] = [];

  for (const refusal of plan.refusals) {
    lines.push(`✖  ${refusal}`, "");
  }
  if (plan.refusals.length > 0) {
    lines.push(...plan.notes.map((note) => `   ${note}`));
    return lines;
  }

  lines.push(
    plan.mode === "everyone"
      ? `Erasing every trace of the event (${plan.people.length} participant(s)):`
      : `${plan.mode === "redact" ? "Redacting" : "Deleting"} ${plan.people.join(", ")}:`
  );

  const steps: string[] = [];
  if (plan.redactIds.length > 0) {
    steps.push(
      "blank email, Discord handle, theme veto and theme wish for " +
        `${plan.redactIds.length} participant(s) in event.json`
    );
  }
  if (plan.wipeEventStore) {
    steps.push("delete event.json and every event.backup-*.json snapshot");
  }
  if (plan.wipeSignups) {
    steps.push("delete every row in signups");
  } else if (plan.signupIds.length > 0) {
    steps.push(`delete ${plan.signupIds.length} row(s) from signups`);
  }
  if (plan.wipeDeckBuilds) {
    steps.push("delete every row in deck_builds (decklist links and private notes)");
  } else if (plan.deckBuildIds.length > 0) {
    steps.push(
      `delete ${plan.deckBuildIds.length} row(s) from deck_builds (decklist link and private notes)`
    );
  }
  if (plan.wipeSelections) {
    steps.push("delete every row in card_selections and secret_card_sets");
  }
  if (plan.submissionIds.length > 0) {
    steps.push(
      `delete ${plan.submissionIds.length} Netlify Forms submission(s)`
    );
  }

  if (steps.length === 0) {
    lines.push("  (nothing to do — no data matched)");
  }
  lines.push(...steps.map((step) => `  - ${step}`));

  if (plan.notes.length > 0) {
    lines.push("");
    lines.push(...plan.notes.map((note) => `  ${note}`));
  }

  return lines;
}

/** True when the plan can be executed. */
export function isRunnable(plan: ForgetPlan): boolean {
  return plan.refusals.length === 0;
}
