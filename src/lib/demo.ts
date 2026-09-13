import demoEvent from "@/demo/demo-event.json";
import type { SavedSelection } from "./card-pool";
import type { EventData } from "./participants";

/**
 * Demo data for the /demo routes.
 *
 * Deliberately does NOT import ./store — there is no code path from the demo
 * pages to real participant data, and no env var that could redirect this at
 * the real store. It does not reach a database either: the shortlist shown on
 * a demo link is computed by `card-pool.ts`, which is pure, over the
 * selections committed in this file.
 */
type DemoEvent = EventData & {
  /** A finished workshop: one pick per participant per other participant. */
  selections: SavedSelection[];
  /** Private workspaces, for the participants who have filled one in. */
  workspaces: Record<string, { decklistUrl: string | null; notes: string }>;
};

export function readDemoEvent(): EventData {
  return demoEvent as unknown as DemoEvent;
}

/** The completed card selections behind the demo shortlists. */
export function readDemoSelections(): SavedSelection[] {
  return (demoEvent as unknown as DemoEvent).selections;
}

/** The demo workspace for a participant — empty if they have not filled one in. */
export function readDemoWorkspace(participantId: string): {
  decklistUrl: string | null;
  notes: string;
} {
  return (
    (demoEvent as unknown as DemoEvent).workspaces[participantId] ?? {
      decklistUrl: null,
      notes: "",
    }
  );
}

/**
 * A deterministic stand-in for `Math.random`.
 *
 * Shared by both demo routes that draw a shortlist — the private link and the
 * reveal page — so the cards under the ring are the same cards that link
 * shows. Two copies of the seeding would drift apart silently.
 *
 * The real shortlist is drawn once and stored, so it never changes for a given
 * person. The demo has nowhere to store one, so the draw is seeded from the
 * token instead — otherwise reloading a demo link would reshuffle the three
 * cards and imply they are not fixed.
 */
export function stableRandom(seed: string): () => number {
  let state = 0;
  for (const character of seed) {
    state = (state * 31 + character.charCodeAt(0)) >>> 0;
  }
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}
