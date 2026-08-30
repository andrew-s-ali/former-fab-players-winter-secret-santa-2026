import { postToDiscord, webhookFromEnv } from "#lib/discord";
import { readAllSelections } from "#lib/card-selections";
import {
  nudgeDigest,
  nudgeMessage,
  nudgeStatus,
  shouldPost,
  type NudgeStatus,
} from "#lib/nudge";
import { readEvent, readNudgeState, writeNudgeState } from "#lib/store";

/**
 * Running a nudge: read the state of play, decide, post, remember.
 *
 * Lives here rather than in the scheduled function because three callers need
 * the same behaviour — the cron, the organiser console's "post now" button,
 * and `npm run nudge` — and a scheduled function is the one of the three that
 * cannot be tested locally at all. Same reason `src/lib/admin.ts` exists.
 */

export type NudgeResult = {
  status: NudgeStatus;
  /** What would be posted, or null when there is nothing to say. */
  message: string | null;
  posted: boolean;
  /** Why it did or did not post, for the log and the console. */
  reason: string;
};

/**
 * @param force Post even when the quiet period says otherwise — the console's
 *   button, where somebody has explicitly asked for it. Never set by the cron.
 *   It does not override "everybody has finished": there is genuinely nothing
 *   to say then, and posting an empty nudge would just be noise.
 * @param dryRun Work everything out and stop short of sending.
 */
export async function runNudge({
  force = false,
  dryRun = false,
  now = new Date(),
}: { force?: boolean; dryRun?: boolean; now?: Date } = {}): Promise<NudgeResult> {
  const event = await readEvent();
  const rows =
    event.participants.length > 0 ? await readAllSelections(event.participants) : [];
  const status = nudgeStatus(event, rows);
  const message = nudgeMessage(status);

  const state = await readNudgeState();
  const decision = shouldPost(status, state, now);
  const wanted = message !== null && (decision.post || force);
  const reason =
    force && !decision.post && message !== null
      ? `Posting anyway (asked for explicitly). Otherwise: ${decision.reason}`
      : decision.reason;

  if (!wanted || dryRun) {
    return {
      status,
      message,
      posted: false,
      reason: dryRun && wanted ? `Would post. ${reason}` : reason,
    };
  }

  const webhook = webhookFromEnv();
  if (!webhook) {
    return {
      status,
      message,
      posted: false,
      reason:
        "DISCORD_WEBHOOK_URL is not set, so there is nowhere to post. " +
        "Add it in Netlify under Project configuration > Environment variables " +
        "(scope: Functions).",
    };
  }

  await postToDiscord(webhook, message!);
  // Written only after a successful post: a failed send that still recorded
  // its digest would go quiet for the whole quiet period having said nothing.
  await writeNudgeState({ digest: nudgeDigest(status), postedAt: now.toISOString() });

  return { status, message, posted: true, reason };
}
