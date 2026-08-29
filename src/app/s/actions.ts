"use server";

import { revalidatePath } from "next/cache";
import {
  cashInSecretCard,
  removeSelection,
  saveSelection,
} from "@/lib/card-selections";
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
  cardId: string
): Promise<CardActionResult> {
  return run(token, async ({ event, participant }) => {
    const recipient = findById(event, recipientId);
    if (!recipient) {
      throw new Error("That participant is not part of this exchange.");
    }
    const card = (await fetchCommanderPool()).find((candidate) => candidate.id === cardId);
    if (!card) {
      throw new Error("That card is no longer in the legal commander pool.");
    }
    if (recipient.colorVeto && card.colorIdentity.includes(recipient.colorVeto)) {
      throw new Error(`${card.name} includes ${recipient.colorVeto}, which this participant vetoed.`);
    }

    await saveSelection({
      selector: participant,
      recipient,
      participants: event.participants,
      card,
    });
    return recipient.id === participant.id
      ? `${card.name} was saved as one of your choices.`
      : `${card.name} was saved for ${recipient.name}.`;
  });
}

export async function removeCardAction(
  token: string,
  recipientId: string,
  slot: number
): Promise<CardActionResult> {
  return run(token, async ({ event, participant }) => {
    await removeSelection({
      selector: participant,
      recipientId,
      slot,
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
