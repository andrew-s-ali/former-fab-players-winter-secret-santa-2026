/**
 * Single source of truth for the event's public details.
 *
 * Everything here is copy the organiser may want to change without touching
 * components. Draw logic, participants, and storage deliberately live
 * elsewhere — see docs/superpowers/specs for what is still undecided.
 */
export const EVENT = {
  name: "Former Fab Players Winter Secret Santa",
  year: 2026,
} as const;

/** Display title, e.g. "Former Fab Players Winter Secret Santa 2026". */
export function eventTitle(): string {
  return `${EVENT.name} ${EVENT.year}`;
}

/**
 * When registration opens.
 *
 * Until then the home page is a splash page: the event is teased, but nothing
 * is on offer yet. The home page is rendered per request, so once this is
 * deployed the switch happens on its own — **but setting it is a code change
 * and does need a deploy.**
 *
 * Two accepted forms:
 *   - `"2026-09-01"` — the start of that day in **UTC**.
 *   - `"2026-09-01T04:00:00Z"` — that exact instant.
 *
 * This is the second form because the group is US Eastern and wanted local
 * midnight. September is EDT (UTC-4), so midnight in New York is 04:00 UTC;
 * the bare-date form would have opened the site at 8pm on 31 August. If this
 * is ever moved to a date outside daylight saving, EST is UTC-5 and the
 * equivalent instant is `T05:00:00Z`.
 *
 * `null` means "not announced yet": the splash page stays up and says "soon"
 * instead of counting down.
 */
export const SIGNUPS_OPEN_AT: string | null = "2026-09-01T04:00:00Z";

/** Sign-ups close at the end of this day. */
export const SIGNUPS_CLOSE_AT = "2026-09-17";

/** The exchange will be one of these; the group has not chosen yet. */
export const EXCHANGE_CANDIDATES = ["2026-12-05", "2026-12-12", "2026-12-19"] as const;

/**
 * Set to the agreed exchange date to turn on the second countdown.
 *
 * Deliberately not validated against EXCHANGE_CANDIDATES — plans change, and
 * the site should not refuse a date the group actually settled on.
 */
export const EXCHANGE_AT: string | null = null;
