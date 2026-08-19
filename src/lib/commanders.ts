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
  /**
   * Case-insensitive substring match on the card's **rules text**.
   *
   * Deliberately separate from `query`. Theme prompts search for mechanics —
   * "token", "sacrifice", "graveyard" — which almost never appear in a card's
   * name: 16 of the 22 prompt keywords match zero names in the live pool, but
   * each matches between 9 and 462 cards by rules text. Folding this into
   * `query` instead would make a name search for "sel" also match every card
   * whose rules text happens to say "select".
   */
  theme?: string;
  /** Keep only commanders that can pair with another commander. */
  pairsOnly?: boolean;
};

const BANNED = new Set<string>(BANNED_COMMANDERS);

/**
 * Applies the ban list, the colour veto, the colour selection, the name search
 * and the theme (rules-text) search.
 */
export function legalCommanders(
  pool: Commander[],
  filters: CommanderFilters
): Commander[] {
  const colors = filters.colors ?? [];
  const query = (filters.query ?? "").trim().toLowerCase();
  const theme = (filters.theme ?? "").trim().toLowerCase();

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
    if (theme && !card.oracleText.toLowerCase().includes(theme)) {
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
