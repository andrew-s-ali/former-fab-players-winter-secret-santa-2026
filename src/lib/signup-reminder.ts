import { instantOf, formatDeadline } from "#lib/launch";

/**
 * Reminding the group that sign-ups are open, and then that they are closing.
 *
 * Deliberately **milestone-driven rather than periodic**. The window is
 * sixteen days; a daily post would be muted by day three, and a muted channel
 * is worse than a quiet one on the day it finally matters. So this fires a
 * handful of times at points where the news has actually changed, and says
 * nothing in between.
 *
 * Pure: deciding *whether* to post and *what to say* needs neither Discord nor
 * a database, and those are the parts worth testing.
 */

const DAY_MS = 86_400_000;

/**
 * Days-remaining marks that get a post.
 *
 * Chosen with the organiser for a **seven-day** window: an opening
 * announcement, then nudges at five and three days left, and a last call on
 * the final day. Roughly every other day, which is as often as a channel will
 * tolerate over a week.
 *
 * These have to stay inside the window to fire at all — a threshold larger
 * than the whole window is simply never the current milestone, and one equal
 * to it would collide with the opening announcement.
 */
export const REMINDER_THRESHOLDS = [5, 3, 1] as const;

export type SignupReminder = {
  /** Stable id, recorded so each milestone posts exactly once. */
  key: string;
  kind: "opening" | "countdown" | "final";
  /** Whole days left, rounded up. */
  daysLeft: number;
};

/**
 * Which milestones are worth an `@here`.
 *
 * The two that carry news somebody could act on and then miss: the event
 * opening, and the last call. The midweek nudges go out unpinged — four
 * channel-wide alerts in seven days is how a bot gets muted, and a muted bot
 * is silent on the last day too.
 */
export function alertsChannel(reminder: SignupReminder): boolean {
  return reminder.kind === "opening" || reminder.kind === "final";
}

/**
 * Which milestone `now` falls in, or null for "say nothing".
 *
 * Null before sign-ups open and once they have closed — a reminder to sign up
 * for something that is not open, or is over, is worse than silence.
 *
 * The milestone is the *smallest* threshold still ahead of `daysLeft`, so a
 * cron that misses a day reports where things actually stand rather than
 * replaying a stale mark: at nine days left it is still the "ten days" post,
 * and at three it is the "three days" one.
 */
export function currentReminder(
  now: Date,
  { opensAt, closesAt }: { opensAt: string | null; closesAt: string }
): SignupReminder | null {
  if (opensAt === null || now.getTime() < instantOf(opensAt)) {
    return null;
  }
  const remaining = instantOf(closesAt) - now.getTime();
  if (remaining <= 0) {
    return null;
  }

  const daysLeft = Math.ceil(remaining / DAY_MS);
  const threshold = [...REMINDER_THRESHOLDS]
    .sort((left, right) => left - right)
    .find((candidate) => candidate >= daysLeft);

  if (threshold === undefined) {
    // More time left than any threshold covers: the opening announcement.
    return { key: "opening", kind: "opening", daysLeft };
  }
  return {
    key: `days-${threshold}`,
    kind: threshold === Math.min(...REMINDER_THRESHOLDS) ? "final" : "countdown",
    daysLeft,
  };
}

/**
 * What to post.
 *
 * `signupCount` is null when the database could not be read. The reminder
 * still goes out without it — the deadline is the point of the message, and a
 * database blip is a poor reason to let it pass in silence.
 */
export function reminderMessage(
  reminder: SignupReminder,
  {
    signupCount,
    closesAt,
    url,
  }: { signupCount: number | null; closesAt: string; url?: string | null }
): string {
  const deadline = formatDeadline(closesAt);
  // The home page, not /signup. It stops being a splash on opening day and
  // becomes the rules, the ban list and the sign-up link — so it is the one
  // address that answers "what is this?" as well as "where do I join?".
  const signUp = url ? `\nRules and sign-up: ${url}` : "";

  const soFar =
    signupCount === null
      ? ""
      : signupCount === 0
        ? "\nNobody has signed up yet — be the first."
        : `\n${signupCount} ${signupCount === 1 ? "person has" : "people have"} signed up so far.`;

  if (reminder.kind === "opening") {
    return (
      `@here 🎁 **Welcome to the Winter 2026 Exchange**\n\n` +
      // Mind the spaces at these joins: adjacent template strings concatenate
      // with nothing between them, so a line ending mid-sentence needs its own
      // trailing space or the words run together.
      `Following having feedback from _most_ members I have kept a similar ` +
      `style of selecting format, but also have a these this time.\n\n` +
      `The theme is **Uncommon Legendaries Only**\n\n` +
      `Find more _updated_ rules on the site, and let's use this site as our ` +
      `event portal. ` +
      // `deadline` already reads "midnight on 8 September 2026", so "closes"
      // rather than "closes on".
      `Signups closes ${deadline} (US Eastern).${soFar}${signUp}`
    );
  }

  if (reminder.kind === "final") {
    return (
      `@here ⏳ **Last chance — Winter 2026 Exchange sign-ups close ${deadline}.**\n\n` +
      `After that the draw runs and the pool is fixed, so there is no adding ` +
      `people later.${soFar}${signUp}`
    );
  }

  return (
    `🎁 **${reminder.daysLeft} days left to sign up for the Winter 2026 Exchange.**\n\n` +
    `Closes ${deadline} (US Eastern).${soFar}${signUp}`
  );
}

/** Which milestones have already been posted. */
export type ReminderState = { postedKeys: string[] };

/**
 * Whether this milestone still needs posting.
 *
 * Keyed rather than timestamped, so each milestone fires exactly once however
 * often the schedule runs — and a milestone whose window was missed entirely
 * is simply skipped rather than posted late and wrong.
 */
export function shouldPostReminder(
  reminder: SignupReminder | null,
  state: ReminderState | null
): boolean {
  return reminder !== null && !(state?.postedKeys ?? []).includes(reminder.key);
}
