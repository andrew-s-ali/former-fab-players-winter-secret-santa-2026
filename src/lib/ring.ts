import type { Participant } from "./participants";

export type RingStep = { from: string; to: string };

export type Ring = {
  /** Participant names in gift order. */
  names: string[];
  /** One edge per participant; the last closes the loop. */
  steps: RingStep[];
};

/**
 * Turns the assignment map into a ring for display.
 *
 * The draw is a single cycle by construction, so anything else means the data
 * was corrupted — by a bad edit or a partial write. This throws rather than
 * rendering a picture that would quietly misrepresent who gave to whom.
 */
export function buildRing(participants: Participant[]): Ring {
  if (participants.length < 2) {
    throw new Error("A ring needs at least 2 participants.");
  }

  const byId = new Map(participants.map((p) => [p.id, p]));
  const names: string[] = [];
  const visited = new Set<string>();

  let current = participants[0];
  for (let i = 0; i < participants.length; i++) {
    if (visited.has(current.id)) {
      throw new Error("Assignments do not form a single cycle.");
    }
    visited.add(current.id);
    names.push(current.name);

    const next = byId.get(current.recipientId);
    if (!next) {
      throw new Error(
        `Participant ${current.name} points at unknown recipient ${current.recipientId}.`
      );
    }
    current = next;
  }

  // After exactly n hops a single cycle lands back at the start.
  if (current.id !== participants[0].id || visited.size !== participants.length) {
    throw new Error("Assignments do not form a single cycle.");
  }

  const steps = names.map((from, i) => ({
    from,
    to: names[(i + 1) % names.length],
  }));

  return { names, steps };
}
