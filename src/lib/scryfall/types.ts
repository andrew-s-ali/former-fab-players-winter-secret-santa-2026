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
