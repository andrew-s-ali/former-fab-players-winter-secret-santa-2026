import { EVENT_TIME_ZONE } from "#lib/launch";
import type { EventData } from "./participants";
import { buildRing } from "#lib/ring";

/**
 * Reading a snapshot well enough to choose between several of them.
 *
 * `writeEvent` has been quietly snapshotting the event before every write since
 * the start, and nothing could open one. The keys are timestamps and the
 * contents are the whole event, so the question an organiser actually has —
 * *which of these do I want back* — could only be answered by opening JSON by
 * hand and counting participants.
 *
 * No storage here: `store.ts` fetches the snapshots, this says what they are.
 */

/** Milliseconds in the ISO instant a backup key carries, or null if unreadable. */
export function backupTakenAt(key: string): Date | null {
  const stamp = key.replace(/^event\.backup-/, "").replace(/\.json$/, "");
  // The key was made by replacing every `:` and `.` in an ISO string with `-`.
  // Put them back: the last dash before the trailing Z separates milliseconds.
  const restored = stamp.replace(
    /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
    "$1T$2:$3:$4.$5Z"
  );
  const time = Date.parse(restored);
  return Number.isNaN(time) ? null : new Date(time);
}

/** When a snapshot was taken, in the group's own time zone. */
export function formatTakenAt(key: string): string {
  const taken = backupTakenAt(key);
  if (!taken) {
    return "time unknown";
  }
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: EVENT_TIME_ZONE,
  }).format(taken);
}

export type SnapshotSummary = {
  participants: number;
  names: string[];
  revealedAt: string | null;
  /** Null when the ring is a single closed cycle; the reason when it is not. */
  ringProblem: string | null;
  /** True when every participant has a token and no two share one. */
  tokensIntact: boolean;
};

/**
 * What is in a snapshot, without opening it by hand.
 *
 * The ring is checked with the same `buildRing` the reveal page runs, because
 * "six participants" is not the question — the question is whether restoring
 * this leaves an exchange that works. A snapshot with a broken ring is still
 * worth having when the alternative is nothing, so this reports rather than
 * refuses.
 *
 * **No tokens.** They are counted and checked, never returned: this prints to
 * a terminal, and a list of snapshots should not be a second place the private
 * links exist.
 */
export function summarizeSnapshot(event: EventData): SnapshotSummary {
  const names = event.participants.map((participant) => participant.name).sort();
  const tokens = event.participants.map((participant) => participant.token);

  let ringProblem: string | null = null;
  try {
    buildRing(event.participants);
  } catch (error) {
    ringProblem = error instanceof Error ? error.message : String(error);
  }

  return {
    participants: event.participants.length,
    names,
    revealedAt: event.revealedAt,
    ringProblem: event.participants.length === 0 ? "no participants" : ringProblem,
    tokensIntact:
      tokens.length > 0 &&
      tokens.every((token) => typeof token === "string" && token.length > 0) &&
      new Set(tokens).size === tokens.length,
  };
}

/** One line describing a snapshot, for a list somebody is choosing from. */
export function describeSummary(summary: SnapshotSummary): string {
  const parts = [
    `${summary.participants} participant${summary.participants === 1 ? "" : "s"}`,
    summary.ringProblem === null ? "ring closes" : `RING BROKEN: ${summary.ringProblem}`,
    summary.tokensIntact ? "links intact" : "LINKS MISSING OR DUPLICATED",
    summary.revealedAt === null ? "not revealed" : `revealed ${summary.revealedAt}`,
  ];
  return parts.join(" · ");
}

/**
 * Whether this snapshot is worth writing over the live event.
 *
 * Only emptiness disqualifies one. A broken ring or a missing token is a
 * warning and not a refusal — the situation this exists for is that the event
 * is already lost, and a damaged copy of it beats none.
 */
export function isRestorable(summary: SnapshotSummary): boolean {
  return summary.participants > 0;
}
