import demoEvent from "@/demo/demo-event.json";
import type { EventData } from "./participants";

/**
 * Demo data for the /demo routes.
 *
 * Deliberately does NOT import ./store — there is no code path from the demo
 * pages to real participant data, and no env var that could redirect this at
 * the real store.
 */
export function readDemoEvent(): EventData {
  return demoEvent as EventData;
}
