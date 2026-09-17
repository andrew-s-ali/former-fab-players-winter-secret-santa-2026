import { readAllSelections, selectionsAreReady } from "#lib/card-selections";
import { postToDiscord, webhookFromEnv } from "#lib/discord";
import { EXCHANGE_AT } from "#lib/event";
import { readEvent, readUnlockState, writeUnlockState } from "#lib/store";
import { unlockMessage } from "#lib/unlock";

/**
 * Announcing that the assignments are open, once.
 *
 * Three callers: the Server Action that saves the last pick, the nightly
 * nudge as a fallback, and `npm run unlock`. Same split as `nudge-run.ts`.
 */

export type UnlockResult = {
  /** Whether every pick is in, i.e. whether the links are open. */
  unlocked: boolean;
  /** Whether the group has been told, before or by this call. */
  announced: boolean;
  message: string | null;
  posted: boolean;
  reason: string;
};

export async function runUnlockAnnouncement({
  dryRun = false,
  force = false,
  now = new Date(),
}: { dryRun?: boolean; force?: boolean; now?: Date } = {}): Promise<UnlockResult> {
  const event = await readEvent();
  const { participants } = event;
  if (participants.length === 0) {
    return {
      unlocked: false,
      announced: false,
      message: null,
      posted: false,
      reason: "No draw has run yet.",
    };
  }

  const rows = await readAllSelections(participants);
  if (!selectionsAreReady(rows, participants)) {
    return {
      unlocked: false,
      announced: false,
      message: null,
      posted: false,
      reason: "Picks are still outstanding; the links are locked.",
    };
  }

  const state = await readUnlockState();
  const message = unlockMessage({
    participantCount: participants.length,
    exchangeAt: EXCHANGE_AT,
  });

  if (state && !force) {
    return {
      unlocked: true,
      announced: true,
      message,
      posted: false,
      reason: `Already announced at ${state.announcedAt}.`,
    };
  }

  if (dryRun) {
    return {
      unlocked: true,
      announced: state !== null,
      message,
      posted: false,
      reason: "Would post.",
    };
  }

  const webhook = webhookFromEnv();
  if (!webhook) {
    return {
      unlocked: true,
      announced: false,
      message,
      posted: false,
      reason:
        "DISCORD_WEBHOOK_URL is not set, so there is nowhere to post. " +
        "Add it in Netlify under Project configuration > Environment variables " +
        "(scope: Functions).",
    };
  }

  await postToDiscord(webhook, message, { mentionRoles: true });
  // After the post, never before: a claimed-but-unsent announcement would
  // leave the group uninformed with nothing left to retry it.
  await writeUnlockState({ announcedAt: now.toISOString() });

  return { unlocked: true, announced: true, message, posted: true, reason: "Posted." };
}
