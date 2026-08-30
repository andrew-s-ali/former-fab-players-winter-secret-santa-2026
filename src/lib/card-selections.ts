import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "#db/index";
import { pickId } from "#lib/pairing";
import { cardSelections, secretCardSets } from "#db/schema";
import {
  pickSecretCards,
  relevantSelections,
  requiredSelectionCount,
  selectionsAreReady,
  visibleShortlist,
  type SavedSelection,
} from "#lib/card-pool";
import type { Participant } from "./participants";
import type { CommanderPick } from "./pairing";

/**
 * Storage for card selections. The rules that decide what a pool contains and
 * how a shortlist is drawn from it live in `card-pool.ts`, which has no
 * database dependency; re-exported here so callers have one import.
 */
export {
  pickSecretCards,
  relevantSelections,
  requiredSelectionCount,
  selectionsAreReady,
  visibleShortlist,
  type SavedSelection,
};

export type SelectionWorkspace = {
  peerCards: Record<string, CommanderPick | null>;
  completedSlots: number;
  totalSlots: number;
  ready: boolean;
  needsMoreVariety: boolean;
};

export type SecretCards = {
  cards: CommanderPick[];
  cashInUsed: boolean;
  replacedIndex: number | null;
};

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
  card: CommanderPick;
}): Promise<void> {
  if (selector.id === recipient.id) {
    throw new Error(
      "Your own two cards were chosen at sign-up and cannot be changed here."
    );
  }

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

    const current = rows.find(
      (row) => row.selectorId === selector.id && row.recipientId === recipient.id
    );
    if (current && pickId(current.card) === pickId(card)) {
      return;
    }

    await tx
      .insert(cardSelections)
      .values({
        selectorId: selector.id,
        recipientId: recipient.id,
        card,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [cardSelections.selectorId, cardSelections.recipientId],
        set: { card, updatedAt: new Date() },
      });
  });
}

export async function removeSelection({
  selector,
  recipientId,
  participants,
}: {
  selector: Participant;
  recipientId: string;
  participants: Participant[];
}): Promise<void> {
  if (recipientId === selector.id) {
    throw new Error(
      "Your own two cards were chosen at sign-up and cannot be removed here."
    );
  }

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
          eq(cardSelections.recipientId, recipientId)
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
    const cards = pickSecretCards(rows, giver.id, recipient);
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

  return {
    cards: visibleShortlist(set.cards, set.cashedInAt ? set.replacedIndex : null),
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

/**
 * Every saved peer pick, for the organiser console.
 *
 * Separate from `loadRelevantSelections` only in being exported: the console
 * needs the same rows the workspace does, and reads them the same way. Returns
 * an empty list rather than throwing when there is no draw yet, so an empty
 * console is a normal state rather than an error page.
 */
export async function readAllSelections(
  participants: Participant[]
): Promise<SavedSelection[]> {
  return loadRelevantSelections(participants);
}

/**
 * Empties `card_selections` and `secret_card_sets`.
 *
 * Only ever called by the post-event wipe. These two tables hold random ids
 * and card names — nothing that identifies anybody once `event.json` is gone —
 * but leaving them behind would leave the shape of the event behind with them,
 * and a wipe that keeps souvenirs is not a wipe.
 */
export async function deleteAllSelections(): Promise<{
  selections: number;
  secretSets: number;
}> {
  const db = getDb();
  const selections = await db.delete(cardSelections).returning();
  const secretSets = await db.delete(secretCardSets).returning();
  return { selections: selections.length, secretSets: secretSets.length };
}
