import { describe, expect, it } from "vitest";
import {
  EDITABLE_FIELDS,
  applyParticipantEdits,
  buildPools,
  findParticipantByName,
  parseColor,
  summarizeEvent,
} from "./admin";
import type { EventData, Participant } from "./participants";
import { soloPick } from "./pairing";
import type { Commander } from "./scryfall/types";

function commander(name: string, colorIdentity: string[]): Commander {
  return {
    id: name.toLowerCase(),
    name,
    manaCost: "{2}",
    typeLine: "Legendary Creature",
    oracleText: "",
    colorIdentity,
    imageUrl: null,
    scryfallUrl: `https://scryfall.com/card/${name.toLowerCase()}`,
    hasPartner: false,
    setName: "Test Set",
    rarity: "uncommon",
    canPair: false,
    priceUsd: "1.00",
    priceIsFoil: false,
    pairingRole: null,
  };
}

function participant(overrides: Partial<Participant> = {}): Participant {
  return {
    id: "p1",
    name: "Ada",
    email: "ada@example.com",
    recipientId: "p2",
    token: "tok-ada",
    colorVeto: "R",
    themeVeto: "mill",
    themeWish: "elves",
    discord: null,
    selfCards: [soloPick(commander("Blue Pick", ["U"])), soloPick(commander("White Pick", ["W"]))],
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

describe("applyParticipantEdits and the participant's own pool cards", () => {
  // The veto now constrains cards that are already in the participant's pool
  // for everyone else to draw from, and nothing downstream re-checks them.
  it("refuses a colour the participant's own pool cards carry, naming them", () => {
    const p = participant({
      selfCards: [soloPick(commander("Green Pick", ["G"])), soloPick(commander("White Pick", ["W"]))],
    });

    expect(() => applyParticipantEdits(p, { color: "G" })).toThrow(/Green Pick/);
    expect(p.colorVeto).toBe("R");
  });

  it("allows a colour none of them carry", () => {
    const p = participant();

    applyParticipantEdits(p, { color: "G" });

    expect(p.colorVeto).toBe("G");
  });

  it("always allows clearing the veto", () => {
    const p = participant({
      selfCards: [soloPick(commander("Green Pick", ["G"])), soloPick(commander("White Pick", ["W"]))],
    });

    applyParticipantEdits(p, { color: "none" });

    expect(p.colorVeto).toBeNull();
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

describe("buildPools", () => {
  const people = ["Ada", "Bob", "Cleo", "Dev"].map((name, index) =>
    participant({
      id: `p${index + 1}`,
      name,
      email: `${name.toLowerCase()}@example.com`,
      recipientId: `p${((index + 1) % 4) + 1}`,
      token: `tok-${index}`,
      colorVeto: null,
      selfCards: [
        soloPick(commander(`${name} own 1`, [])),
        soloPick(commander(`${name} own 2`, [])),
      ],
    })
  );
  const event = { participants: people, revealedAt: null };

  const pick = (selector: string, recipient: string, card: string) => ({
    selectorId: selector,
    recipientId: recipient,
    slot: 1,
    card: soloPick(commander(card, [])),
  });

  it("lists a participant's own two choices", () => {
    const [ada] = buildPools(event, []);

    expect(ada.name).toBe("Ada");
    expect(ada.own.map((p) => p.commander.name)).toEqual(["Ada own 1", "Ada own 2"]);
  });

  // Everybody picks for everybody, so saying who chose what reveals nothing
  // about who was assigned whom — and without it the organiser cannot tell who
  // still needs chasing.
  it("attributes each contribution to whoever made it", () => {
    const [ada] = buildPools(event, [
      pick("p3", "p1", "From Cleo"),
      pick("p2", "p1", "From Bob"),
    ]);

    expect(ada.contributed).toEqual([
      { from: "Bob", pick: expect.objectContaining({}) },
      { from: "Cleo", pick: expect.objectContaining({}) },
    ]);
    expect(ada.contributed.map((c) => c.pick.commander.name)).toEqual([
      "From Bob",
      "From Cleo",
    ]);
  });

  it("names who has not picked for them yet", () => {
    const [ada] = buildPools(event, [pick("p2", "p1", "From Bob")]);

    expect(ada.awaiting).toEqual(["Cleo", "Dev"]);
  });

  it("says nobody is awaited once everyone has picked", () => {
    const [ada] = buildPools(event, [
      pick("p2", "p1", "x"),
      pick("p3", "p1", "y"),
      pick("p4", "p1", "z"),
    ]);

    expect(ada.awaiting).toEqual([]);
  });

  // Four distinct choices are what the exchange needs, so duplicates have to
  // be visible as a shortfall rather than counted twice.
  it("counts distinct choices, not rows", () => {
    const duplicate = "Same Card";
    const [ada] = buildPools(event, [
      pick("p2", "p1", duplicate),
      pick("p3", "p1", duplicate),
      pick("p4", "p1", duplicate),
    ]);

    // Two of their own plus one distinct contribution.
    expect(ada.contributed).toHaveLength(3);
    expect(ada.distinctCount).toBe(3);
  });

  it("ignores rows belonging to somebody else's pool", () => {
    const [ada] = buildPools(event, [pick("p1", "p2", "For Bob")]);

    expect(ada.contributed).toEqual([]);
    expect(ada.awaiting).toEqual(["Bob", "Cleo", "Dev"]);
  });
});

describe("editing a participant's Discord", () => {
  it("stores a pasted mention as a bare id", () => {
    const target = participant();

    applyParticipantEdits(target, { discord: "<@185432109876543210>" });

    expect(target.discord).toBe("185432109876543210");
  });

  it("stores a handle with the leading @ stripped", () => {
    const target = participant();

    applyParticipantEdits(target, { discord: "@ada_lovelace" });

    expect(target.discord).toBe("ada_lovelace");
  });

  it("clears it with none", () => {
    const target = participant();
    target.discord = "185432109876543210";

    applyParticipantEdits(target, { discord: "none" });

    expect(target.discord).toBeNull();
  });

  it("refuses input that is neither, rather than storing a value that never pings", () => {
    const target = participant();

    expect(() =>
      applyParticipantEdits(target, { discord: "<@&123456789012345678>" })
    ).toThrow();
    expect(target.discord).toBeNull();
  });

  it("leaves it alone when the field is not given", () => {
    const target = participant();
    target.discord = "ada_lovelace";

    applyParticipantEdits(target, { wish: "elves" });

    expect(target.discord).toBe("ada_lovelace");
  });

  it("reports the previous value, like every other editable field", () => {
    const target = participant();
    target.discord = "old_handle";

    const { before } = applyParticipantEdits(target, {
      discord: "185432109876543210",
    });

    expect(before.discord).toBe("old_handle");
    expect(EDITABLE_FIELDS).toContain("discord");
  });
});
