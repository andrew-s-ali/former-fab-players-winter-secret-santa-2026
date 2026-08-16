import type { ColorCode } from "./commanders";

export type Participant = {
  id: string;
  name: string;
  /** The participant this person builds a deck for. */
  recipientId: string;
  /** Secret used in the reveal URL. */
  token: string;
  colorVeto: ColorCode | null;
  themeVeto: string | null;
  themeWish: string | null;
};

export type EventData = {
  participants: Participant[];
};

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
