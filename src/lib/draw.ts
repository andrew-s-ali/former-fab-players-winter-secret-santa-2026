export type Person = { id: string; name: string };

/**
 * Assigns each participant a recipient, as a single cycle.
 *
 * Nobody draws themselves and everyone receives exactly once. `rng` returns a
 * float in [0, 1) and is injected so tests are deterministic.
 *
 * @throws if there are fewer than 2 participants, or ids repeat.
 */
export function drawAssignments(
  participants: Person[],
  rng: () => number = Math.random
): Map<string, string> {
  if (participants.length < 2) {
    throw new Error("A draw needs at least 2 participants.");
  }

  const ids = participants.map((p) => p.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Participants contain duplicate ids.");
  }

  // Fisher-Yates shuffle.
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  // Walk the shuffled order as one cycle: each position gives to the next,
  // and the last wraps to the first. Every cycle is a derangement, so nobody
  // can draw themselves — no retry loop needed.
  const assignments = new Map<string, string>();
  for (let i = 0; i < order.length; i++) {
    assignments.set(order[i], order[(i + 1) % order.length]);
  }

  return assignments;
}
