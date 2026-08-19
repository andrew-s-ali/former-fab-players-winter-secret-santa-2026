import { describe, expect, it } from "vitest";
import {
  applyParticipantEdits,
  findParticipantByName,
  parseColor,
  summarizeEvent,
} from "./admin";
import type { EventData, Participant } from "./participants";

function participant(overrides: Partial<Participant> = {}): Participant {
  return {
    id: "p1",
    name: "Ada",
    recipientId: "p2",
    token: "tok-ada",
    colorVeto: "R",
    themeVeto: "mill",
    themeWish: "elves",
    ...overrides,
  };
}

function event(): EventData {
  return {
    participants: [
      participant(),
      participant({ id: "p2", name: "Bob", recipientId: "p1", token: "tok-bob" }),
    ],
    revealedAt: null,
  };
}

describe("parseColor", () => {
  it("accepts codes and words", () => {
    expect(parseColor("r")).toBe("R");
    expect(parseColor("Green")).toBe("G");
  });

  it("rejects anything else, listing what it does accept", () => {
    expect(() => parseColor("Crimson")).toThrow(/Crimson/);
    expect(() => parseColor("Crimson")).toThrow(/white/);
  });
});

describe("findParticipantByName", () => {
  it("matches case-insensitively", () => {
    expect(findParticipantByName(event(), "ADA").id).toBe("p1");
  });

  it("lists the known names when there is no match", () => {
    expect(() => findParticipantByName(event(), "Cleo")).toThrow(/Ada, Bob/);
  });
});

describe("applyParticipantEdits", () => {
  it("leaves undefined fields alone", () => {
    const p = participant();

    applyParticipantEdits(p, {});

    expect(p).toEqual(participant());
  });

  it("clears a field given the 'none' sentinel", () => {
    const p = participant();

    applyParticipantEdits(p, { color: "none", veto: "none", wish: "none" });

    expect(p.colorVeto).toBeNull();
    expect(p.themeVeto).toBeNull();
    expect(p.themeWish).toBeNull();
  });

  it("keeps free text that merely starts with 'none'", () => {
    const p = participant();

    applyParticipantEdits(p, { veto: "none of the tribal stuff" });

    expect(p.themeVeto).toBe("none of the tribal stuff");
  });

  it("reports the previous values", () => {
    const { before } = applyParticipantEdits(participant(), { color: "G" });

    expect(before.colorVeto).toBe("R");
  });

  it("never touches the assignment or the token", () => {
    // The whole point of editing rather than redrawing: links already sent
    // keep working, and nobody's recipient silently changes.
    const p = participant();

    applyParticipantEdits(p, { color: "G", veto: "none", wish: "dragons" });

    expect(p.recipientId).toBe("p2");
    expect(p.token).toBe("tok-ada");
  });
});

describe("summarizeEvent", () => {
  it("counts participants and reports reveal state", () => {
    const summary = summarizeEvent({ ...event(), revealedAt: "2026-12-12T00:00:00Z" });

    expect(summary.participantCount).toBe(2);
    expect(summary.revealedAt).toBe("2026-12-12T00:00:00Z");
  });

  it("carries no tokens and no assignments", () => {
    // The console is behind Identity, but the organiser is a participant too —
    // "who has whom" must not travel to the browser just to render a list.
    const serialized = JSON.stringify(summarizeEvent(event()));

    expect(serialized).not.toContain("tok-ada");
    expect(serialized).not.toContain("recipientId");
  });
});
