import { describe, expect, it } from "vitest";
import {
  EDITABLE_FIELDS,
  buildSignupRoster,
  tallyExchangeDates,
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
    exchangeRanking: null,
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

describe("tallyExchangeDates", () => {
  const DEC5 = "2026-12-05";
  const DEC12 = "2026-12-12";
  const DEC19 = "2026-12-19";

  function voters(rankings: (string[] | null)[]): EventData {
    return {
      revealedAt: null,
      participants: rankings.map((exchangeRanking, index) =>
        participant({
          id: `p${index}`,
          name: `Person ${index}`,
          recipientId: `p${(index + 1) % rankings.length}`,
          exchangeRanking,
        })
      ),
    };
  }

  it("counts first choices and Borda points side by side", () => {
    const vote = tallyExchangeDates(
      voters([
        [DEC12, DEC5, DEC19],
        [DEC12, DEC19, DEC5],
        [DEC5, DEC12, DEC19],
      ])
    );

    const dec12 = vote.tallies.find((t) => t.date === DEC12)!;
    expect(dec12.firsts).toBe(2);
    expect(dec12.points).toBe(3 + 3 + 2);
    expect(vote.winner).toBe(DEC12);
    expect(vote.answered).toBe(3);
  });

  it("orders the table best first", () => {
    const vote = tallyExchangeDates(
      voters([
        [DEC19, DEC12, DEC5],
        [DEC19, DEC12, DEC5],
      ])
    );

    expect(vote.tallies.map((t) => t.date)).toEqual([DEC19, DEC12, DEC5]);
  });

  it("reports the average position", () => {
    const vote = tallyExchangeDates(
      voters([
        [DEC5, DEC12, DEC19],
        [DEC12, DEC5, DEC19],
      ])
    );

    // First and second: (1 + 2) / 2.
    expect(vote.tallies.find((t) => t.date === DEC5)!.averageRank).toBe(1.5);
    expect(vote.tallies.find((t) => t.date === DEC19)!.averageRank).toBe(3);
  });

  it("declares no winner when the top two cannot be separated", () => {
    const vote = tallyExchangeDates(
      voters([
        [DEC5, DEC12, DEC19],
        [DEC12, DEC5, DEC19],
      ])
    );

    expect(vote.winner).toBeNull();
  });

  it("gives an abstention no weight at all, and names who abstained", () => {
    // Counting a blank as a vote for the middle date would let the people who
    // did not answer decide it.
    const withAbstention = tallyExchangeDates(
      voters([[DEC19, DEC12, DEC5], null, null])
    );
    const without = tallyExchangeDates(voters([[DEC19, DEC12, DEC5]]));

    expect(withAbstention.tallies).toEqual(without.tallies);
    expect(withAbstention.answered).toBe(1);
    expect(withAbstention.unanswered).toEqual(["Person 1", "Person 2"]);
  });

  it("is a well-formed empty result when nobody has answered", () => {
    const vote = tallyExchangeDates(voters([null, null]));

    expect(vote.answered).toBe(0);
    expect(vote.winner).toBeNull();
    expect(vote.tallies.every((t) => t.points === 0 && t.averageRank === null)).toBe(true);
  });
});

describe("buildSignupRoster", () => {
  const entry = (
    name: string,
    submittedAt: string,
    email = "someone@example.com",
    colorVeto: "R" | null = null
  ) => ({
    submittedAt,
    input: {
      name,
      email,
      colorVeto,
      themeVeto: null,
      themeWish: null,
      exchangeRanking: null,
      selfCards: [
        { commander: "First", partner: null },
        { commander: "Second", partner: "Third" },
      ] as [
        { commander: string; partner: string | null },
        { commander: string; partner: string | null },
      ],
    },
  });

  it("lists everyone who has signed up", () => {
    const roster = buildSignupRoster([
      entry("Ada", "2026-09-01T10:00:00Z"),
      entry("Brin", "2026-09-01T11:00:00Z", "brin@example.com"),
    ]);

    expect(roster.entries.map((e) => e.name)).toEqual(["Ada", "Brin"]);
    expect(roster.problem).toBeNull();
    expect(roster.submissionCount).toBe(2);
  });

  it("shows a partner pair as one choice", () => {
    const [person] = buildSignupRoster([entry("Ada", "2026-09-01T10:00:00Z")]).entries;

    expect(person.cards).toEqual(["First", "Second + Third"]);
  });

  it("collapses a resubmission and flags it, the way the draw will", () => {
    const roster = buildSignupRoster([
      entry("Ada", "2026-09-01T10:00:00Z", "ada@example.com"),
      entry("ada", "2026-09-02T10:00:00Z", "ada@example.com", "R"),
    ]);

    expect(roster.entries).toHaveLength(1);
    expect(roster.entries[0].updated).toBe(true);
    // The newest answers, so the console previews what will actually be drawn.
    expect(roster.entries[0].colorVeto).toBe("R");
    expect(roster.submissionCount).toBe(2);
  });

  it("reports a name clash days early instead of throwing", () => {
    // Two people sharing a name needs the organiser to talk to somebody, so
    // finding out now rather than on draw day is the whole point. A console
    // that goes blank would be worse than one showing a warning.
    const roster = buildSignupRoster([
      entry("Ada", "2026-09-01T10:00:00Z", "ada@example.com"),
      entry("ada", "2026-09-02T10:00:00Z", "other@example.com"),
    ]);

    expect(roster.problem).toMatch(/both named/i);
    expect(roster.entries).toHaveLength(2);
  });

  it("is an empty roster, not an error, before anybody signs up", () => {
    expect(buildSignupRoster([])).toEqual({
      entries: [],
      submissionCount: 0,
      problem: null,
    });
  });
});
