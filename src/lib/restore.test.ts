import { describe, expect, it } from "vitest";
import { testSelfCards } from "@/test-support/cards";
import type { EventData, Participant } from "./participants";
import {
  backupTakenAt,
  describeSummary,
  formatTakenAt,
  isRestorable,
  summarizeSnapshot,
} from "./restore";

function person(name: string, recipient: string, token = `tok-${name}`): Participant {
  return {
    id: name,
    name,
    email: `${name}@example.com`,
    recipientId: recipient,
    token,
    colorVeto: null,
    themeVeto: null,
    themeWish: null,
    discord: null,
    exchangeRanking: null,
    selfCards: testSelfCards(name),
  };
}

/** Four people in one closed ring, as a healthy snapshot holds them. */
const healthy: EventData = {
  participants: [
    person("a", "b"),
    person("b", "c"),
    person("c", "d"),
    person("d", "a"),
  ],
  revealedAt: null,
};

describe("reading a snapshot key", () => {
  it("recovers the instant writeEvent stamped into the key", () => {
    // The key is an ISO string with every `:` and `.` turned into `-`, so this
    // has to put them back rather than parse the key as written.
    expect(backupTakenAt("event.backup-2026-09-11T04-12-33-119Z.json")).toEqual(
      new Date("2026-09-11T04:12:33.119Z")
    );
  });

  it("says so rather than guessing when a key carries no readable time", () => {
    expect(backupTakenAt("event.backup-not-a-date.json")).toBeNull();
    expect(formatTakenAt("event.backup-not-a-date.json")).toBe("time unknown");
  });

  it("shows the time in the group's own zone, not UTC", () => {
    // 02:00 UTC on the 11th is ten at night on the 10th in New York. Listed in
    // UTC, a snapshot taken during an evening's work appears under the next
    // day's date, which is a snapshot nobody can place against what they did.
    const shown = formatTakenAt("event.backup-2026-09-11T02-00-00-000Z.json");

    expect(shown).toContain("10 Sept 2026");
    expect(shown).toContain("22:00");
  });
});

describe("summarising a snapshot", () => {
  it("reports a healthy event as restorable", () => {
    const summary = summarizeSnapshot(healthy);

    expect(summary.participants).toBe(4);
    expect(summary.names).toEqual(["a", "b", "c", "d"]);
    expect(summary.ringProblem).toBeNull();
    expect(summary.tokensIntact).toBe(true);
    expect(isRestorable(summary)).toBe(true);
    expect(describeSummary(summary)).toBe(
      "4 participants · ring closes · links intact · not revealed"
    );
  });

  it("never puts a token in what it returns", () => {
    // This prints to a terminal. A snapshot listing must not become a second
    // place the private links exist.
    expect(JSON.stringify(summarizeSnapshot(healthy))).not.toContain("tok-");
  });

  it("names a broken ring instead of hiding it behind a headcount", () => {
    // Two disjoint pairs: four participants, and an exchange that cannot run.
    const split: EventData = {
      participants: [
        person("a", "b"),
        person("b", "a"),
        person("c", "d"),
        person("d", "c"),
      ],
      revealedAt: null,
    };

    const summary = summarizeSnapshot(split);

    expect(summary.participants).toBe(4);
    expect(summary.ringProblem).not.toBeNull();
    expect(describeSummary(summary)).toContain("RING BROKEN");
    // Still restorable: the situation this exists for is that the event is
    // already lost, and a damaged copy beats none.
    expect(isRestorable(summary)).toBe(true);
  });

  it("flags two people sharing a private link", () => {
    const clashed: EventData = {
      participants: [
        person("a", "b", "same"),
        person("b", "c", "same"),
        person("c", "d"),
        person("d", "a"),
      ],
      revealedAt: null,
    };

    const summary = summarizeSnapshot(clashed);

    expect(summary.tokensIntact).toBe(false);
    expect(describeSummary(summary)).toContain("LINKS MISSING OR DUPLICATED");
  });

  it("refuses an empty snapshot, which would erase rather than recover", () => {
    const summary = summarizeSnapshot({ participants: [], revealedAt: null });

    expect(isRestorable(summary)).toBe(false);
    expect(summary.ringProblem).toBe("no participants");
  });

  it("carries the reveal state, because restoring one re-publishes the ring", () => {
    const summary = summarizeSnapshot({ ...healthy, revealedAt: "2026-12-12T00:00:00.000Z" });

    expect(describeSummary(summary)).toContain("revealed 2026-12-12T00:00:00.000Z");
  });
});
