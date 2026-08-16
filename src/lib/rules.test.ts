import { describe, expect, it } from "vitest";
import {
  BANNED_COMMANDERS,
  BANNED_PAIRS,
  BUDGET_USD,
  COMMANDER_POOL_QUERY,
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
    expect(COMMANDER_POOL_QUERY).toBe("f:edh is:commander r:u game:paper");
  });
});
