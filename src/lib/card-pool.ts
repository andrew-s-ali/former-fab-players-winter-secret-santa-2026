import { pickId, type CommanderPick } from "#lib/pairing";
import type { Participant } from "#lib/participants";

/**
 * How a recipient's pool is built and drawn from — the rules, with no storage
 * attached.
 *
 * Split from `card-selections.ts` so this can be used without loading the
 * database client. The `/demo` routes depend on that: they preview the real
 * shortlist using the real function, and their isolation guarantee is that
 * nothing on those routes can reach live data or a database at all.
 */

export type SavedSelection = {
  selectorId: string;
  recipientId: string;
  slot: number;
  /** One commander choice, which may be a partner pair. */
  card: CommanderPick;
};

/**
 * Keeps only the rows this event's pools are built from.
 *
 * Peer picks only. Self-picks live on the participant record (see
 * `Participant.selfCards`) because the draw writes them, and a stale row for
 * someone no longer in the event must not count toward completion.
 */
export function relevantSelections(
  rows: SavedSelection[],
  participants: Participant[]
): SavedSelection[] {
  const ids = new Set(participants.map((participant) => participant.id));
  return rows.filter(
    (row) =>
      ids.has(row.selectorId) &&
      ids.has(row.recipientId) &&
      row.selectorId !== row.recipientId &&
      row.slot === 1
  );
}

/** One pick from every participant for every other participant. */
export function requiredSelectionCount(participantCount: number): number {
  return participantCount * (participantCount - 1);
}

export function selectionsAreReady(
  rows: SavedSelection[],
  participants: Participant[]
): boolean {
  const relevant = relevantSelections(rows, participants);
  if (relevant.length !== requiredSelectionCount(participants.length)) {
    return false;
  }
  return participants.every((giver) => {
    const recipient = participants.find(
      (candidate) => candidate.id === giver.recipientId
    );
    return recipient && pickSecretCards(relevant, giver.id, recipient, () => 0) !== null;
  });
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

/**
 * Draws four distinct choices from a recipient's pool for one giver.
 *
 * The pool is the recipient's two sign-up picks plus everyone else's
 * recommendation for them, minus the giver's own — a giver must not be shown
 * the choice they made, or the shortlist leaks who recommended what.
 *
 * Distinctness is by `pickId`, so a partner pair counts once however its two
 * halves were ordered, and two people who independently chose the same pair
 * do not fill two of the four slots with the same deck.
 */
export function pickSecretCards(
  rows: SavedSelection[],
  giverId: string,
  recipient: Participant,
  random: () => number = Math.random
): [CommanderPick, CommanderPick, CommanderPick, CommanderPick] | null {
  const unique = new Map<string, CommanderPick>();
  for (const pick of recipient.selfCards) {
    unique.set(pickId(pick), pick);
  }
  for (const row of rows) {
    // A recipient's own contribution comes from `selfCards`, never from a row:
    // this function is exported and must not depend on the caller having
    // filtered self rows out first.
    if (
      row.recipientId === recipient.id &&
      row.selectorId !== recipient.id &&
      row.selectorId !== giverId
    ) {
      unique.set(pickId(row.card), row.card);
    }
  }
  if (unique.size < 4) {
    return null;
  }
  return shuffle([...unique.values()], random).slice(0, 4) as [
    CommanderPick,
    CommanderPick,
    CommanderPick,
    CommanderPick,
  ];
}

/**
 * Which of the four a giver can see.
 *
 * Before the cash-in, the first three; the fourth is held back. After it, the
 * traded card is dropped and the hidden fourth takes its place at the end —
 * appended rather than slotted in, so the new card is obvious rather than
 * quietly occupying the gap.
 *
 * Lives here, with no storage attached, so the demo routes can show the same
 * transition the real page performs instead of approximating it.
 */
export function visibleShortlist<T>(
  cards: [T, T, T, T],
  replacedIndex: number | null
): T[] {
  if (replacedIndex === null) {
    return cards.slice(0, 3);
  }
  return cards
    .filter((_, index) => index !== replacedIndex && index !== 3)
    .concat(cards[3]);
}
