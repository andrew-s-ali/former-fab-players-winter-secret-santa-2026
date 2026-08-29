import { soloPick, type CommanderPick } from "@/lib/pairing";
import type { Commander } from "@/lib/scryfall/types";

/**
 * Commander fixtures for tests.
 *
 * Test-only: nothing under `src/app` or `src/components` imports this, so it
 * never reaches a bundle. It lives here rather than being repeated inline
 * because `Participant.selfCards` is a required pair of full `Commander`
 * objects, and every participant fixture in the suite needs one.
 */
export function testCommander(
  id: string,
  overrides: Partial<Commander> = {}
): Commander {
  return {
    id,
    name: `Card ${id}`,
    manaCost: "{1}{G}",
    typeLine: "Legendary Creature — Elf",
    oracleText: "Text.",
    colorIdentity: [],
    imageUrl: null,
    scryfallUrl: `https://scryfall.com/card/${id}`,
    hasPartner: false,
    pairingRole: null,
    canPair: false,
    setName: "Test Set",
    rarity: "uncommon",
    priceUsd: null,
    priceIsFoil: false,
    ...overrides,
  };
}

/** A lone commander as a pick. */
export function testPick(id: string, overrides: Partial<Commander> = {}): CommanderPick {
  return soloPick(testCommander(id, overrides));
}

/** A partner pair, for exercising the two-card shape. */
export function testPairPick(first: string, second: string): CommanderPick {
  return {
    commander: testCommander(first, { pairingRole: "partner" }),
    partner: testCommander(second, { pairingRole: "partner" }),
  };
}

/** Two distinct choices, for the `selfCards` every participant fixture needs. */
export function testSelfCards(prefix = "self"): [CommanderPick, CommanderPick] {
  return [testPick(`${prefix}-1`), testPick(`${prefix}-2`)];
}
