/** The subset of Scryfall's card object this app reads. */
export type ScryfallCard = {
  id: string;
  name: string;
  mana_cost?: string;
  type_line: string;
  oracle_text?: string;
  color_identity: string[];
  keywords: string[];
  layout: string;
  scryfall_uri: string;
  set_name: string;
  rarity: string;
  image_uris?: { normal?: string };
  prices?: {
    usd?: string | null;
    usd_foil?: string | null;
  };
  card_faces?: Array<{
    name: string;
    mana_cost?: string;
    oracle_text?: string;
    image_uris?: { normal?: string };
  }>;
};

export type ScryfallSearchPage = {
  data: ScryfallCard[];
  has_more: boolean;
  next_page?: string;
  total_cards: number;
};

/**
 * The three ways a card in this pool can be half of a commander pair.
 *
 * The live pool contains only these: 30 plain Partner, 20 "Choose a
 * Background", and 15 Backgrounds. There is deliberately no case for
 * "Partner with <name>", Friends forever or Doctor's companion — none appear
 * at uncommon today, and inventing a rule for one would be guessing. A card
 * Scryfall tags as pairable that matches none of these gets `null` and is
 * treated as unpairable, which is the safe direction: it refuses a legal pair
 * rather than accepting an illegal one.
 */
export type PairingRole = "partner" | "choose-background" | "background";

/** A commander, normalised to what the UI actually renders. */
export type Commander = {
  id: string;
  name: string;
  manaCost: string;
  typeLine: string;
  oracleText: string;
  colorIdentity: string[];
  imageUrl: string | null;
  scryfallUrl: string;
  hasPartner: boolean;
  /**
   * How this card pairs, if it does. `null` means it cannot be paired.
   *
   * Derived from the card itself so there is no hand-maintained pairing table
   * to drift. See `pairingRole` in `src/lib/pairing.ts`.
   */
  pairingRole: PairingRole | null;
  /** Set of the printing that makes this card uncommon. */
  setName: string;
  /** Rarity of that printing; expected to be "uncommon". */
  rarity: string;
  /** Can be paired with another commander. Set by the pool, not by normalizing. */
  canPair: boolean;
  /** USD market price from Scryfall if available. */
  priceUsd: string | null;
  /** True when `priceUsd` is a foil price because no non-foil price exists. */
  priceIsFoil: boolean;
};
