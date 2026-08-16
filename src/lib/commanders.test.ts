import { describe, expect, it } from "vitest";
import { legalCommanders, pickCommander } from "./commanders";
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
