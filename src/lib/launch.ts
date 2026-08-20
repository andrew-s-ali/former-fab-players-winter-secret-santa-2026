const DAY_MS = 86_400_000;

/** Start of the given day, UTC. */
function startOf(day: string): number {
  return new Date(`${day}T00:00:00Z`).getTime();
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
  return opensAt !== null && now.getTime() >= startOf(opensAt);
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
  return Math.max(0, Math.ceil((startOf(opensAt) - now.getTime()) / DAY_MS));
}

/** Renders a `YYYY-MM-DD` event date as "17 September 2026". */
export function formatEventDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
