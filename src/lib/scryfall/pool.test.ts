import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCommanderPool, resetCommanderPoolCache } from "./pool";

function pageResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const card = (id: string, name: string) => ({
  id,
  name,
  mana_cost: "{1}{U}",
  type_line: "Legendary Creature — Human Wizard",
  oracle_text: "Draw a card.",
  color_identity: ["U"],
  keywords: [],
  layout: "normal",
  scryfall_uri: `https://scryfall.com/card/${id}`,
  set_name: "Test Set",
  rarity: "uncommon",
  image_uris: { normal: `https://cards.scryfall.io/normal/${id}.jpg` },
});

beforeEach(() => {
  // Each case starts from a cold pool; the memo is process-wide by design.
  resetCommanderPoolCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchCommanderPool", () => {
  it("follows pagination and normalises every card", async () => {
    // Routed by URL because fetchCommanderPool now also fires an
    // unconditional otag:pair-commander query alongside pool pagination.
    const fetchMock = vi.fn(async (url: string, _init: { headers: Record<string, string> }) => {
      if (decodeURIComponent(url).includes("otag:pair-commander")) {
        return pageResponse({ data: [], has_more: false, total_cards: 0 });
      }
      if (url.includes("page=2")) {
        return pageResponse({ data: [card("b", "Beta")], has_more: false, total_cards: 2 });
      }
      return pageResponse({
        data: [card("a", "Alpha")],
        has_more: true,
        next_page: "https://api.scryfall.com/cards/search?page=2",
        total_cards: 2,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const pool = await fetchCommanderPool();

    expect(pool.map((c) => c.name)).toEqual(["Alpha", "Beta"]);
    const poolCalls = fetchMock.mock.calls.filter(
      ([url]) => !decodeURIComponent(url).includes("otag:pair-commander")
    );
    expect(poolCalls).toHaveLength(2);
    expect(poolCalls[1][0]).toBe("https://api.scryfall.com/cards/search?page=2");
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.headers["User-Agent"]).toBe("FormerFabSecretSanta/1.0");
      expect(init.headers["Accept"]).toBe("application/json");
    }
  });

  it("sends the User-Agent and Accept headers Scryfall requires", async () => {
    // A fresh Response per call: fetchCommanderPool fires two queries in
    // parallel, and a Response body can only be read once.
    const fetchMock = vi.fn(async (_url: string, _init: { headers: Record<string, string> }) =>
      pageResponse({ data: [card("a", "Alpha")], has_more: false, total_cards: 1 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchCommanderPool();

    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.headers["User-Agent"]).toBe("FormerFabSecretSanta/1.0");
      expect(init.headers["Accept"]).toBe("application/json");
    }
  });

  it("throws a descriptive error when Scryfall fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 400 }))
    );

    await expect(fetchCommanderPool()).rejects.toThrow(/Scryfall request failed: 400/);
  });
});

/** Routes each query to its own response so the two fetches can differ. */
function mockPoolAndPairs(poolCards: unknown[], pairCards: unknown[] | number) {
  const fetchMock = vi.fn(async (url: string) => {
    const isPairQuery = decodeURIComponent(url).includes("otag:pair-commander");
    if (isPairQuery) {
      if (typeof pairCards === "number") {
        return new Response("{}", { status: pairCards });
      }
      return pageResponse({ data: pairCards, has_more: false, total_cards: pairCards.length });
    }
    return pageResponse({ data: poolCards, has_more: false, total_cards: poolCards.length });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("fetchCommanderPool partner flag", () => {
  it("marks cards that the tagged query returns", async () => {
    mockPoolAndPairs([card("a", "Alpha"), card("b", "Beta")], [card("a", "Alpha")]);

    const pool = await fetchCommanderPool();

    expect(pool.find((c) => c.id === "a")!.canPair).toBe(true);
    expect(pool.find((c) => c.id === "b")!.canPair).toBe(false);
  });

  it("treats a 404 from the tagged query as nothing pairable", async () => {
    mockPoolAndPairs([card("a", "Alpha")], 404);

    const pool = await fetchCommanderPool();

    expect(pool).toHaveLength(1);
    expect(pool[0].canPair).toBe(false);
  });

  it("still throws when the tagged query fails for another reason", async () => {
    // 400 rather than 500: a bad request means the query itself is wrong, so
    // it is not retried and surfaces immediately. A 500 is transient and gets
    // backed off instead — see the throttling tests below.
    mockPoolAndPairs([card("a", "Alpha")], 400);

    await expect(fetchCommanderPool()).rejects.toThrow(/Scryfall request failed: 400/);
  });
});

describe("being a good citizen of Scryfall", () => {
  it("never fires two requests at once, even though the queries look parallel", async () => {
    // `fetchCommanderPool` issues the pool and pair queries through
    // Promise.all. Before the throttle queue those interleaved with no gap at
    // all and doubled the request rate, which is what earned a 429.
    let inFlight = 0;
    let maxInFlight = 0;
    const at: number[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        at.push(Date.now());
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        const pair = decodeURIComponent(url).includes("otag:pair-commander");
        return pageResponse({
          data: pair ? [] : [card("a", "Alpha")],
          has_more: false,
          total_cards: pair ? 0 : 1,
        });
      })
    );

    await fetchCommanderPool();

    expect(maxInFlight).toBe(1);
    // And spaced, not merely serialised.
    for (let i = 1; i < at.length; i += 1) {
      expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(200);
    }
  }, 15_000);

  it("waits and retries when Scryfall says 429, rather than giving up", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls += 1;
        if (calls === 1) {
          return new Response("{}", { status: 429 });
        }
        const pair = decodeURIComponent(url).includes("otag:pair-commander");
        return pageResponse({
          data: pair ? [] : [card("a", "Alpha")],
          has_more: false,
          total_cards: pair ? 0 : 1,
        });
      })
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const pool = await fetchCommanderPool();

    expect(pool).toHaveLength(1);
    expect(calls).toBeGreaterThan(1);
  }, 15_000);

  it("says what to do when it keeps being throttled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 429, headers: { "retry-after": "0.01" } }))
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    // A Retry-After is honoured, which keeps this test quick and is also the
    // behaviour worth having: Scryfall knows better than a fixed curve.
    await expect(fetchCommanderPool()).rejects.toThrow(/rate-limits by IP/);
  }, 15_000);
});

describe("the process-wide pool memo", () => {
  it("fetches once and serves every caller after that", async () => {
    // Several routes and a Server Action call this. Next's fetch cache spares
    // the network but not the throttle queue, which cannot tell a cached
    // response from a real one — so without the memo every caller paid the
    // politeness gap, and a 21-second E2E run became three minutes.
    const fetchMock = mockPoolAndPairs([card("a", "Alpha")], []);

    const first = await fetchCommanderPool();
    const callsAfterFirst = fetchMock.mock.calls.length;
    const second = await fetchCommanderPool();

    expect(second).toBe(first);
    expect(fetchMock.mock.calls).toHaveLength(callsAfterFirst);
  });

  it("costs nothing on a second call", async () => {
    mockPoolAndPairs([card("a", "Alpha")], []);
    await fetchCommanderPool();

    const started = Date.now();
    await fetchCommanderPool();

    expect(Date.now() - started).toBeLessThan(50);
  });
});
