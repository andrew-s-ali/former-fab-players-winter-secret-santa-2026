/**
 * Single source of truth for the event's public details.
 *
 * Everything here is copy the organiser may want to change without touching
 * components. Draw logic, participants, and storage deliberately live
 * elsewhere — see docs/superpowers/specs for what is still undecided.
 */
export const EVENT = {
  year: 2026,
} as const;

/**
 * The event's public address.
 *
 * Netlify injects `URL` on a production deploy and that wins, so this is the
 * fallback — but it is a real value rather than a placeholder, because the CLI
 * and any dry run happen off-platform where `URL` is unset, and a preview that
 * silently drops the link is a poor rehearsal for a message whose whole job is
 * to carry one.
 */
export const SITE_URL = "https://former-fab-players-winter-exchange-26.netlify.app";

/**
 * The event's name, everywhere it is named: the browser title, every heading,
 * the reveal-day export and every Discord message.
 *
 * A function rather than a constant because the year sits in the *middle* of
 * the name, so it cannot be assembled by appending `EVENT.year` to a prefix —
 * and the year is still wanted on its own elsewhere.
 *
 * One place to change it, which is the point: this used to be spelled three
 * different ways — "Former Fab Players Winter Secret Santa 2026" on the site,
 * "Winter Secret Santa 2026" in the reveal export, and "Winter 2026 Exchange"
 * in the bot — so somebody reading the announcement and then opening the site
 * saw two different events.
 */
export function eventTitle(): string {
  return `Winter Secret Santa ${EVENT.year} Exchange`;
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

/**
 * When sign-ups close: midnight Eastern as the 8th begins, so the last full
 * day to sign up is the 7th. Seven days from opening, exactly.
 *
 * Same two forms as `SIGNUPS_OPEN_AT`, and an instant for the same reason: as
 * a bare `"2026-09-08"` this would close at midnight **UTC**, which is 8pm
 * Eastern on the 7th — while `/signup` told people they had until the 8th.
 */
export const SIGNUPS_CLOSE_AT = "2026-09-08T04:00:00Z";

/**
 * When picking commanders for other people stops being expected.
 *
 * **Advisory, not enforced.** The exchange still unlocks only when everybody
 * has picked for everybody — that rule is the point, and the group would
 * rather chase each other than have a deadline quietly decide the pools. This
 * date is what the site tells people to aim for and what the Discord nudge
 * counts down to; nothing refuses a pick after it.
 *
 * Midnight Eastern as the 22nd begins, i.e. the **end of the 21st**, so the
 * 21st is a full working day and the building period runs from the 22nd.
 */
export const WORKSHOP_CLOSE_AT = "2026-09-22T04:00:00Z";

/** The exchange will be one of these; the group has not chosen yet. */
export const EXCHANGE_CANDIDATES = ["2026-12-05", "2026-12-12", "2026-12-19"] as const;

/**
 * Set to the agreed exchange date to turn on the second countdown.
 *
 * Deliberately not validated against EXCHANGE_CANDIDATES — plans change, and
 * the site should not refuse a date the group actually settled on.
 */
export const EXCHANGE_AT: string | null = null;
