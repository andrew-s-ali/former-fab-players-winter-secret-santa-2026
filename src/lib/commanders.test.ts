import { describe, expect, it } from "vitest";
import { legalCommanders, sampleCommanders } from "./commanders";
import type { Commander } from "./scryfall/types";

const make = (name: string, colorIdentity: string[], hasPartner = false): Commander => ({
  id: name.toLowerCase().replace(/\W+/g, "-"),
  name,
  manaCost: "{1}{G}",
  typeLine: "Legendary Creature — Elf Druid",
  oracleText: "",
  colorIdentity,
  imageUrl: null,
  scryfallUrl: `https://scryfall.com/${name}`,
  hasPartner,
  setName: "Commander 2019",
  rarity: "uncommon",
  canPair: false,
  priceUsd: null,
  priceIsFoil: false,
  pairingRole: null,
});

const pool: Commander[] = [
  make("Tatyova, Benthic Druid", ["G", "U"]),
  make("Zada, Hedron Grinder", ["R"]),
  make("Anara, Wolvid Familiar", ["G"], true),
  make("Malcolm, Keen-Eyed Navigator", ["U"], true),
  make("Kediss, Emberclaw Familiar", ["R"], true),
  make("Selvala, Explorer Returned", ["G", "W"]),
  make("Krark, the Thumbless", ["R"], true),
];

describe("legalCommanders", () => {
  it("removes banned commanders", () => {
    const names = legalCommanders(pool, {}).map((c) => c.name);

    expect(names).not.toContain("Tatyova, Benthic Druid");
    expect(names).not.toContain("Zada, Hedron Grinder");
  });

  it("keeps Malcolm and Kediss, which are only banned as a pair", () => {
    const names = legalCommanders(pool, {}).map((c) => c.name);

    expect(names).toContain("Malcolm, Keen-Eyed Navigator");
    expect(names).toContain("Kediss, Emberclaw Familiar");
  });

  it("removes every commander whose colour identity contains the vetoed colour", () => {
    const names = legalCommanders(pool, { colorVeto: "G" }).map((c) => c.name);

    expect(names).not.toContain("Anara, Wolvid Familiar");
    expect(names).not.toContain("Selvala, Explorer Returned");
    expect(names).toContain("Malcolm, Keen-Eyed Navigator");
  });
});

describe("legalCommanders colour and text filters", () => {
  it("keeps only commanders whose identity fits inside the selected colours", () => {
    const names = legalCommanders(pool, { colors: ["G", "W"] }).map((c) => c.name);

    expect(names).toContain("Anara, Wolvid Familiar");
    expect(names).toContain("Selvala, Explorer Returned");
    expect(names).not.toContain("Malcolm, Keen-Eyed Navigator");
  });

  it("treats an empty colour selection as no filter", () => {
    expect(legalCommanders(pool, { colors: [] })).toHaveLength(
      legalCommanders(pool, {}).length
    );
  });

  it("matches names case-insensitively on a substring", () => {
    const names = legalCommanders(pool, { query: "sel" }).map((c) => c.name);

    expect(names).toEqual(["Selvala, Explorer Returned"]);
  });

  it("still applies the veto alongside the new filters", () => {
    const names = legalCommanders(pool, { colors: ["G", "U"], colorVeto: "G" }).map(
      (c) => c.name
    );

    expect(names).not.toContain("Anara, Wolvid Familiar");
  });

  it("matches the theme against rules text, not the name", () => {
    // The whole point of a separate theme filter: prompt keywords are
    // mechanics, which essentially never appear in commander names.
    const themed = [
      { ...make("Nothing In The Name", ["G"]), oracleText: "Create a 1/1 token." },
      { ...make("Token Collector", ["G"]), oracleText: "Draw a card." },
    ];

    const names = legalCommanders(themed, { theme: "token" }).map((c) => c.name);

    expect(names).toEqual(["Nothing In The Name"]);
  });

  it("matches the theme case-insensitively", () => {
    const themed = [{ ...make("Sac Outlet", ["B"]), oracleText: "Sacrifice a creature." }];

    expect(legalCommanders(themed, { theme: "SACRIFICE" })).toHaveLength(1);
  });

  it("treats a blank theme as no filter", () => {
    expect(legalCommanders(pool, { theme: "   " })).toHaveLength(
      legalCommanders(pool, {}).length
    );
  });

  it("applies the theme alongside the name search", () => {
    const themed = [
      { ...make("Grave Titan", ["B"]), oracleText: "Create a 1/1 token." },
      { ...make("Grave Digger", ["B"]), oracleText: "Draw a card." },
      { ...make("Token Maker", ["B"]), oracleText: "Create a 1/1 token." },
    ];

    const names = legalCommanders(themed, { query: "grave", theme: "token" }).map(
      (c) => c.name
    );

    expect(names).toEqual(["Grave Titan"]);
  });

  it("keeps only commanders that can take a partner when asked", () => {
    const mixed = [
      { ...make("Pairs, the Willing", ["G"]), pairingRole: "partner" as const },
      { ...make("Chooser, the Host", ["G"]), pairingRole: "choose-background" as const },
      { ...make("Solo, the Lonely", ["G"]), pairingRole: null },
      // A Background pairs, but it is the second half — never the card you
      // start from — so it is not what this filter is asking for.
      { ...make("A Background", ["G"]), pairingRole: "background" as const },
    ];

    const names = legalCommanders(mixed, { pairsOnly: true }).map((c) => c.name);

    expect(names).toEqual(["Pairs, the Willing", "Chooser, the Host"]);
  });

  // A Background cannot lead a deck, so nothing that offers a commander should
  // list one. Callers opt out only if they specifically want the partner half —
  // /api/commanders/names does, because one response feeds both the commander
  // list and the partner list, and filtering there left "Choose a Background"
  // commanders with nothing to pair with.
  it("drops Backgrounds unless primaryOnly is turned off", () => {
    const mixed = [
      { ...make("Real Commander", ["G"]), pairingRole: null },
      { ...make("A Background", ["G"]), pairingRole: "background" as const },
    ];

    expect(legalCommanders(mixed, {}).map((c) => c.name)).toEqual(["Real Commander"]);
    expect(legalCommanders(mixed, { primaryOnly: false }).map((c) => c.name)).toEqual([
      "Real Commander",
      "A Background",
    ]);
  });

  it("ignores the pairable filter when it is off", () => {
    const mixed = [
      { ...make("Pairs, the Willing", ["G"]), canPair: true },
      { ...make("Solo, the Lonely", ["G"]), canPair: false },
    ];

    expect(legalCommanders(mixed, { pairsOnly: false })).toHaveLength(2);
  });
});

describe("sampleCommanders", () => {
  it("returns at most n cards", () => {
    expect(sampleCommanders(pool, {}, 2, () => 0)).toHaveLength(2);
  });

  it("returns every match when fewer than n exist", () => {
    const result = sampleCommanders(pool, { query: "selvala" }, 9, () => 0);

    expect(result).toHaveLength(1);
  });

  it("does not repeat a card within one sample", () => {
    const result = sampleCommanders(pool, {}, 5, () => 0.5);
    const ids = result.map((c) => c.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns an empty array when nothing matches", () => {
    expect(sampleCommanders(pool, { query: "zzzz" }, 9, () => 0)).toEqual([]);
  });
});
