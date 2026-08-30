const DAY_MS = 86_400_000;

/**
 * The instant a configured date refers to.
 *
 * Shared with `countdown.ts`: the opening gate and the closing countdown have
 * to agree about what a configured date means, and they did not while only one
 * of them understood a time of day.
 *
 * A bare `YYYY-MM-DD` means the start of that day in UTC, which is all this
 * ever used to accept. A full ISO instant is taken as given, because "the
 * first of September" and "midnight where the group lives" are not the same
 * moment and the organiser cares about the second one: on a UTC-only gate,
 * opening on `2026-09-01` would have flipped the site over at 8pm Eastern on
 * the 31st.
 */
export function instantOf(value: string): number {
  return new Date(value.includes("T") ? value : `${value}T00:00:00Z`).getTime();
}

/**
 * Whether the event has opened for registration.
 *
 * `opensAt` is a parameter rather than a module-level read so both sides of the
 * switch are testable without mocking the clock or the config. A null date
 * means the organiser has not announced one, which is deliberately *not* open:
 * the safe default for a public URL is the splash page.
 */
export function registrationOpen(now: Date, opensAt: string | null): boolean {
  return opensAt !== null && now.getTime() >= instantOf(opensAt);
}

/**
 * Whole days from `now` until registration opens, rounded up.
 *
 * Null when no date has been announced, so the splash page can say "soon"
 * rather than counting down to nothing.
 */
export function daysUntilOpen(now: Date, opensAt: string | null): number | null {
  if (opensAt === null) {
    return null;
  }
  return Math.max(0, Math.ceil((instantOf(opensAt) - now.getTime()) / DAY_MS));
}

/**
 * Renders an event date as "17 September 2026".
 *
 * Accepts the same two forms as the gate. Formatted in UTC, which is right for
 * a bare date and right for an instant chosen as local midnight anywhere west
 * of Greenwich — the case this site has. An instant set from a timezone *ahead*
 * of UTC would land on the previous UTC day and read a day early here; nothing
 * does that today, and the fix would be to format in the event's own zone.
 */
export function formatEventDate(day: string): string {
  return new Date(instantOf(day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The timezone the event's stated times are in. */
export const EVENT_TIME_ZONE = "America/New_York";

/**
 * Renders a closing instant as "midnight on 17 September 2026".
 *
 * Separate from `formatEventDate` because a date alone is genuinely ambiguous
 * at a boundary: "sign-ups close on 17 September" reads as "the 17th is your
 * last day", while the deadline is the *start* of it. Saying the time removes
 * the reading that costs somebody their place.
 */
export function formatDeadline(value: string): string {
  const at = new Date(instantOf(value));
  // Read the clock face in the event's zone rather than pattern-matching the
  // formatted string: locales disagree about whether midnight is "00:00" or
  // "0:00", and the whole point of this function is to be unambiguous.
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: EVENT_TIME_ZONE,
  }).formatToParts(at);
  const part = (type: string) =>
    Number(parts.find((entry) => entry.type === type)?.value ?? "0");
  const hour = part("hour");
  const minute = part("minute");

  const time =
    minute === 0 && hour === 0
      ? "midnight"
      : minute === 0 && hour === 12
        ? "midday"
        : at.toLocaleTimeString("en-GB", {
            hour: "numeric",
            minute: "2-digit",
            timeZone: EVENT_TIME_ZONE,
          });
  const date = at.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: EVENT_TIME_ZONE,
  });
  return `${time} on ${date}`;
}
