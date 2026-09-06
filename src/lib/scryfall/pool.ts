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

/**
 * Minimum gap between any two Scryfall requests from this process.
 *
 * Scryfall asks for 50–100ms and answers 429 when you do not. This is
 * deliberately more generous than asked: the pool is six requests, so even a
 * quarter of a second each costs under two seconds on a command nobody is
 * waiting on, and being a good citizen of a free API somebody else pays for is
 * worth more than that.
 */
const REQUEST_GAP_MS = 250;

/**
 * Backoff when Scryfall throttles, in milliseconds. Unhurried on purpose —
 * there is no deadline on a draw, and hammering a 429 is what earns a longer
 * one.
 */
const RETRY_DELAYS_MS = [1_000, 3_000, 6_000];

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Serialises every Scryfall request in this process, with a gap between them.
 *
 * A queue rather than a delay inside the paging loop, because the paging loop
 * was never the whole story: `fetchCommanderPool` issues the pool and pair
 * queries through `Promise.all`, so two paginated streams were interleaving
 * with no gap at all and doubling the rate. Spacing pages alone would have left
 * that. Anything that goes through here waits its turn, whoever asked.
 */
let queue: Promise<unknown> = Promise.resolve();

let lastRequestAt = 0;

function throttled<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(async () => {
    // Measured from the previous request rather than slept unconditionally:
    // the first request of a run, and any after a pause, should cost nothing.
    const since = Date.now() - lastRequestAt;
    if (since < REQUEST_GAP_MS) {
      await sleep(REQUEST_GAP_MS - since);
    }
    lastRequestAt = Date.now();
    return work();
  });
  // A failed request must not wedge the queue for everything behind it.
  queue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

/**
 * One request, retried when Scryfall says to come back later.
 *
 * Retries 429 and 5xx only. A 404 is a real answer here — the pair query uses
 * it to mean "no matches" — and a 400 means the query itself is wrong, so
 * neither is worth repeating.
 *
 * `Retry-After` is honoured when given, since Scryfall knows better than a
 * fixed curve does; it is capped so a long one cannot hang a draw.
 */
async function fetchWithRetry(url: string, label: string): Promise<Response> {
  let lastStatus = 0;

  for (let attempt = 0; ; attempt += 1) {
    const response = await throttled(() =>
      fetch(url, { headers: HEADERS, next: { revalidate: REVALIDATE_SECONDS } })
    );

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= RETRY_DELAYS_MS.length) {
      if (retryable) {
        throw new Error(
          `Scryfall kept returning ${response.status} for the ${label} query ` +
            `after ${RETRY_DELAYS_MS.length + 1} attempts. It rate-limits by IP, ` +
            "so wait a minute and run this again — nothing has been written."
        );
      }
      return response;
    }

    lastStatus = response.status;
    const header = Number(response.headers.get("retry-after"));
    const wait = Number.isFinite(header) && header > 0
      ? Math.min(header * 1_000, 30_000)
      : RETRY_DELAYS_MS[attempt];
    console.warn(
      `Scryfall returned ${lastStatus} for the ${label} query; retrying in ${wait}ms.`
    );
    await sleep(wait);
  }
}

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
    const response = await fetchWithRetry(url, label);

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
/**
 * The pool, remembered for this process.
 *
 * `fetchCommanderPool` is called by several routes and by a Server Action, and
 * Next's fetch cache already spares the network — but not the throttle queue,
 * which cannot tell a cached response from a real one and would charge every
 * caller the politeness gap. That turned a 21-second E2E run into three
 * minutes.
 *
 * Same lifetime as the upstream cache, so a set release is picked up on the
 * same schedule it always was. In the CLI it means one fetch per run rather
 * than one per call.
 */
let memo: { at: number; pool: Commander[] } | null = null;

export async function fetchCommanderPool(): Promise<Commander[]> {
  if (memo && Date.now() - memo.at < REVALIDATE_SECONDS * 1_000) {
    return memo.pool;
  }
  return (memo = { at: Date.now(), pool: await fetchPoolUncached() }).pool;
}

/** Exposed for tests, which need each case to start from a cold pool. */
export function resetCommanderPoolCache(): void {
  memo = null;
  lastRequestAt = 0;
}

async function fetchPoolUncached(): Promise<Commander[]> {
  // Written as concurrent, executed one request at a time: every fetch below
  // goes through the throttle queue, which is what keeps Scryfall happy.
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
