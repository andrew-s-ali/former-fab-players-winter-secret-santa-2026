// Imported through the `#lib/*` map rather than relatively, because
// `scripts/draw.ts` needs the pool to check sign-up card picks and runs under
// Node's type stripping, which cannot resolve an extensionless relative
// import. See the "Path Imports" note in the README.
import { COMMANDER_POOL_QUERY } from "#lib/rules";
import { normalizeCard } from "#lib/scryfall/normalize";
import type { Commander, ScryfallCard, ScryfallSearchPage } from "#lib/scryfall/types";

/** Cards that can pair with another commander — broader than the Partner keyword. */
const PAIR_QUERY = `${COMMANDER_POOL_QUERY} otag:pair-commander`;

/** Scryfall requires both of these on every request; omitting Accept returns 400. */
const HEADERS = {
  "User-Agent": "FormerFabSecretSanta/1.0",
  Accept: "application/json",
};

/** Cache for a day — the pool only changes when a new set is released. */
const REVALIDATE_SECONDS = 86_400;

function searchUrl(query: string): string {
  return `https://api.scryfall.com/cards/search?unique=cards&q=${encodeURIComponent(query)}`;
}

/**
 * Fetches every page of a search.
 *
 * `emptyOn404` exists because Scryfall answers a search with no matches with a
 * 404 rather than an empty list.
 */
async function fetchAllPages(
  query: string,
  { emptyOn404 = false, label = "search" }: { emptyOn404?: boolean; label?: string } = {}
): Promise<ScryfallCard[]> {
  const cards: ScryfallCard[] = [];
  let url: string | undefined = searchUrl(query);

  while (url) {
    const response = await fetch(url, {
      headers: HEADERS,
      next: { revalidate: REVALIDATE_SECONDS },
    });

    if (response.status === 404 && emptyOn404) {
      // A no-match search is a 404 on Scryfall. For the pair query this most
      // likely means the oracle tag was renamed or removed, which silently
      // empties the "can pair" filter — so say so rather than degrade quietly.
      console.warn(
        `Scryfall ${label} query returned no matches (404); continuing with an empty result.`
      );
      return [];
    }

    if (!response.ok) {
      throw new Error(
        `Scryfall request failed: ${response.status} ${response.statusText} (${label} query)`
      );
    }

    const page = (await response.json()) as ScryfallSearchPage;
    cards.push(...page.data);

    if (page.has_more && !page.next_page) {
      throw new Error(
        "Scryfall pagination broken: has_more is true but next_page is missing"
      );
    }

    url = page.has_more ? page.next_page : undefined;
  }

  return cards;
}

/**
 * Fetches every legal commander, flagging the ones that can be paired.
 *
 * Two searches, both cached for 24h: the pool itself, and the subset tagged
 * `otag:pair-commander`. Roughly 6 upstream requests a day in total.
 */
export async function fetchCommanderPool(): Promise<Commander[]> {
  const [poolCards, pairCards] = await Promise.all([
    fetchAllPages(COMMANDER_POOL_QUERY, { label: "pool" }),
    fetchAllPages(PAIR_QUERY, { emptyOn404: true, label: "pair" }),
  ]);

  const pairable = new Set(pairCards.map((card) => card.id));

  const commanders = poolCards.map((card) => ({
    ...normalizeCard(card),
    canPair: pairable.has(card.id),
  }));

  // Scryfall says these pair, but none of the three pairing rules the event
  // knows about matched — most likely a new variant ("Partner with <name>",
  // Friends forever) arriving at uncommon in a new set. They stay unpairable,
  // which refuses a legal pair rather than accepting an illegal one, but the
  // organiser should hear about it.
  const unclassified = commanders.filter(
    (card) => card.canPair && card.pairingRole === null
  );
  if (unclassified.length > 0) {
    console.warn(
      `${unclassified.length} commander(s) are tagged as pairable but match no ` +
        "known pairing rule, so no partner will be offered for them: " +
        `${unclassified.map((card) => card.name).join(", ")}. ` +
        "Add the variant to pairingRoleOf in src/lib/pairing.ts."
    );
  }

  return commanders;
}
