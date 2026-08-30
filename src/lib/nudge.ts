import { requiredSelectionCount, type SavedSelection } from "#lib/card-pool";
import { mentionFor } from "#lib/discord";
import { WORKSHOP_CLOSE_AT, eventTitle } from "#lib/event";
import { formatDeadline } from "#lib/launch";
import type { EventData } from "#lib/participants";

/**
 * Chasing the people who still owe card picks.
 *
 * The exchange cannot start until everybody has picked one commander for
 * everybody else, and that is deliberate — it is a group of friends who can
 * bug each other. This is the tooling for the bugging: it works out who is
 * holding things up and writes the message, and nothing more.
 *
 * Pure on purpose. Deciding what to say is the part worth testing, and it
 * needs neither Discord nor a database to do it.
 *
 * **Nothing here may ever touch an assignment.** The counts are per person and
 * say nothing about who draws whom — safe because everybody picks for
 * everybody. Reveal tokens are not in this file's inputs at all, which is the
 * structural version of that promise rather than a rule to remember.
 */

/** One person and how many picks they still owe. */
export type Outstanding = {
  name: string;
  owed: number;
  /**
   * Their Discord user id or handle, or null.
   *
   * Carried here so the message can address them properly. Only an id
   * produces a real ping — see `mentionFor`, which falls back to the bold
   * name for anything else rather than rendering an `@handle` that looks like
   * a mention which failed.
   */
  discord: string | null;
};

export type NudgeStatus = {
  participantCount: number;
  picksIn: number;
  picksRequired: number;
  /** Most owed first, then alphabetical. Empty once everybody has finished. */
  outstanding: Outstanding[];
  complete: boolean;
};

/**
 * Who still owes picks, counted per person.
 *
 * The organiser console shows the same shortfall per *pool* — "still to pick
 * for Ada: Brin, Cleo" — which is the right axis for seeing whether a pool
 * will fill and the wrong one for chasing anybody: one slow person appears
 * once under every other participant. This counts the other way round.
 */
export function nudgeStatus(
  event: EventData,
  rows: SavedSelection[]
): NudgeStatus {
  const { participants } = event;
  const owed = new Map(participants.map((person) => [person.id, participants.length - 1]));

  for (const row of rows) {
    // Self rows cannot exist (a database constraint refuses them) but this is
    // also handed rows by tests and the CLI, so it does not assume that.
    if (row.selectorId === row.recipientId) {
      continue;
    }
    const remaining = owed.get(row.selectorId);
    if (remaining !== undefined && owed.has(row.recipientId)) {
      owed.set(row.selectorId, remaining - 1);
    }
  }

  const outstanding = participants
    .map((person) => ({
      name: person.name,
      owed: owed.get(person.id) ?? 0,
      discord: person.discord,
    }))
    .filter((entry) => entry.owed > 0)
    .sort(
      (left, right) =>
        right.owed - left.owed || left.name.localeCompare(right.name)
    );

  const picksRequired = requiredSelectionCount(participants.length);
  const picksIn = picksRequired - outstanding.reduce((sum, e) => sum + e.owed, 0);

  return {
    participantCount: participants.length,
    picksIn,
    picksRequired,
    outstanding,
    complete: participants.length > 0 && outstanding.length === 0,
  };
}

/** Discord rejects a message body over 2000 characters. */
export const DISCORD_CONTENT_LIMIT = 2000;

/**
 * How the message addresses somebody.
 *
 * A real `<@id>` ping when the organiser has filled in a user id, and their
 * bold name otherwise. Injectable so tests can assert the message shape
 * without depending on the mention format.
 */
export type MentionResolver = (entry: Outstanding) => string;

const defaultMention: MentionResolver = (entry) =>
  mentionFor(entry.discord, entry.name);

/**
 * The nudge, or null when there is nothing worth saying.
 *
 * Returns null rather than a cheerful "all done!" for the complete case. A bot
 * that only ever speaks when something needs doing keeps getting read; one
 * that posts every day regardless gets muted, and a muted bot is worse than no
 * bot on the day it finally matters.
 */
