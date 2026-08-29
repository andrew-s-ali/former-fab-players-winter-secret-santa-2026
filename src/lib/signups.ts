import { createHash } from "node:crypto";
import { desc } from "drizzle-orm";
import { getDb } from "#db/index";
import { signups } from "#db/schema";
import type { CommanderPick } from "#lib/pairing";
import type { ParticipantInput, SignupEntry } from "#lib/signup";

/**
 * A sign-up as it comes back out of the database: the answers, plus the two
 * commanders already resolved against the pool.
 *
 * Extends `SignupEntry` so `dedupeSignups` applies the same duplicate policy
 * here as it does to a CSV, and hands the winner back with its cards attached.
 */
export type StoredSignup = SignupEntry & {
  cards: [CommanderPick, CommanderPick];
};

/**
 * Stable id for a submission's content.
 *
 * Netlify's `FormSubmittedEvent` is `{ data }` and nothing else — no
 * submission id, no timestamp — and platform-event functions are retried on
 * invocation error. Without an id from Netlify, the answers themselves are the
 * only thing that can tell a retry apart from a real resubmission, so they are
 * what gets hashed.
 *
 * Card *ids* rather than the submitted names: the same pick spelled with
 * different capitalisation is the same pick, and should not create a row.
 */
export function signupContentId(
  input: ParticipantInput,
  cards: [CommanderPick, CommanderPick]
): string {
  const payload = JSON.stringify([
    input.name.trim(),
    input.email.trim().toLowerCase(),
    input.colorVeto,
    input.themeVeto,
    input.themeWish,
    // Both halves, so changing only a partner is a new submission.
    cards.map((pick) => [pick.commander.id, pick.partner?.id ?? null]),
  ]);
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

/**
 * Records one submission, ignoring a delivery we already hold.
 *
 * `onConflictDoNothing` rather than an upsert: if the id matches, the content
 * matches too, so there is nothing to update — and keeping the original
 * `submitted_at` means a retry cannot reorder a person's resubmissions.
 */
export async function recordSignup(
  input: ParticipantInput,
  cards: [CommanderPick, CommanderPick]
): Promise<{ id: string; stored: boolean }> {
  const id = signupContentId(input, cards);
  const inserted = await getDb()
    .insert(signups)
    .values({
      id,
      name: input.name,
      email: input.email,
      colorVeto: input.colorVeto,
      themeVeto: input.themeVeto,
      themeWish: input.themeWish,
      selfCards: cards,
    })
    .onConflictDoNothing({ target: signups.id })
    .returning({ id: signups.id });

  return { id, stored: inserted.length > 0 };
}

/**
 * Every recorded sign-up, oldest first.
 *
 * Ordering matters because `dedupeSignups` resolves a resubmission by taking
 * the most recent, and `submitted_at` is the only ordering the form event
 * gives us.
 */
export async function readSignups(): Promise<StoredSignup[]> {
  const rows = await getDb()
    .select()
    .from(signups)
    .orderBy(desc(signups.submittedAt));

  return rows
    .map((row) => ({
      input: {
        name: row.name,
        email: row.email,
        colorVeto: row.colorVeto ?? null,
        themeVeto: row.themeVeto,
        themeWish: row.themeWish,
        // Names are kept for error messages and the CSV-shaped contract;
        // `cards` is the resolved form the draw actually stores.
        selfCards: [
          {
            commander: row.selfCards[0].commander.name,
            partner: row.selfCards[0].partner?.name ?? null,
          },
          {
            commander: row.selfCards[1].commander.name,
            partner: row.selfCards[1].partner?.name ?? null,
          },
        ],
      } satisfies ParticipantInput,
      cards: row.selfCards,
      submittedAt:
        row.submittedAt instanceof Date
          ? row.submittedAt.toISOString()
          : String(row.submittedAt),
    }))
    .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));
}
