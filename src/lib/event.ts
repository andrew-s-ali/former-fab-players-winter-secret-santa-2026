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