export function nudgeMessage(
  status: NudgeStatus,
  { mention = defaultMention }: { mention?: MentionResolver } = {}
): string | null {
  if (status.participantCount === 0 || status.complete) {
    return null;
  }

  const header =
    `🎁 **${eventTitle()} — commander picks**\n\n` +
    `${status.picksIn} of ${status.picksRequired} picks are in. ` +
    `Waiting on ${status.outstanding.length} ` +
    `${status.outstanding.length === 1 ? "person" : "people"}:\n`;

  const footer =
    `\n\nEveryone picks one commander for every other player — that is what the ` +
    `shortlists are drawn from, so the exchange cannot start until the last ` +
    `one is in. Target: ${formatDeadline(WORKSHOP_CLOSE_AT)}. ` +
    `Your private link is the one you were emailed.`;

  const line = (entry: Outstanding) =>
    `• ${mention(entry)} — ${entry.owed} ${entry.owed === 1 ? "pick" : "picks"}`;

  const lines = status.outstanding.map(line);
  let body = lines.join("\n");

  // Truncating rather than letting Discord reject the whole post: the names
  // that fit are still worth sending, and this only bites at a party size this
  // event will never see.
  if (header.length + body.length + footer.length > DISCORD_CONTENT_LIMIT) {
    const kept: string[] = [];
    let used = header.length + footer.length;
    for (const [index, text] of lines.entries()) {
      const more = `\n…and ${lines.length - index} more`;
      if (used + text.length + 1 + more.length > DISCORD_CONTENT_LIMIT) {
        kept.push(more.trimStart());
        break;
      }
      used += text.length + 1;
      kept.push(text);
    }
    body = kept.join("\n");
  }

  return header + body + footer;
}

/**
 * A fingerprint of who owes what.
 *
 * Two posts with the same digest would say exactly the same thing, which is
 * how `shouldPost` tells "somebody finished, worth mentioning" from "the same
 * three people, again".
 */
export function nudgeDigest(status: NudgeStatus): string {
  // Names and counts only. Filling in somebody's Discord handle changes how
  // the next message is *addressed*, not what it says, and re-posting the same
  // news because the organiser did some admin is exactly the noise the quiet
  // period exists to prevent.
  return status.outstanding
    .map((entry) => `${entry.name.toLowerCase()}:${entry.owed}`)
    .join("|");
}

/** What the last post was, kept so the next one can stay quiet. */
export type NudgeState = { digest: string; postedAt: string };

/** How long to stay quiet when nothing has changed. */
export const QUIET_DAYS = 3;

/**
 * Whether to post now.
 *
 * Progress is news and gets posted immediately; no progress is not, and waits
 * out the quiet period. That combination means the channel hears "two people
 * left" the moment it becomes true, and hears about a stuck straggler every
 * few days rather than every morning.
 */
export function shouldPost(
  status: NudgeStatus,
  state: NudgeState | null,
  now: Date = new Date(),
  { quietDays = QUIET_DAYS }: { quietDays?: number } = {}
): { post: boolean; reason: string } {
  if (status.participantCount === 0) {
    return { post: false, reason: "No draw has run yet." };
  }
  if (status.complete) {
    return { post: false, reason: "Everybody has picked — nothing to chase." };
  }

  const digest = nudgeDigest(status);
  if (!state) {
    return { post: true, reason: "First nudge for this event." };
  }
  if (state.digest !== digest) {
    return { post: true, reason: "Somebody has picked since the last nudge." };
  }

  const elapsedDays =
    (now.getTime() - new Date(state.postedAt).getTime()) / 86_400_000;
  // A postedAt from the future — a clock skew, a hand-edited blob — must not
  // silence the bot forever, so anything that is not clearly inside the quiet
  // window posts.
  if (elapsedDays >= 0 && elapsedDays < quietDays) {
    return {
      post: false,
      reason:
        `Nothing has changed and the last nudge was ` +
        `${elapsedDays.toFixed(1)} day(s) ago (quiet for ${quietDays}).`,
    };
  }
  return { post: true, reason: `Nothing has changed, but it has been ${quietDays}+ days.` };
}
