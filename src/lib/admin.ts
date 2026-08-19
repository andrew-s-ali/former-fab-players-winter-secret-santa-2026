import type { ColorCode } from "./commanders";
import type { EventData, Participant } from "./participants";
import { COLOR_CODES } from "./signup";

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
};

export type EditableField = "colorVeto" | "themeVeto" | "themeWish";

export const EDITABLE_FIELDS: readonly EditableField[] = [
  "colorVeto",
  "themeVeto",
  "themeWish",
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
    colorVeto: participant.colorVeto,
    themeVeto: participant.themeVeto,
    themeWish: participant.themeWish,
  };

  if (edits.color !== undefined) {
    participant.colorVeto = edits.color === "none" ? null : parseColor(edits.color);
  }
  if (edits.veto !== undefined) {
    participant.themeVeto = edits.veto === "none" ? null : edits.veto;
  }
  if (edits.wish !== undefined) {
    participant.themeWish = edits.wish === "none" ? null : edits.wish;
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
    colorVeto: ColorCode | null;
    themeVeto: string | null;
    themeWish: string | null;
  }[];
};

export function summarizeEvent(event: EventData): EventSummary {
  return {
    participantCount: event.participants.length,
    revealedAt: event.revealedAt,
    participants: event.participants.map((p) => ({
      name: p.name,
      colorVeto: p.colorVeto,
      themeVeto: p.themeVeto,
      themeWish: p.themeWish,
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
  const { readEvent, writeEvent } = await import("./store");
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
