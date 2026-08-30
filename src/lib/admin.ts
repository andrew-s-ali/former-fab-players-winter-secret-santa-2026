import type { SavedSelection } from "./card-pool";
import type { ColorCode } from "./commanders";
import { pickColorIdentity, pickId, pickName, type CommanderPick } from "#lib/pairing";
import type { EventData, Participant } from "./participants";
import { formatDiscordRef, parseDiscordRef } from "#lib/discord";
import { COLOR_CODES, parseEmail } from "#lib/signup";

/**
 * Organiser operations, framework-free and pure over `EventData`.
 *
 * Everything here is shared by the CLI scripts and the Identity-gated
 * functions in `netlify/functions/`, which matters more than usual: Netlify
 * Identity does not work under `netlify dev`, so the functions cannot be
 * exercised locally at all. Keeping the logic here and the functions down to
 * an auth check plus a call means the behaviour stays covered by Vitest, and
 * only the auth gate itself needs a deploy to test.
 */

const COLOR_CODE_SET = new Set<ColorCode>(["W", "U", "B", "R", "G"]);

/** Accepts a colour code (W/U/B/R/G) or a colour word (white/blue/...). */
export function parseColor(raw: string): ColorCode {
  const upper = raw.toUpperCase();
  if (COLOR_CODE_SET.has(upper as ColorCode)) {
    return upper as ColorCode;
  }

  const fromWord = COLOR_CODES[raw.toLowerCase()];
  if (fromWord) {
    return fromWord;
  }

  throw new Error(
    `Unrecognised colour "${raw}". Use a code (${Array.from(COLOR_CODE_SET).join(", ")}) ` +
      `or a name (${Object.keys(COLOR_CODES).join(", ")}), or "none" to clear the veto.`
  );
}

/** Finds a participant by name, case-insensitively, listing the known names on a miss. */
export function findParticipantByName(
  event: EventData,
  name: string
): Participant {
  const participant = event.participants.find(
    (p) => p.name.toLowerCase() === name.toLowerCase()
  );

  if (!participant) {
    throw new Error(
      `No participant named "${name}". Known: ${event.participants
        .map((p) => p.name)
        .join(", ")}`
    );
  }
  return participant;
}

/**
 * Raw edits as they arrive from a CLI flag or a form field.
 *
 * `undefined` means "leave alone"; the literal string "none" clears the field.
 * A participant whose veto is literally the word "none" cannot be set to it
 * (only cleared) — anything else, like "none of the tribal stuff", is fine.
 */
export type ParticipantEdits = {
  color?: string;
  veto?: string;
  wish?: string;
  email?: string;
  discord?: string;
};

export type EditableField =
  | "email"
  | "colorVeto"
  | "themeVeto"
  | "themeWish"
  | "discord";

export const EDITABLE_FIELDS: readonly EditableField[] = [
  "email",
  "colorVeto",
  "themeVeto",
  "themeWish",
  "discord",
];

/**
 * Applies edits in place and reports what changed.
 *
 * Assignments and tokens are never touched here, by construction — links
 * already sent out keep working no matter what an organiser edits.
 */
export function applyParticipantEdits(
  participant: Participant,
  edits: ParticipantEdits
): { before: Record<EditableField, string | null> } {
  const before = {
    email: participant.email,
    colorVeto: participant.colorVeto,
    themeVeto: participant.themeVeto,
    themeWish: participant.themeWish,
    discord: participant.discord,
  };

  // No "none" sentinel for the address: it is required, so the only sensible
  // edit is a correction.
  if (edits.email !== undefined) {
    participant.email = parseEmail(edits.email, participant.name, "This edit");
  }
  if (edits.color !== undefined) {
    const colorVeto = edits.color === "none" ? null : parseColor(edits.color);

    // A veto now constrains the participant's own sign-up picks, which are
    // already sitting in their pool for everyone else to draw from. Letting
    // the edit through would leave a card they asked not to receive in the
    // pool, and nothing downstream re-checks it.
    // The pair's combined identity, not either half's: a Partner pair is
     // only safe if neither card brings the vetoed colour.
    const clashing = colorVeto
      ? participant.selfCards.filter((pick) =>
          pickColorIdentity(pick).includes(colorVeto)
        )
      : [];
    if (clashing.length > 0) {
      throw new Error(
        `${participant.name} cannot veto ${colorVeto}: their own pool card` +
          `${clashing.length === 1 ? "" : "s"} ` +
          `${clashing.map(pickName).join(" and ")} ` +
          `${clashing.length === 1 ? "carries" : "carry"} that colour. ` +
          "Swap the card first, or leave the veto as it is."
      );
    }

    participant.colorVeto = colorVeto;
  }
  if (edits.veto !== undefined) {
    participant.themeVeto = edits.veto === "none" ? null : edits.veto;
  }
  if (edits.wish !== undefined) {
    participant.themeWish = edits.wish === "none" ? null : edits.wish;
  }
  // Stored normalised — a bare id or a bare handle — so a value pasted as
  // `<@123…>` reads back the same way it will be rendered. `parseDiscordRef`
  // throws on anything that is neither, because a typo that was accepted here
  // would show up as a nudge that quietly never pings.
  if (edits.discord !== undefined) {
    participant.discord =
      edits.discord === "none"
        ? null
        : formatDiscordRef(parseDiscordRef(edits.discord));
  }

  return { before };
}

