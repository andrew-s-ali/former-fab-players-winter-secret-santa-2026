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
  /** One commander choice, which may be a partner pair. */
  card: CommanderPick;
};

/**
 * Keeps only the rows this event's pools are built from.
 *
 * Peer picks only — self-picks live on the participant record, and a database
 * constraint refuses a self row. The filter stays because this function is
 * also handed rows by the demo routes and by tests, neither of which goes
 * through the database. A stale row for someone no longer in the event must
 * not count toward completion either.
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
      row.selectorId !== row.recipientId
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
  // Every participant, not every giver. A pool no longer depends on who is
  // drawing from it, and the ring is a derangement, so "each giver's recipient
  // can be filled" and "everybody's pool can be filled" are the same set —
  // said the plainer way round.
  return participants.every(
    (recipient) => pickSecretCards(relevant, recipient, () => 0) !== null
  );
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
 * The pool is the recipient's two sign-up picks plus every other participant's
 * recommendation for them — **including the giver's own**. Their card is one
 * candidate among `n + 1`, no more likely to be drawn than any other, and it
 * still has to survive the cut to the visible three.
 *
 * **Every card in a recipient's pool is legal for that recipient, so none of
 * them is set aside.** That is the rule, and it is the organiser's: a pool is
 * what the group chose for one person, and discarding a card from it because
 * of who happened to suggest it withholds a deck the recipient could perfectly
 * well have been given.
 *
 * This used to exclude the giver's own card, so that nobody could recognise a
 * suggestion as theirs. That was thin protection — a giver learns about their
 * own pick, never about who contributed any of the others — and it cost a
 * candidate from a pool with very little slack. At six participants it was the
 * difference between four and five spare recommendations, and a group that
 * converged on one commander could fill every slot and still stall.
 *
 * Four out of `n + 1` is itself deliberate, and does not contradict the above:
 * every card is eligible, and a shortlist is still short. Handing a builder
 * the whole pool would turn a constrained, surprising brief into a menu, and
 * three of the four are shown precisely so the fourth can be traded for.
 * Which cards are left out is chance; that some are is the design.
 *
 * Distinctness is by `pickId`, so a partner pair counts once however its two
 * halves were ordered, and two people who independently chose the same pair
 * do not fill two of the four slots with the same deck.
 */
export function pickSecretCards(
  rows: SavedSelection[],
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
    // filtered self rows out first. The giver's row is deliberately kept.
    if (row.recipientId === recipient.id && row.selectorId !== recipient.id) {
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
