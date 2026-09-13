import { describe, expect, it } from "vitest";
import {
  daysUntilExchange,
  describeVote,
  exchangeMessage,
  formatExchangeDay,
} from "./announce";
import { PLAYERS_ROLE_ID } from "./discord";
import type { ExchangeVote } from "./admin";

const EXCHANGE = "2026-12-12T05:00:00Z";

const vote: ExchangeVote = {
  answered: 7,
  unanswered: [],
  winner: "2026-12-12",
  tallies: [
    { date: "2026-12-12", firsts: 4, points: 18, averageRank: 1.43 },
    { date: "2026-12-05", firsts: 3, points: 15, averageRank: 1.86 },
    { date: "2026-12-19", firsts: 0, points: 9, averageRank: 2.71 },
  ],
};

const message = (
  kind: Parameters<typeof exchangeMessage>[0]["kind"],
  extra: Partial<Parameters<typeof exchangeMessage>[0]> = {}
) =>
  exchangeMessage({
    kind,
    exchangeAt: EXCHANGE,
    now: new Date("2026-09-13T17:00:00Z"),
    picksOutstanding: 0,
    ...extra,
  });

describe("saying the date", () => {
  it("names the weekday, in the group's own zone", () => {
    // The date is local midnight Eastern. Read in UTC the weekday is still
    // Saturday here only by luck; reading it in the event zone is why.
    expect(formatExchangeDay(EXCHANGE)).toBe("Saturday, 12 December 2026");
  });

  it("counts whole days, and never counts backwards", () => {
    expect(daysUntilExchange(new Date("2026-12-11T17:00:00Z"), EXCHANGE)).toBe(1);
    expect(daysUntilExchange(new Date("2026-12-20T17:00:00Z"), EXCHANGE)).toBe(0);
  });
});

describe("the vote line", () => {
  it("reports the count behind the winning date", () => {
    expect(describeVote(vote, "2026-12-12")).toContain("4 of 7 first choices");
  });

  it("says nothing when there is no tally to quote", () => {
    // A claim about a vote has to be true, so an unreadable tally means the
    // sentence is dropped rather than guessed at.
    expect(describeVote(null, "2026-12-12")).toBeNull();
    expect(describeVote({ ...vote, answered: 0 }, "2026-12-12")).toBeNull();
    expect(describeVote(vote, "2026-12-05")).toContain("3 of 7");
    expect(describeVote(vote, "2026-11-01")).toBeNull();
  });
});

describe("each message", () => {
  const kinds = ["announcement", "fortnight", "two-weeks", "one-week", "eve"] as const;

  it("pings the players' role and nobody else in the server", () => {
    for (const kind of kinds) {
      expect(message(kind)).toContain(`<@&${PLAYERS_ROLE_ID}>`);
      // `@here` would wake the whole channel, including people not playing.
      expect(message(kind)).not.toContain("@here");
    }
  });

  it("names the day every time, so nobody has to go and look it up", () => {
    for (const kind of kinds) {
      expect(message(kind)).toContain("Saturday, 12 December 2026");
    }
  });

  it("states the ask everywhere it can still be acted on", () => {
    for (const kind of ["announcement", "fortnight", "two-weeks", "one-week"] as const) {
      expect(message(kind)).toContain("100-card Commander deck");
      expect(message(kind)).toContain("$75");
    }
  });

  it("asks people to keep the day free when the date is first announced", () => {
    expect(message("announcement", { vote })).toContain("keep the day free");
    expect(message("announcement", { vote })).toContain("4 of 7 first choices");
  });

  it("gets more pressing as the day approaches", () => {
    expect(message("two-weeks")).toMatch(/Two weeks to go/i);
    expect(message("one-week")).toMatch(/One week to go/i);
    expect(message("one-week")).toMatch(/shipping/i);
  });

  it("stops asking for anything the night before", () => {
    const eve = message("eve");

    // Nothing anybody can do about a budget or a decklist at that point; what
    // is left is turning up.
    expect(eve).toMatch(/Tomorrow/i);
    expect(eve).toContain("Looking forward");
    expect(eve).not.toContain("$75");
  });

  it("says assignments are locked while picks are outstanding", () => {
    const waiting = message("fortnight", { picksOutstanding: 12 });

    expect(waiting).toContain("12 picks are outstanding");
    expect(waiting).toMatch(/still locked/i);
  });

  it("still asks for the commander while assignments are locked", () => {
    // The ask outlives the locked phase, and the announcement is the message
    // most people read first. It used to be swallowed by the locked branch.
    for (const kind of ["announcement", "fortnight", "two-weeks", "one-week"] as const) {
      const waiting = message(kind, { picksOutstanding: 12 });
      expect(waiting).toMatch(/confirm which commander you are building/i);
      expect(waiting).toMatch(/once yours opens/i);
    }
  });

  it("keeps its paragraphs apart", () => {
    // Discord reads a single newline as a line break, so two points joined
    // that way arrive as one cramped block.
    const waiting = message("announcement", { picksOutstanding: 12 });

    expect(waiting).toContain("December you get.\n\n**Please confirm");
  });

  it("drops the not-yet-open caveat once assignments are open", () => {
    const open = message("announcement", { picksOutstanding: 0 });

    expect(open).toMatch(/confirm which commander you are building/i);
    expect(open).not.toMatch(/once yours opens/i);
  });

  it("agrees with itself when only one person is left to decide", () => {
    // "1 of you have not yet said" — the kind of thing nobody writes on
    // purpose and everybody notices in a channel.
    const one = message("fortnight", { picksOutstanding: 0, undecided: 1 });

    expect(one).toContain("One of you has not yet confirmed");
    expect(one).not.toContain("of you have not yet confirmed which");
  });

  it("switches to chasing the undecided once every pick is in", () => {
    const open = message("fortnight", { picksOutstanding: 0, undecided: 3 });

    expect(open).toContain("3 of you have not yet confirmed");
    expect(open).not.toMatch(/still locked/i);
  });

  it("falls back to plain instructions when progress cannot be read", () => {
    const blind = message("fortnight", { picksOutstanding: null, undecided: null });

    expect(blind).toMatch(/confirm which commander you are building/i);
    expect(blind).not.toMatch(/outstanding/i);
  });

  it("counts one day as a day", () => {
    expect(
      message("one-week", { now: new Date("2026-12-11T17:00:00Z") })
    ).toContain("**1 day** from today");
  });
});