/**
 * What the organiser console shows.
 *
 * Carries no tokens and no assignments. The console is behind Identity, but
 * "who has whom" should not travel over the wire at all when nothing needs it
 * — the organiser running the event is a participant too.
 */
export type EventSummary = {
  participantCount: number;
  revealedAt: string | null;
  participants: {
    name: string;
    email: string;
    colorVeto: ColorCode | null;
    themeVeto: string | null;
    themeWish: string | null;
    /** A Discord user id or handle; null until the organiser fills one in. */
    discord: string | null;
  }[];
};

/** One card in somebody's pool, and who put it there. */
export type PoolEntry = {
  /** The name of whoever chose it, or null for the recipient's own sign-up picks. */
  from: string | null;
  pick: CommanderPick;
};

/**
 * Everything in one participant's pool.
 *
 * This is what the shortlists are drawn from, so it is the answer to both
 * "what will they be offered" and "who still has to pick".
 */
export type ParticipantPool = {
  name: string;
  /** The two they chose at sign-up. */
  own: CommanderPick[];
  /** One per other participant who has picked for them, in name order. */
  contributed: PoolEntry[];
  /** Participants who have not picked for them yet, in name order. */
  awaiting: string[];
  /** Distinct choices available — four are needed before the exchange unlocks. */
  distinctCount: number;
};

/**
 * Builds the pools from the participant list and the saved peer picks.
 *
 * Pure, so the console's shape is testable without a database; the caller
 * supplies the rows.
 *
 * Deliberately shows who contributed what. Everybody picks for everybody, so
 * attribution reveals nothing about who was assigned whom — and without it the
 * organiser cannot tell who still needs chasing.
 */
export function buildPools(
  event: EventData,
  rows: SavedSelection[]
): ParticipantPool[] {
  const nameOf = new Map(event.participants.map((p) => [p.id, p.name]));
  const byName = (left: { from: string | null }, right: { from: string | null }) =>
    (left.from ?? "").localeCompare(right.from ?? "");

  return event.participants.map((recipient) => {
    const contributed = rows
      .filter(
        (row) =>
          row.recipientId === recipient.id && row.selectorId !== recipient.id
      )
      .map((row) => ({ from: nameOf.get(row.selectorId) ?? "(unknown)", pick: row.card }))
      .sort(byName);

    const picked = new Set(
      rows
        .filter((row) => row.recipientId === recipient.id)
        .map((row) => row.selectorId)
    );
    const awaiting = event.participants
      .filter((other) => other.id !== recipient.id && !picked.has(other.id))
      .map((other) => other.name)
      .sort((left, right) => left.localeCompare(right));

    const own = [...recipient.selfCards];
    const distinct = new Set(
      [...own, ...contributed.map((entry) => entry.pick)].map(pickId)
    );

    return {
      name: recipient.name,
      own,
      contributed,
      awaiting,
      distinctCount: distinct.size,
    };
  });
}

export function summarizeEvent(event: EventData): EventSummary {
  return {
    participantCount: event.participants.length,
    revealedAt: event.revealedAt,
    participants: event.participants.map((p) => ({
      name: p.name,
      email: p.email,
      colorVeto: p.colorVeto,
      themeVeto: p.themeVeto,
      themeWish: p.themeWish,
      discord: p.discord,
    })),
  };
}

/**
 * Unlocks or locks the public reveal page.
 *
 * Unlocking publishes every assignment at a public URL, so it stays an
 * explicit action rather than a date the site guesses at. Lives here rather
 * than in `scripts/reveal.ts` so the organiser console and the CLI share one
 * implementation; the script delegates to this.
 */
export async function setReveal(
  options: { undo?: boolean } = {}
): Promise<{ revealedAt: string | null; message: string }> {
  const { readEvent, writeEvent } = await import("#lib/store");
  const undo = options.undo ?? false;

  const event = await readEvent();
  if (event.participants.length === 0) {
    throw new Error("No draw exists yet — nothing to reveal.");
  }

  event.revealedAt = undo ? null : new Date().toISOString();
  await writeEvent(event);

  return {
    revealedAt: event.revealedAt,
    message: undo
      ? "Locked. /reveal now 404s."
      : `Unlocked at ${event.revealedAt}. /reveal is now public.`,
  };
}
