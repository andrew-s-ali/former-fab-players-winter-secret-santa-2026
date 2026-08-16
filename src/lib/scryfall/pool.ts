import { COMMANDER_POOL_QUERY } from "../rules";
import { normalizeCard } from "./normalize";
import type { Commander, ScryfallSearchPage } from "./types";

const SEARCH_URL =
  "https://api.scryfall.com/cards/search?unique=cards&q=" +
  encodeURIComponent(COMMANDER_POOL_QUERY);

/** Scryfall requires both of these on every request; omitting Accept returns 400. */
const HEADERS = {
  "User-Agent": "FormerFabSecretSanta/1.0",
  Accept: "application/json",
};

/** Cache the pool for a day — it only changes when a new set is released. */
const REVALIDATE_SECONDS = 86_400;

/**
 * Fetches every legal commander, following Scryfall's pagination.
 *
 * Roughly 5 requests for ~704 cards. Results are cached by Next for 24h, so
 * this runs a handful of times a day rather than once per user interaction.
 */
export async function fetchCommanderPool(): Promise<Commander[]> {
  const cards: Commander[] = [];
  let url: string | undefined = SEARCH_URL;

  while (url) {
    const response = await fetch(url, {
      headers: HEADERS,
      next: { revalidate: REVALIDATE_SECONDS },
    });

    if (!response.ok) {
      throw new Error(
        `Scryfall request failed: ${response.status} ${response.statusText}`
      );
    }

    const page = (await response.json()) as ScryfallSearchPage;
    cards.push(...page.data.map(normalizeCard));

    if (page.has_more && !page.next_page) {
      throw new Error(
        "Scryfall pagination broken: has_more is true but next_page is missing"
      );
    }

    url = page.has_more ? page.next_page : undefined;
  }

  return cards;
}
