import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "../../db/index";
import { cardSelections, secretCardSets } from "../../db/schema";
import type { Participant } from "./participants";
import type { Commander } from "./scryfall/types";

export type SavedSelection = {
  selectorId: string;
  recipientId: string;
  slot: number;
  card: Commander;
};

export type SelectionWorkspace = {
  ownCards: Array<{ slot: number; card: Commander }>;
  peerCards: Record<string, Commander | null>;
  completedSlots: number;
  totalSlots: number;
  ready: boolean;
  needsMoreVariety: boolean;
};

export type SecretCards = {
  cards: Commander[];
  cashInUsed: boolean;
  replacedIndex: number | null;
};

function relevantSelections(
  rows: SavedSelection[],
  participants: Participant[]
): SavedSelection[] {
  const ids = new Set(participants.map((participant) => participant.id));
  return rows.filter(
    (row) =>
      ids.has(row.selectorId) &&
      ids.has(row.recipientId) &&
      (row.selectorId === row.recipientId ? row.slot === 1 || row.slot === 2 : row.slot === 1)
  );
}

export function requiredSelectionCount(participantCount: number): number {
  return participantCount * (participantCount + 1);
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
    return recipient && pickSecretCards(relevant, giver.id, recipient.id, () => 0) !== null;
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

export function pickSecretCards(
  rows: SavedSelection[],
  giverId: string,
  recipientId: string,
  random: () => number = Math.random
): [Commander, Commander, Commander, Commander] | null {
  const unique = new Map<string, Commander>();
  for (const row of rows) {
    if (row.recipientId === recipientId && row.selectorId !== giverId) {
      unique.set(row.card.id, row.card);
    }
  }
  if (unique.size < 4) {
    return null;
  }
  return shuffle([...unique.values()], random).slice(0, 4) as [
    Commander,
    Commander,
    Commander,
    Commander,
  ];
}

async function loadRelevantSelections(participants: Participant[]): Promise<SavedSelection[]> {
  if (participants.length === 0) {
    return [];
  }
  const db = getDb();
  const ids = participants.map((participant) => participant.id);
  const rows = await db
    .select({
      selectorId: cardSelections.selectorId,
      recipientId: cardSelections.recipientId,
      slot: cardSelections.slot,
      card: cardSelections.card,
    })
    .from(cardSelections)
    .where(
      and(
        inArray(cardSelections.selectorId, ids),
        inArray(cardSelections.recipientId, ids)
      )
    );
  return relevantSelections(rows, participants);
}

export async function getSelectionWorkspace(
  participant: Participant,
  participants: Participant[]
): Promise<SelectionWorkspace> {
  const rows = await loadRelevantSelections(participants);
  const ownCards = rows
    .filter(
      (row) => row.selectorId === participant.id && row.recipientId === participant.id
    )
    .sort((left, right) => left.slot - right.slot)
    .map((row) => ({ slot: row.slot, card: row.card }));
  const peerCards = Object.fromEntries(
    participants
      .filter((target) => target.id !== participant.id)
      .map((target) => [
        target.id,
        rows.find(
          (row) =>
            row.selectorId === participant.id && row.recipientId === target.id
        )?.card ?? null,
      ])
  );

  return {
    ownCards,
    peerCards,
    completedSlots: rows.length,
    totalSlots: requiredSelectionCount(participants.length),
    ready: selectionsAreReady(rows, participants),
    needsMoreVariety:
      rows.length === requiredSelectionCount(participants.length) &&
      !selectionsAreReady(rows, participants),
  };
}

export async function saveSelection({
  selector,
  recipient,
  participants,
  card,
}: {
  selector: Participant;
  recipient: Participant;
  participants: Participant[];
  card: Commander;
}): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('secret-santa-card-selections'))`
    );
    const ids = participants.map((participant) => participant.id);
    const rows = await tx
      .select({
        selectorId: cardSelections.selectorId,
        recipientId: cardSelections.recipientId,
        slot: cardSelections.slot,
        card: cardSelections.card,
      })
      .from(cardSelections)
      .where(
        and(
          inArray(cardSelections.selectorId, ids),
          inArray(cardSelections.recipientId, ids)
        )
      )
      .for("update");

    if (selectionsAreReady(rows, participants)) {
      throw new Error("Card choices are locked because every participant has finished.");
    }

    const ownPick = selector.id === recipient.id;
    const current = rows.filter(
      (row) => row.selectorId === selector.id && row.recipientId === recipient.id
    );
    if (current.some((row) => row.card.id === card.id)) {
      return;
    }

    let slot = 1;
    if (ownPick) {
      const used = new Set(current.map((row) => row.slot));
      slot = used.has(1) ? 2 : 1;
      if (used.has(1) && used.has(2)) {
        throw new Error("Remove one of your two saved cards before choosing another.");
      }
    }

    await tx
      .insert(cardSelections)
      .values({
        selectorId: selector.id,
        recipientId: recipient.id,
        slot,
        card,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          cardSelections.selectorId,
          cardSelections.recipientId,
          cardSelections.slot,
        ],
        set: { card, updatedAt: new Date() },
      });
  });
}

export async function removeSelection({
  selector,
  recipientId,
  slot,
  participants,
}: {
  selector: Participant;
  recipientId: string;
  slot: number;
  participants: Participant[];
}): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('secret-santa-card-selections'))`
    );
    const ids = participants.map((participant) => participant.id);
    const rows = await tx
      .select({
        selectorId: cardSelections.selectorId,
        recipientId: cardSelections.recipientId,
        slot: cardSelections.slot,
        card: cardSelections.card,
      })
      .from(cardSelections)
      .where(
        and(
          inArray(cardSelections.selectorId, ids),
          inArray(cardSelections.recipientId, ids)
        )
      );
    if (selectionsAreReady(rows, participants)) {
      throw new Error("Card choices are locked because every participant has finished.");
    }
    await tx
      .delete(cardSelections)
      .where(
        and(
          eq(cardSelections.selectorId, selector.id),
          eq(cardSelections.recipientId, recipientId),
          eq(cardSelections.slot, slot)
        )
      );
  });
}

