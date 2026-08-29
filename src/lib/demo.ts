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
