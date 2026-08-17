import { BANNED_COMMANDERS } from "./rules";
import type { Commander } from "./scryfall/types";

export type ColorCode = "W" | "U" | "B" | "R" | "G";

export const COLORS = new Set<string>(["W", "U", "B", "R", "G"]);

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

const BANNED = new Set<string>(BANNED_COMMANDERS);

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
