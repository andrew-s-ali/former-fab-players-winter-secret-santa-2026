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
 * Registration opens at the start of this day (UTC).
 *
 * Until then the home page is a splash page: the event is teased, but nothing
 * is on offer yet. Set this to the day you want to open sign-ups — e.g.
 * `export const SIGNUPS_OPEN_AT: string | null = "2026-09-01";` — and the home
 * page switches itself over on the day, with no redeploy needed.
 *
 * `null` means "not announced yet": the splash page stays up and says
 * "soon" instead of counting down.
 */
export const SIGNUPS_OPEN_AT: string | null = null;

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
