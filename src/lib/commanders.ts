import { BANNED_COMMANDERS, BANNED_PAIRS } from "./rules";
import type { Commander } from "./scryfall/types";

export type ColorCode = "W" | "U" | "B" | "R" | "G";

export type CommanderFilters = {
  /** Exclude commanders whose colour identity contains this colour. */
  colorVeto?: ColorCode | null;
};

export type CommanderSuggestion = {
  commander: Commander;
  /** Set only when the commander has partner and a legal partner exists. */
  partner: Commander | null;
};

const BANNED = new Set<string>(BANNED_COMMANDERS);

/** True when these two cards may not be partnered together. */
function isBannedPair(a: string, b: string): boolean {
  return BANNED_PAIRS.some(
    ([x, y]) => (a === x && b === y) || (a === y && b === x)
  );
}

/** Applies the ban list and the colour veto. */
export function legalCommanders(
  pool: Commander[],
  filters: CommanderFilters
): Commander[] {
  return pool.filter((card) => {
    if (BANNED.has(card.name)) {
      return false;
    }
    if (filters.colorVeto && card.colorIdentity.includes(filters.colorVeto)) {
      return false;
    }
    return true;
  });
}

/**
 * Picks a random legal commander, plus a partner when the roll has one.
 *
 * `rng` returns a float in [0, 1) and is injected so tests are deterministic.
 * Returns null when no commander survives the filters.
 */
export function pickCommander(
  pool: Commander[],
  filters: CommanderFilters,
  rng: () => number = Math.random
): CommanderSuggestion | null {
  const legal = legalCommanders(pool, filters);
  if (legal.length === 0) {
    return null;
  }

  const commander = legal[Math.floor(rng() * legal.length)];
  if (!commander.hasPartner) {
    return { commander, partner: null };
  }

  const partners = legal.filter(
    (card) =>
      card.hasPartner &&
      card.id !== commander.id &&
      !isBannedPair(commander.name, card.name)
  );

  if (partners.length === 0) {
    return { commander, partner: null };
  }

  return {
    commander,
    partner: partners[Math.floor(rng() * partners.length)],
  };
}
