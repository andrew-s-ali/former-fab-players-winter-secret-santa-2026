import { BANNED_COMMANDERS, BANNED_PAIRS } from "./rules";
import type { Commander } from "./scryfall/types";

export type ColorCode = "W" | "U" | "B" | "R" | "G";

export type CommanderFilters = {
  /** Hard exclusion: drop commanders whose identity contains this colour. */
  colorVeto?: ColorCode | null;
  /** Keep only commanders whose identity fits inside these colours. Empty means no filter. */
  colors?: ColorCode[];
  /** Case-insensitive substring match on the card name. */
  query?: string;
  /** Keep only commanders that can pair with another commander. */
  pairsOnly?: boolean;
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

/** Applies the ban list, the colour veto, the colour selection and the search. */
export function legalCommanders(
  pool: Commander[],
  filters: CommanderFilters
): Commander[] {
  const colors = filters.colors ?? [];
  const query = (filters.query ?? "").trim().toLowerCase();

  return pool.filter((card) => {
    if (BANNED.has(card.name)) {
      return false;
    }
    if (filters.colorVeto && card.colorIdentity.includes(filters.colorVeto)) {
      return false;
    }
    // Subset semantics: a two-colour commander needs both of its colours
    // selected. Colourless commanders have an empty identity, so they pass
    // every selection — which is correct, they fit in any deck.
    if (colors.length > 0 && !card.colorIdentity.every((c) => colors.includes(c as ColorCode))) {
      return false;
    }
    if (query && !card.name.toLowerCase().includes(query)) {
      return false;
    }
    if (filters.pairsOnly && !card.canPair) {
      return false;
    }
    return true;
  });
}

/**
 * Picks up to `n` distinct random commanders matching the filters.
 *
 * `rng` returns a float in [0, 1) and is injected so tests are deterministic.
 */
export function sampleCommanders(
  pool: Commander[],
  filters: CommanderFilters,
  n: number,
  rng: () => number = Math.random
): Commander[] {
  const legal = [...legalCommanders(pool, filters)];

  // Partial Fisher-Yates: shuffle only as far as we need.
  const take = Math.min(n, legal.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(rng() * (legal.length - i));
    [legal[i], legal[j]] = [legal[j], legal[i]];
  }

  return legal.slice(0, take);
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
