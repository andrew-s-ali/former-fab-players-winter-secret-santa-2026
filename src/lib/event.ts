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
 * is on offer yet. The home page switches itself over at the start of this
 * day, with no redeploy needed.
 *
 * `null` would mean "not announced yet": the splash page stays up and says
 * "soon" instead of counting down. That is also the fail-safe — an absent
 * date never opens the event by accident.
 */
export const SIGNUPS_OPEN_AT: string | null = "2026-09-04";

/**
 * Sign-ups close at the end of this day — it is the last day someone can
 * sign up, not the first day they cannot. See `countdownPhase`.
 */
export const SIGNUPS_CLOSE_AT = "2026-09-18";

/** The exchange will be one of these; the group has not chosen yet. */
export const EXCHANGE_CANDIDATES = ["2026-12-05", "2026-12-12", "2026-12-19"] as const;

/**
 * Set to the agreed exchange date to turn on the second countdown.
 *
 * Deliberately not validated against EXCHANGE_CANDIDATES — plans change, and
 * the site should not refuse a date the group actually settled on.
 */
export const EXCHANGE_AT: string | null = null;