export async function getOrCreateSecretCards(
  giver: Participant,
  recipient: Participant,
  participants: Participant[]
): Promise<SecretCards | null> {
  const db = getDb();
  const rows = await loadRelevantSelections(participants);
  if (!selectionsAreReady(rows, participants)) {
    return null;
  }

  let [set] = await db
    .select()
    .from(secretCardSets)
    .where(eq(secretCardSets.giverId, giver.id))
    .limit(1);

  if (!set) {
    const cards = pickSecretCards(rows, giver.id, recipient.id);
    if (!cards) {
      throw new Error(
        `Fewer than four unique cards were submitted for ${recipient.name}.`
      );
    }
    await db
      .insert(secretCardSets)
      .values({ giverId: giver.id, recipientId: recipient.id, cards })
      .onConflictDoNothing({ target: secretCardSets.giverId });
    [set] = await db
      .select()
      .from(secretCardSets)
      .where(eq(secretCardSets.giverId, giver.id))
      .limit(1);
  }

  if (!set || set.recipientId !== recipient.id) {
    throw new Error("The saved card set does not match this assignment.");
  }

  const visibleCards = set.cashedInAt
    ? set.cards.filter((_, index) => index !== set.replacedIndex && index !== 3).concat(set.cards[3])
    : set.cards.slice(0, 3);

  return {
    cards: visibleCards,
    cashInUsed: Boolean(set.cashedInAt),
    replacedIndex: set.replacedIndex,
  };
}

export async function cashInSecretCard(
  giver: Participant,
  replacedIndex: number
): Promise<void> {
  const db = getDb();
  if (![0, 1, 2].includes(replacedIndex)) {
    throw new Error("Choose one of the three visible cards to trade in.");
  }
  const updated = await db
    .update(secretCardSets)
    .set({ replacedIndex, cashedInAt: new Date() })
    .where(
      and(
        eq(secretCardSets.giverId, giver.id),
        isNull(secretCardSets.cashedInAt)
      )
    )
    .returning({ giverId: secretCardSets.giverId });
  if (updated.length === 0) {
    throw new Error("The one-time cash-in has already been used.");
  }
}
