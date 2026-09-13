import type { ExchangeMessageKind } from "#lib/announce";
import { EVENT_TIME_ZONE, instantOf } from "#lib/launch";

/**
 * Which exchange reminder is due, if any.
 *
 * The counterpart to `signup-reminder.ts`, for the other half of the calendar:
 * that one counts down to sign-ups closing, this one counts down to the day
 * itself. Same shape deliberately — a keyed milestone plus a set of keys
 * already posted — because the property that matters is the same, that each
 * thing is said once however often the schedule runs.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days before the exchange that get a message of their own. */
export const URGENT_THRESHOLDS = [14, 7] as const;

/**
 * The routine fortnightly series does not begin before this.
 *
 * The date was announced on 13 September 2026, and the cadence's own parity
 * put a fortnightly reminder on the 14th — the very next morning, repeating
 * what everybody had just read. Nudging the parity instead would have moved
 * every later Monday as well; this drops the one message that the
 * announcement already covered and leaves the rest where they were.
 *
 * Only the fortnightly series is held back. A threshold message is about the
 * day getting close, and would still be said even if it landed here.
 */
export const FORTNIGHTLY_FROM = "2026-09-15";

export type ExchangeReminder = {
  key: string;
  kind: Exclude<ExchangeMessageKind, "announcement">;
  daysLeft: number;
};

/** The weekday where the group lives, not where the server is. */
function weekdayInEventZone(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    timeZone: EVENT_TIME_ZONE,
  }).format(now);
}

/** The event-zone calendar date, for keying one message per day. */
function dayInEventZone(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: EVENT_TIME_ZONE,
  }).format(now);
}

/**
 * The reminder due now, or null for a quiet day.
 *
 * Ordered by urgency, closest first, so a Monday that is also the one-week
 * mark says the urgent thing rather than the routine one.
 *
 * The thresholds are `<=` rather than `===` for the same reason the sign-up
 * ones are: a scheduled function that misses its day must still say the thing,
 * a day late, instead of skipping the milestone in silence. Keys make that
 * safe — a late one still only fires once.
 */
export function currentExchangeReminder(
  now: Date,
  exchangeAt: string | null
): ExchangeReminder | null {
  if (exchangeAt === null) {
    return null;
  }

  const daysLeft = Math.ceil((instantOf(exchangeAt) - now.getTime()) / DAY_MS);
  if (daysLeft <= 0) {
    // The day has come. Nothing more to count down to, and a reminder posted
    // after the exchange is just noise about something that already happened.
    return null;
  }

  if (daysLeft === 1) {
    return { key: `eve@${exchangeAt}`, kind: "eve", daysLeft };
  }
  for (const threshold of [...URGENT_THRESHOLDS].sort((a, b) => a - b)) {
    if (daysLeft <= threshold) {
      return {
        key: `days-${threshold}@${exchangeAt}`,
        kind: threshold === 7 ? "one-week" : "two-weeks",
        daysLeft,
      };
    }
  }

  /*
    Otherwise: every second Monday.

    The parity is counted from the exchange rather than from the first message,
    so the cadence lands on the same Mondays no matter when the series started
    or whether a run was missed. Keyed by the date so a retry on the same
    Monday cannot post twice.
  */
  if (
    now.getTime() < instantOf(FORTNIGHTLY_FROM) ||
    weekdayInEventZone(now) !== "Monday" ||
    Math.floor(daysLeft / 7) % 2 !== 0
  ) {
    return null;
  }
  return { key: `fortnight@${dayInEventZone(now)}`, kind: "fortnight", daysLeft };
}

export type ExchangeReminderState = { postedKeys: string[] };

/** Whether this milestone still needs saying. */
export function shouldPostExchangeReminder(
  reminder: ExchangeReminder,
  state: ExchangeReminderState | null
): boolean {
  return !(state?.postedKeys ?? []).includes(reminder.key);
}

/**
 * Whether this one is worth a role ping.
 *
 * All of them are: each is addressed to the players and says something with a
 * date attached. Kept as a named decision rather than a literal `true` at the
 * call site, so the day somebody wants the fortnightly one to go quietly,
 * there is an obvious place to say so.
 */
export function pingsRole(): boolean {
  return true;
}
