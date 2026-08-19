import type { Commander, ScryfallCard } from "./types";

/**
 * Converts a raw Scryfall card into a `Commander`.
 *
 * Transform-layout cards carry no top-level `image_uris`, `mana_cost` or
 * `oracle_text` — those live on the first face — so each falls back to
 * `card_faces[0]`.
 */
export function normalizeCard(card: ScryfallCard): Commander {
  const front = card.card_faces?.[0];

  // Some printings are foil-only, so a foil price is better than none — but a
  // foil is often several times the non-foil, and showing one unlabelled next
  // to a $75 budget would mislead. Carry a flag so the UI can say which it is.
  const usd = card.prices?.usd ?? null;
  const usdFoil = card.prices?.usd_foil ?? null;

  return {
    id: card.id,
    name: card.name,
    manaCost: card.mana_cost ?? front?.mana_cost ?? "",
    typeLine: card.type_line,
    oracleText: card.oracle_text ?? front?.oracle_text ?? "",
    colorIdentity: card.color_identity,
    imageUrl: card.image_uris?.normal ?? front?.image_uris?.normal ?? null,
    scryfallUrl: card.scryfall_uri,
    hasPartner: card.keywords.includes("Partner"),
    setName: card.set_name,
    rarity: card.rarity,
    // Whether a card can pair comes from a separate tagged query; the pool
    // flips this to true. Normalising one card in isolation cannot know it.
    canPair: false,
    priceUsd: usd ?? usdFoil,
    priceIsFoil: usd === null && usdFoil !== null,
  };
}
