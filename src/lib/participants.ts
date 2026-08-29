import type { ColorCode } from "./commanders";
import type { CommanderPick } from "./pairing";

export type Participant = {
  id: string;
  name: string;
  /**
   * Personal data, collected at sign-up so the organiser can send this
   * person their private link. Never rendered on a participant-facing page.
   */
  email: string;
  /** The participant this person builds a deck for. */
  recipientId: string;
  /** Secret used in the reveal URL. */
  token: string;
  colorVeto: ColorCode | null;
  themeVeto: string | null;
  themeWish: string | null;
  /**
   * The two commander choices this person seeded their own pool with at
   * sign-up. Either may be a partner pair, which counts as one choice.
   *
   * Resolved from card names by `scripts/draw.ts` and stored here rather than
   * in the `card_selections` table with everyone else's picks. Two reasons:
   * the draw already writes this store and holds no Postgres credentials, so
   * seeding the table would add a second, separately-failing write to the one
   * step that must not half-succeed; and keeping them on the participant lets
   * `update-participant` and the organiser console reach them with the tooling
   * that already exists. `card_selections` therefore holds peer picks only.
   */
  selfCards: [CommanderPick, CommanderPick];
};

/**
 * Fewest participants the exchange can run with.
 *
 * A giver's shortlist is drawn from their recipient's pool minus their own
 * contribution to it: the recipient's two sign-up picks plus one pick from
 * each of the other `n - 2` participants, so `n` cards for `n` participants.
 * Four unique are needed, so three people can never unlock however they pick.
 */
export const MINIMUM_PARTICIPANTS = 4;

export type EventData = {
  participants: Participant[];
  /** ISO timestamp set by the organiser on reveal day; null while locked. */
  revealedAt: string | null;
};

/** True once the organiser has unlocked the public reveal page. */
export function isRevealed(event: EventData): boolean {
  return Boolean(event.revealedAt);
}

/** Finds the participant holding a reveal token, or null. */
export function findByToken(
  event: EventData,
  token: string
): Participant | null {
  return event.participants.find((p) => p.token === token) ?? null;
}

/** Finds a participant by id, or null. */
export function findById(event: EventData, id: string): Participant | null {
  return event.participants.find((p) => p.id === id) ?? null;
}
