"use server";

import { revalidatePath } from "next/cache";
import { getUser } from "@netlify/identity";
import {
  applyParticipantEdits,
  findParticipantByName,
  setReveal,
} from "@/lib/admin";
import { isOrganizer } from "@/lib/organizer";
import { readEvent, writeEvent } from "@/lib/store";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Re-checks the caller's role inside every action.
 *
 * The page already refuses to render the console to a non-organiser, but a
 * Server Action is a callable endpoint in its own right — anything that can
 * reach the site can invoke it directly, regardless of what the page showed.
 * The rendering check is presentation; this is the security boundary.
 */
async function requireOrganizer(): Promise<void> {
  if (!isOrganizer(await getUser())) {
    throw new Error("Not authorised.");
  }
}

/** Wraps an action so a thrown error becomes a message instead of a stack trace. */
async function run(work: () => Promise<string>): Promise<ActionResult> {
  try {
    await requireOrganizer();
    const message = await work();
    revalidatePath("/admin");
    return { ok: true, message };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Unlocks or locks `/reveal`.
 *
 * `undo` is passed explicitly rather than toggling whatever the current state
 * is: a double-click on a toggle that flips state would be enough to publish
 * every assignment early.
 */
export async function setRevealAction(undo: boolean): Promise<ActionResult> {
  return run(async () => (await setReveal({ undo })).message);
}

/**
 * Edits one participant's preferences. Never touches assignments or tokens.
 *
 * An omitted field means "leave alone"; the string "none" clears it — the same
 * contract the CLI flags use, because both go through applyParticipantEdits.
 */
export async function updateParticipantAction(
  formData: FormData
): Promise<ActionResult> {
  return run(async () => {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) {
      throw new Error("Which participant? No name was given.");
    }

    const field = (key: string): string | undefined => {
      const raw = formData.get(key);
      if (raw === null) {
        return undefined;
      }
      const value = String(raw).trim();
      return value === "" ? undefined : value;
    };

    const event = await readEvent();
    const participant = findParticipantByName(event, name);

    applyParticipantEdits(participant, {
      color: field("color"),
      veto: field("veto"),
      wish: field("wish"),
    });

    await writeEvent(event);
    return `Updated ${participant.name}.`;
  });
}
