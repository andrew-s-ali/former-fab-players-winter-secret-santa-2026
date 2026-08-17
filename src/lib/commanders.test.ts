import { describe, expect, it } from "vitest";
import { legalCommanders, pickCommander, sampleCommanders } from "./commanders";
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

describe("pickCommander", () => {
  it("returns a legal commander using the injected rng", () => {
    const result = pickCommander(pool, {}, () => 0);

    expect(result).not.toBeNull();
    expect(result!.commander.name).toBe("Anara, Wolvid Familiar");
  });

  it("stays in bounds when the rng returns its maximum", () => {
    // Guards the Math.floor(rng() * length) index: an rng at the top of its
    // [0, 1) range must select the last legal commander, never run off the end.
    const result = pickCommander(pool, {}, () => 1 - Number.EPSILON);

    expect(result).not.toBeNull();
    expect(result!.commander.name).toBe("Krark, the Thumbless");
  });

  it("offers a partner when the rolled commander has partner", () => {
    const result = pickCommander(pool, {}, () => 0);

    expect(result!.commander.hasPartner).toBe(true);
    expect(result!.partner).not.toBeNull();
    expect(result!.partner!.hasPartner).toBe(true);
    expect(result!.partner!.name).not.toBe(result!.commander.name);
  });

  it("never pairs Malcolm with Kediss", () => {
    const duo = [
      make("Malcolm, Keen-Eyed Navigator", ["U"], true),
      make("Kediss, Emberclaw Familiar", ["R"], true),
    ];

    const result = pickCommander(duo, {}, () => 0);

    expect(result!.commander.name).toBe("Malcolm, Keen-Eyed Navigator");
    expect(result!.partner).toBeNull();
  });

  it("returns null when the filters leave nothing", () => {
    expect(pickCommander([make("Zada, Hedron Grinder", ["R"])], {}, () => 0)).toBeNull();
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

  it("keeps only pairable commanders when asked", () => {
    const mixed = [
      { ...make("Pairs, the Willing", ["G"]), canPair: true },
      { ...make("Solo, the Lonely", ["G"]), canPair: false },
    ];

    const names = legalCommanders(mixed, { pairsOnly: true }).map((c) => c.name);

    expect(names).toEqual(["Pairs, the Willing"]);
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
