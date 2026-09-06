import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventData } from "#lib/participants";
import { testSelfCards } from "@/test-support/cards";

let event: EventData;
const written: EventData[] = [];
let stored: { input: Record<string, unknown>; cards: unknown; submittedAt: string }[];

vi.mock("#lib/store", () => ({
  describeTarget: () => "Using a test store",
  readEvent: async () => event,
  writeEvent: async (next: EventData) => {
    written.push(next);
  },
}));

vi.mock("#lib/signups", () => ({
  readSignups: async () => stored,
}));

const { main } = await import("./draw");

/** One sign-up as `readSignups` hands it over: answers plus resolved cards. */
function signup(name: string) {
  return {
    submittedAt: `2026-09-0${name.length}T10:00:00Z`,
    cards: testSelfCards(name.toLowerCase()),
    input: {
      name,
      email: `${name.toLowerCase()}@example.com`,
      colorVeto: null,
      themeVeto: null,
      themeWish: null,
      exchangeRanking: null,
      selfCards: [
        { commander: `${name} One`, partner: null },
        { commander: `${name} Two`, partner: null },
      ],
    },
  };
}

const originalEnv = { ...process.env };

beforeEach(() => {
  event = { participants: [], revealedAt: null };
  written.length = 0;
  stored = ["Ada", "Brin", "Cleo", "Dara"].map(signup);
  // No Netlify credentials, so the Forms cross-check warns and stands down
  // rather than reaching the network.
  process.env = { ...originalEnv };
  delete process.env.NETLIFY_SITE_ID;
  delete process.env.NETLIFY_AUTH_TOKEN;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

/** Everything the run printed, joined. */
function output(): string {
  const log = vi.mocked(console.log).mock.calls;
  return log.map((call) => call.join(" ")).join("\n");
}

describe("npm run draw (rehearsal by default)", () => {
  it("writes nothing", async () => {
    // The whole point. The real run is irreversible — it reshuffles everyone
    // and invalidates every link already sent.
    await main([]);

    expect(written).toEqual([]);
  });

  it("still does the work worth rehearsing", async () => {
    await main([]);

    expect(output()).toContain("4 participants would be drawn");
    expect(output()).toContain("Ada");
    expect(output()).toContain("single closed cycle across 4 people");
    expect(output()).toContain("nothing has been written");
  });

  it("shows an example pairing, labelled as discarded", async () => {
    // Safe to show, unlike on the real run: a rehearsal mints fresh ids and
    // shuffles again, so this ring is thrown away and the real draw produces
    // an independent one. Seeing it tells you nothing about that.
    await main([]);

    expect(output()).toMatch(/builds for/);
    expect(output()).toContain("EXAMPLE");
    expect(output()).toContain("discarded");
  });

  it("prints no tokens", async () => {
    // Those are throwaway too, and link-shaped strings that lead nowhere are
    // no use to somebody about to send links out.
    await main([]);

    expect(output()).not.toMatch(/\/s\/[A-Za-z0-9_-]{8,}/);
  });

  it("draws a different ring each time, which is why showing one is safe", async () => {
    const rings = new Set<string>();
    for (let run = 0; run < 6; run += 1) {
      vi.mocked(console.log).mockClear();
      await main([]);
      rings.add(
        output()
          .split("\n")
          .filter((line) => line.includes("builds for"))
          .join("|")
      );
    }

    expect(rings.size).toBeGreaterThan(1);
  });

  it("still refuses a party that is too small", async () => {
    stored = ["Ada", "Brin"].map(signup);

    await expect(main([])).rejects.toThrow(/at least 4 participants/);
    expect(written).toEqual([]);
  });

  it("rehearses over an existing draw without --force, and says so", async () => {
    // A rehearsal writes nothing, so an existing draw is no reason to refuse
    // it — but it is a reason to say the ring shown is not that one.
    event = {
      revealedAt: null,
      participants: [
        {
          id: "p1",
          name: "Existing",
          email: "existing@example.com",
          recipientId: "p1",
          token: "tok",
          colorVeto: null,
          themeVeto: null,
          themeWish: null,
          discord: null,
          exchangeRanking: null,
          selfCards: testSelfCards("existing"),
        },
      ],
    };

    await main([]);

    expect(output()).toContain("a draw already exists");
    expect(written).toEqual([]);
  });
});

describe("npm run draw -- --yes (for real)", () => {
  it("writes the event and prints one private link per person", async () => {
    await main(["--yes"]);

    expect(written).toHaveLength(1);
    expect(written[0].participants).toHaveLength(4);
    expect(output()).toMatch(/\/s\/[A-Za-z0-9_-]{8,}/);
  });

  it("still refuses to overwrite an existing draw without --force", async () => {
    event = { ...event, participants: [{ name: "Existing" }] as never };

    await expect(main(["--yes"])).rejects.toThrow(/already exists/);
    expect(written).toEqual([]);
  });
});

describe("argument checking", () => {
  it("refuses a mistyped --dry-run instead of drawing for real", async () => {
    // The failure this exists for. `--dry-rn` was silently dropped, and the
    // irreversible draw ran on a command typed specifically to avoid it.
    await expect(main(["--dry-rn"])).rejects.toThrow(/Unrecognised option/);
    expect(written).toEqual([]);
  });

  it("names what it does understand", async () => {
    await expect(main(["--dry-rn"])).rejects.toThrow(/--dry-run/);
  });

  it("refuses the argv a doubled-up paste produces", async () => {
    // Exactly what came out of `npm run draw -- --dry-runnpm run draw -- --dry-run`:
    // "run" was read as a CSV path and the real intent was lost.
    await expect(
      main(["--dry-runnpm", "run", "draw", "--", "--dry-run"])
    ).rejects.toThrow(/Unrecognised option/);
    expect(written).toEqual([]);
  });

  it("refuses more than one CSV path rather than ignoring the rest", async () => {
    await expect(main(["one.csv", "two.csv"])).rejects.toThrow(/at most one CSV/);
    expect(written).toEqual([]);
  });

  it("refuses a --from it cannot read", async () => {
    await expect(main(["--from=google-forms"])).rejects.toThrow(/netlify-forms/);
    expect(written).toEqual([]);
  });

  it("still accepts every flag it documents", async () => {
    await main(["--dry-run", "--latest-wins", "--ignore-unrecorded", "--force"]);

    expect(written).toEqual([]);
    expect(output()).toContain("nothing has been written");
  });
});

describe("the missing `--` separator", () => {
  it("costs a rehearsal, not a ring", async () => {
    // `npm run draw --yes` hands the flag to npm, so the script sees nothing
    // at all. That has to be the safe direction, because it is the form a slip
    // actually produces — and it produced one twice before this landed.
    await main([]);

    expect(written).toEqual([]);
    expect(output()).toContain("nothing has been written");
  });

  it("tells you the separator matters when it suggests the real command", async () => {
    await main([]);

    expect(output()).toContain("npm run draw -- --yes");
    expect(output()).toMatch(/`--` matters/);
  });
});
