"use server";

import { revalidatePath } from "next/cache";
import {
  cashInSecretCard,
  getOrCreateSecretCards,
  removeSelection,
  saveSelection,
} from "@/lib/card-selections";
import {
  clearDecklistUrl,
  saveBuiltPick,
  saveDecklistUrl,
  saveNotes,
} from "@/lib/deck-builds";
import {
  describeIllegalPick,
  pickColorIdentity,
  pickId,
  pickName,
  type CommanderPick,
} from "@/lib/pairing";
import { findById, findByToken } from "@/lib/participants";
import { fetchCommanderPool } from "@/lib/scryfall/pool";
import { readEvent } from "@/lib/store";

export type CardActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

async function run(
  token: string,
  work: (context: Awaited<ReturnType<typeof requireParticipant>>) => Promise<string>
): Promise<CardActionResult> {
  try {
    const context = await requireParticipant(token);
    const message = await work(context);
    revalidatePath(`/s/${token}`);
    return { ok: true, message };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function requireParticipant(token: string) {
  const event = await readEvent();
  const participant = findByToken(event, token);
  if (!participant) {
    throw new Error("This private link is not valid.");
  }
  return { event, participant };
}

export async function saveCardAction(
  token: string,
  recipientId: string,
  cardId: string,
  partnerId: string | null = null
): Promise<CardActionResult> {
  return run(token, async ({ event, participant }) => {
    const recipient = findById(event, recipientId);
    if (!recipient) {
      throw new Error("That participant is not part of this exchange.");
    }
    // Own picks are fixed at sign-up. Re-checked here and not only in
    // saveSelection because a Server Action is a callable endpoint whatever
    // the page rendered.
    if (recipient.id === participant.id) {
      throw new Error(
        "Your own two cards were chosen at sign-up and cannot be changed here."
      );
    }

    const pool = await fetchCommanderPool();
    const find = (id: string) => {
      const card = pool.find((candidate) => candidate.id === id);
      if (!card) {
        throw new Error("That card is no longer in the legal commander pool.");
      }
      return card;
    };

    const pick: CommanderPick = {
      commander: find(cardId),
      partner: partnerId === null ? null : find(partnerId),
    };

    // The pairing rules run here as well as in the browser: a Server Action is
    // a callable endpoint, so nothing it is handed can be assumed validated.
    const illegal = describeIllegalPick(pick);
    if (illegal) {
      throw new Error(illegal);
    }
    // The pair's combined identity, not either half's.
    if (
      recipient.colorVeto &&
      pickColorIdentity(pick).includes(recipient.colorVeto)
    ) {
      throw new Error(
        `${pickName(pick)} includes ${recipient.colorVeto}, which this participant vetoed.`
      );
    }

    await saveSelection({
      selector: participant,
      recipient,
      participants: event.participants,
      card: pick,
    });
    return `${pickName(pick)} was saved for ${recipient.name}.`;
  });
}

export async function removeCardAction(
  token: string,
  recipientId: string
): Promise<CardActionResult> {
  return run(token, async ({ event, participant }) => {
    await removeSelection({
      selector: participant,
      recipientId,
      participants: event.participants,
    });
    return "The saved card was removed.";
  });
}

export async function cashInCardAction(
  token: string,
  replacedIndex: number
): Promise<CardActionResult> {
  return run(token, async ({ participant }) => {
    await cashInSecretCard(participant, replacedIndex);
    return "Your hidden fourth card has replaced the traded choice.";
  });
}

/**
 * Records which of the shortlist this builder is actually building.
 *
 * Checked against their *visible* three rather than all four: the held-back
 * card is not a thing they have been offered, and accepting it would let the
 * page report a deck built around a card its builder never saw. Passing null
 * clears the choice, for somebody who goes back to undecided.
 */
export async function chooseBuiltCardAction(
  token: string,
  chosenPickId: string | null
): Promise<CardActionResult> {
  return run(token, async ({ event, participant }) => {
    if (chosenPickId === null) {
      await saveBuiltPick(participant.id, null);
      return "Cleared — you have not said which one you are building.";
    }

    const recipient = findById(event, participant.recipientId);
    if (!recipient) {
      throw new Error("This private link is not valid.");
    }
    const secret = await getOrCreateSecretCards(participant, recipient, event.participants);
    const chosen = secret?.cards.find((card) => pickId(card) === chosenPickId);
    if (!chosen) {
      throw new Error("That card is not one of the three on your shortlist.");
    }

    await saveBuiltPick(participant.id, chosenPickId);
    return `Noted — you are building ${pickName(chosen)}.`;
  });
}

export async function saveDecklistAction(
  token: string,
  url: string
): Promise<CardActionResult> {
  return run(token, async ({ participant }) => {
    const saved = await saveDecklistUrl(participant.id, url);
    return `Decklist link saved: ${saved}`;
  });
}

export async function clearDecklistAction(token: string): Promise<CardActionResult> {
  return run(token, async ({ participant }) => {
    await clearDecklistUrl(participant.id);
    return "Decklist link removed.";
  });
}

/**
 * Saves the builder's private notes.
 *
 * Called on a debounce as they type, so unlike the other actions it does not
 * `revalidatePath` — re-rendering the page under a live textarea would fight
 * whatever they are in the middle of writing.
 */
export async function saveNotesAction(
  token: string,
  notes: string
): Promise<CardActionResult> {
  try {
    const { participant } = await requireParticipant(token);
    await saveNotes(participant.id, notes);
    return { ok: true, message: "Saved" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
