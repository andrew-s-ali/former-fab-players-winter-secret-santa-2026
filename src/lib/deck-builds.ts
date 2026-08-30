import { eq, inArray } from "drizzle-orm";
import { getDb } from "#db/index";
import { deckBuilds } from "#db/schema";
import {
  normalizeDecklistUrl,
  normalizeNotes,
  MAX_NOTES_LENGTH,
  MAX_URL_LENGTH,
} from "#lib/deck-build-rules";

/**
 * Storage for a builder's private workspace. The validation rules live in
 * `deck-build-rules.ts`, which has no database dependency so client components
 * can import the limits; re-exported here so server callers have one import.
 */
export {
  normalizeDecklistUrl,
  normalizeNotes,
  MAX_NOTES_LENGTH,
  MAX_URL_LENGTH,
};

/** One builder's private workspace. */
export type DeckBuild = {
  decklistUrl: string | null;
  notes: string;
};


/** This builder's saved workspace. Absent rows read as empty, not missing. */
export async function readDeckBuild(giverId: string): Promise<DeckBuild> {
  const [row] = await getDb()
    .select({ decklistUrl: deckBuilds.decklistUrl, notes: deckBuilds.notes })
    .from(deckBuilds)
    .where(eq(deckBuilds.giverId, giverId))
    .limit(1);
  return { decklistUrl: row?.decklistUrl ?? null, notes: row?.notes ?? "" };
}

/** Saves or replaces this builder's decklist link. */
export async function saveDecklistUrl(giverId: string, raw: string): Promise<string> {
  const decklistUrl = normalizeDecklistUrl(raw);
  await upsert(giverId, { decklistUrl });
  return decklistUrl;
}

/** Clears the decklist link, leaving any notes alone. */
export async function clearDecklistUrl(giverId: string): Promise<void> {
  await upsert(giverId, { decklistUrl: null });
}

/** Saves this builder's notes. */
export async function saveNotes(giverId: string, raw: string): Promise<void> {
  await upsert(giverId, { notes: normalizeNotes(raw) });
}

/**
 * Writes one field of the row, creating it if this is the builder's first
 * edit. Field-at-a-time so saving notes cannot blank a decklist link written
 * from another tab, or the reverse.
 */
async function upsert(
  giverId: string,
  fields: { decklistUrl?: string | null; notes?: string }
): Promise<void> {
  await getDb()
    .insert(deckBuilds)
    .values({ giverId, ...fields, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: deckBuilds.giverId,
      set: { ...fields, updatedAt: new Date() },
    });
}

/**
 * Deletes these builders' workspaces.
 *
 * The notes are free text somebody wrote about a named person, which makes
 * this the one table whose contents cannot be reasoned about — so erasing
 * somebody erases the whole row rather than trying to judge what in it was
 * personal.
 */
export async function deleteDeckBuilds(giverIds: string[]): Promise<number> {
  if (giverIds.length === 0) {
    return 0;
  }
  const deleted = await getDb()
    .delete(deckBuilds)
    .where(inArray(deckBuilds.giverId, giverIds))
    .returning({ giverId: deckBuilds.giverId });
  return deleted.length;
}

/** Empties the table, including rows for people no longer in the event. */
export async function deleteAllDeckBuilds(): Promise<number> {
  const deleted = await getDb().delete(deckBuilds).returning();
  return deleted.length;
}
