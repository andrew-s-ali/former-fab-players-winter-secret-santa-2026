import { describe, expect, it } from "vitest";
import {
  BANNED_COMMANDERS,
  BANNED_PAIRS,
  BUDGET_USD,
  COMMANDER_POOL_QUERY,
  commanderPoolSearchUrl,
} from "./rules";

describe("event rules", () => {
  it("bans the six individually banned commanders", () => {
    expect(BANNED_COMMANDERS).toEqual([
      "Tatyova, Benthic Druid",
      "Alexios, Deimos of Kosmos",
      "Dionus, Elvish Archdruid",
      "Queza, Augur of Agonies",
      "Mica, Reader of Ruins",
      "Zada, Hedron Grinder",
    ]);
  });

  it("bans Malcolm + Kediss as a pair, not individually", () => {
    expect(BANNED_PAIRS).toEqual([
      ["Malcolm, Keen-Eyed Navigator", "Kediss, Emberclaw Familiar"],
    ]);
    expect(BANNED_COMMANDERS).not.toContain("Malcolm, Keen-Eyed Navigator");
    expect(BANNED_COMMANDERS).not.toContain("Kediss, Emberclaw Familiar");
  });

  it("sets the budget to 75 USD", () => {
    expect(BUDGET_USD).toBe(75);
  });

  it("defines the Scryfall query for the legal commander pool", () => {
    expect(COMMANDER_POOL_QUERY).toBe(
      "is:commander r:u game:paper -is:unset -e:slz"
    );
  });

  it("keeps the filters that change what is legal", () => {
    // Each of these is easy to drop in a reword, and no failure is visible
    // until somebody picks a card that should not have been offered.
    //
    // game:paper: without it the pool gains 49 Arena-only Alchemy cards, which
    // cannot be bought — and somebody has to hand over a physical deck.
    // -is:unset: un-set cards are not real commanders for this event, and the
    // f:edh that used to exclude them is gone.
    // -e:slz: a set whose uncommon printings are not meant to affect legality.
    expect(COMMANDER_POOL_QUERY).toContain("game:paper");
    expect(COMMANDER_POOL_QUERY).toContain("-is:unset");
    expect(COMMANDER_POOL_QUERY).toContain("-e:slz");
  });

  it("does not ask Scryfall for format legality", () => {
    // On purpose: legality lags a set's release by weeks, and the group wants
    // to pick from a set as soon as it can be bought. What is legal here is
    // the type line, the rarity and this file's own ban list.
    expect(COMMANDER_POOL_QUERY).not.toContain("f:edh");
  });

  it("links to a Scryfall search carrying the pool query", () => {
    const url = new URL(commanderPoolSearchUrl());

    expect(url.origin + url.pathname).toBe("https://scryfall.com/search");
    // One row per card, as `fetchCommanderPool` reads it — otherwise a card
    // with a dozen printings fills the first screen on its own.
    expect(url.searchParams.get("unique")).toBe("cards");
    expect(url.searchParams.get("q")).toContain(COMMANDER_POOL_QUERY);
  });

  it("excludes every banned commander from that search", () => {
    // Without this the search lists cards the save action then refuses, which
    // is a worse experience than not linking to it at all.
    const query = new URL(commanderPoolSearchUrl()).searchParams.get("q") ?? "";

    for (const name of BANNED_COMMANDERS) {
      expect(query).toContain(`-!"${name}"`);
    }
  });
});
