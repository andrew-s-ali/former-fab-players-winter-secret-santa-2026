import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCommanderPool } from "./pool";

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
  image_uris: { normal: `https://cards.scryfall.io/normal/${id}.jpg` },
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchCommanderPool", () => {
  it("follows pagination and normalises every card", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        pageResponse({
          data: [card("a", "Alpha")],
          has_more: true,
          next_page: "https://api.scryfall.com/cards/search?page=2",
          total_cards: 2,
        })
      )
      .mockResolvedValueOnce(
        pageResponse({
          data: [card("b", "Beta")],
          has_more: false,
          total_cards: 2,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const pool = await fetchCommanderPool();

    expect(pool.map((c) => c.name)).toEqual(["Alpha", "Beta"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.scryfall.com/cards/search?page=2"
    );
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.headers["User-Agent"]).toBe("FormerFabSecretSanta/1.0");
      expect(init.headers["Accept"]).toBe("application/json");
    }
  });

  it("sends the User-Agent and Accept headers Scryfall requires", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      pageResponse({ data: [card("a", "Alpha")], has_more: false, total_cards: 1 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchCommanderPool();

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["User-Agent"]).toBe("FormerFabSecretSanta/1.0");
    expect(init.headers["Accept"]).toBe("application/json");
  });

  it("throws a descriptive error when Scryfall fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 400 }))
    );

    await expect(fetchCommanderPool()).rejects.toThrow(/Scryfall request failed: 400/);
  });
});
