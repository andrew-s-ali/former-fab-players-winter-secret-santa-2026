# Commander Browser and Reveal Day Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the one-card suggester into a filterable commander browser, add a stepped reveal-day ring, a two-phase countdown, festive styling, and demo routes that preview the whole experience with fake data.

**Architecture:** Pure logic stays in `src/lib` (filtering, ring building, countdown phases) with full unit coverage; React components consume it. Demo pages read a committed JSON file through a path that never imports the real store, so they structurally cannot touch participant data.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Vitest + Testing Library, Playwright, Netlify Blobs, Scryfall API.

**Spec:** [2026-08-16-commander-browser-and-reveal-day-design.md](../specs/2026-08-16-commander-browser-and-reveal-day-design.md)

**Before starting:** create a branch off `main`:

```bash
cd ~/Projects/former-fab-players-winter-secret-santa-2026
git fetch origin && git checkout -b commander-browser origin/main
```

---

## Scope note: partners become a filter, not a suggestion

The current `pickCommander` returns a commander plus an auto-chosen partner. A
grid has no natural place for that pairing, so it is replaced by a **toggle**:
"Can pair with another commander" filters the grid to pairable cards and the
user picks two themselves. Every card in the pool is uncommon, so any pair they
choose satisfies the house rule. `pickCommander` and its tests are deleted in
Task 6.

The signal for "pairable" is Scryfall's `otag:pair-commander` oracle tag, not the
`Partner` keyword. Verified against the live API on 2026-08-16: within our pool
the keyword matches 30 cards, the tag matches 65, and every keyword match is
also a tag match. The tag additionally catches "Choose a Background" commanders,
Backgrounds themselves, and "Partner with" cards.

## Scope note: the rules copy is wrong

`src/components/RulesSummary.tsx` says "legendary **creatures** printed in paper
at uncommon". The event's rule is *legendaries*, and the pool already contains 18
non-creature legendaries (Backgrounds, and the Vehicle *Adrestia*). Confirmed
with the organiser that these are legal, so **the copy is corrected in Task 6**
and the pool is left alone.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/scryfall/types.ts` | +`setName`, `rarity` on `Commander` |
| `src/lib/scryfall/normalize.ts` | Carry those two fields through; default `canPair` |
| `src/lib/scryfall/pool.ts` | Second cached query marking `canPair` |
| `src/lib/commanders.ts` | Colour-subset filter, name search, sampling |
| `src/lib/prompts.ts` | Theme prompt list |
| `src/lib/ring.ts` | Assignment map → ordered names + edges |
| `src/lib/countdown.ts` | Pure countdown phase logic |
| `src/lib/demo.ts` | `readDemoEvent()`, isolated from the real store |
| `src/lib/participants.ts` | +`revealedAt`, `isRevealed()` |
| `src/lib/store.ts` | Default `revealedAt` to null |
| `src/app/api/commanders/sample/route.ts` | Sampling endpoint |
| `src/components/CommanderBrowser.tsx` | Grid, pips, search |
| `src/components/CommanderDetail.tsx` | Detail panel |
| `src/components/ThemePrompt.tsx` | Prompt with re-roll |
| `src/components/RevealRing.tsx` | Stepped ring |
| `src/components/Countdown.tsx` | Two-phase countdown |
| `src/components/Snowfall.tsx` | CSS-only snow |
| `src/components/DemoBadge.tsx` | "DEMO" marker |
| `src/app/reveal/page.tsx` | Public ring, gated on `revealedAt` |
| `src/app/demo/**` | Demo index, reveal, per-token pages |
| `scripts/reveal.ts` | Flip `revealedAt` |
| `scripts/seed-demo.ts` | Generate `src/demo/demo-event.json` |

---

## Task 1: Carry the uncommon printing through

Scryfall's `r:u` search returns the uncommon printing itself, so `set_name` is
already in the payload — verified against the live API. Two fields, no new
requests.

**Files:**
- Modify: `src/lib/scryfall/types.ts`, `src/lib/scryfall/normalize.ts`
- Test: `src/lib/scryfall/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the existing `describe("normalizeCard", ...)` block:

```ts
  it("carries the printing's set name and rarity", () => {
    const card = normalizeCard({ ...normalCard, set_name: "Foundations", rarity: "uncommon" });

    expect(card.setName).toBe("Foundations");
    expect(card.rarity).toBe("uncommon");
  });
```

The existing fixtures lack the new fields, so also add `set_name: "Commander 2019"` and `rarity: "uncommon"` to `normalCard`, `transformCard` and `partnerCard`, and add `setName: "Commander 2019"` / `rarity: "uncommon"` to the expected object in the "maps a normal card's fields" test.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/scryfall/normalize.test.ts`
Expected: FAIL — TypeScript/assertion error, `setName` is not a property

- [ ] **Step 3: Implement**

In `src/lib/scryfall/types.ts`, add to `ScryfallCard`:

```ts
  set_name: string;
  rarity: string;
```

and to `Commander`:

```ts
  /** Set of the printing that makes this card uncommon. */
  setName: string;
  /** Rarity of that printing; expected to be "uncommon". */
  rarity: string;
  /** Can be paired with another commander. Set by the pool, not by normalizing. */
  canPair: boolean;
```

In `src/lib/scryfall/normalize.ts`, add to the returned object:

```ts
    setName: card.set_name,
    rarity: card.rarity,
    // Whether a card can pair comes from a separate tagged query; the pool
    // flips this to true. Normalising one card in isolation cannot know it.
    canPair: false,
```

Also add `canPair: false` to the expected object in the "maps a normal card's fields" test.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/scryfall`
Expected: PASS. `pool.test.ts` fixtures may need `set_name`/`rarity` added too — if it fails, add them there.

- [ ] **Step 5: Verify against the live API**

```bash
curl -s "https://api.scryfall.com/cards/search?q=f%3Aedh+is%3Acommander+r%3Au+game%3Apaper+%21%22Tatyova%2C+Benthic+Druid%22" -H "User-Agent: FormerFabSecretSanta/1.0" -H "Accept: application/json" | python3 -c "import json,sys; c=json.load(sys.stdin)['data'][0]; print(c['set_name'], c['rarity'])"
```

Expected: a set name followed by `uncommon`

- [ ] **Step 6: Commit**

```bash
git add src/lib/scryfall/
git commit -m "feat: carry the uncommon printing's set and rarity"
```

---

## Task 1b: Flag partner-capable commanders

A second cached query marks which cards can pair. Verified counts on
2026-08-16: the pool is 704, and `otag:pair-commander` matches 65 of them.

**Files:**
- Modify: `src/lib/scryfall/pool.ts`
- Test: `src/lib/scryfall/pool.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/scryfall/pool.test.ts`. The existing `card` helper needs `set_name: "Test Set"` and `rarity: "uncommon"` if you have not already added them.

```ts
/** Routes each query to its own response so the two fetches can differ. */
function mockPoolAndPairs(poolCards: unknown[], pairCards: unknown[] | number) {
  const fetchMock = vi.fn(async (url: string) => {
    const isPairQuery = decodeURIComponent(url).includes("otag:pair-commander");
    if (isPairQuery) {
      if (typeof pairCards === "number") {
        return new Response("{}", { status: pairCards });
      }
      return pageResponse({ data: pairCards, has_more: false, total_cards: pairCards.length });
    }
    return pageResponse({ data: poolCards, has_more: false, total_cards: poolCards.length });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("fetchCommanderPool partner flag", () => {
  it("marks cards that the tagged query returns", async () => {
    mockPoolAndPairs([card("a", "Alpha"), card("b", "Beta")], [card("a", "Alpha")]);

    const pool = await fetchCommanderPool();

    expect(pool.find((c) => c.id === "a")!.canPair).toBe(true);
    expect(pool.find((c) => c.id === "b")!.canPair).toBe(false);
  });

  it("treats a 404 from the tagged query as nothing pairable", async () => {
    mockPoolAndPairs([card("a", "Alpha")], 404);

    const pool = await fetchCommanderPool();

    expect(pool).toHaveLength(1);
    expect(pool[0].canPair).toBe(false);
  });

  it("still throws when the tagged query fails for another reason", async () => {
    mockPoolAndPairs([card("a", "Alpha")], 500);

    await expect(fetchCommanderPool()).rejects.toThrow(/Scryfall request failed: 500/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/scryfall/pool.test.ts`
Expected: FAIL — `canPair` is undefined on the returned cards

- [ ] **Step 3: Rewrite `src/lib/scryfall/pool.ts`**

```ts
import { COMMANDER_POOL_QUERY } from "../rules";
import { normalizeCard } from "./normalize";
import type { Commander, ScryfallCard, ScryfallSearchPage } from "./types";

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
  { emptyOn404 = false }: { emptyOn404?: boolean } = {}
): Promise<ScryfallCard[]> {
  const cards: ScryfallCard[] = [];
  let url: string | undefined = searchUrl(query);

  while (url) {
    const response = await fetch(url, {
      headers: HEADERS,
      next: { revalidate: REVALIDATE_SECONDS },
    });

    if (response.status === 404 && emptyOn404) {
      return [];
    }

    if (!response.ok) {
      throw new Error(
        `Scryfall request failed: ${response.status} ${response.statusText}`
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
    fetchAllPages(COMMANDER_POOL_QUERY),
    fetchAllPages(PAIR_QUERY, { emptyOn404: true }),
  ]);

  const pairable = new Set(pairCards.map((card) => card.id));

  return poolCards.map((card) => ({
    ...normalizeCard(card),
    canPair: pairable.has(card.id),
  }));
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/scryfall/pool.test.ts`
Expected: PASS. The pre-existing pagination and header tests stub a single response for every call, which still satisfies both queries.

- [ ] **Step 5: Verify against the live API**

```bash
curl -s "https://api.scryfall.com/cards/search?unique=cards&q=f%3Aedh+is%3Acommander+r%3Au+game%3Apaper+otag%3Apair-commander" -H "User-Agent: FormerFabSecretSanta/1.0" -H "Accept: application/json" | python3 -c "import json,sys; print('pairable:', json.load(sys.stdin)['total_cards'])"
```

Expected: `65` (may drift upward as sets release; a number in that region is right, `0` or an error is not)

- [ ] **Step 6: Commit**

```bash
git add src/lib/scryfall/pool.ts src/lib/scryfall/pool.test.ts
git commit -m "feat: flag commanders that can pair, via oracle tag"
```

---

## Task 2: Filtering and sampling

**Files:**
- Modify: `src/lib/commanders.ts`
- Test: `src/lib/commanders.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/commanders.test.ts`. Note the `make` helper needs the two new fields — update it to include `setName: "Test Set", rarity: "uncommon"`.

```ts
describe("legalCommanders colour and text filters", () => {
  it("keeps only commanders whose identity fits inside the selected colours", () => {
    const names = legalCommanders(pool, { colors: ["G", "W"] }).map((c) => c.name);

    expect(names).toContain("Anara, Wolvid Familiar");
    expect(names).toContain("Selvala, Explorer Returned");
    expect(names).not.toContain("Malcolm, Keen-Eyed Navigator");
  });

  it("treats an empty colour selection as no filter", () => {
    expect(legalCommanders(pool, { colors: [] })).toHaveLength(
      legalCommanders(pool, {}).length
    );
  });

  it("matches names case-insensitively on a substring", () => {
    const names = legalCommanders(pool, { query: "sel" }).map((c) => c.name);

    expect(names).toEqual(["Selvala, Explorer Returned"]);
  });

  it("still applies the veto alongside the new filters", () => {
    const names = legalCommanders(pool, { colors: ["G", "U"], colorVeto: "G" }).map(
      (c) => c.name
    );

    expect(names).not.toContain("Anara, Wolvid Familiar");
  });

  it("keeps only pairable commanders when asked", () => {
    const mixed = [
      { ...make("Pairs, the Willing", ["G"]), canPair: true },
      { ...make("Solo, the Lonely", ["G"]), canPair: false },
    ];

    const names = legalCommanders(mixed, { pairsOnly: true }).map((c) => c.name);

    expect(names).toEqual(["Pairs, the Willing"]);
  });

  it("ignores the pairable filter when it is off", () => {
    const mixed = [
      { ...make("Pairs, the Willing", ["G"]), canPair: true },
      { ...make("Solo, the Lonely", ["G"]), canPair: false },
    ];

    expect(legalCommanders(mixed, { pairsOnly: false })).toHaveLength(2);
  });
});

describe("sampleCommanders", () => {
  it("returns at most n cards", () => {
    expect(sampleCommanders(pool, {}, 2, () => 0)).toHaveLength(2);
  });

  it("returns every match when fewer than n exist", () => {
    const result = sampleCommanders(pool, { query: "selvala" }, 9, () => 0);

    expect(result).toHaveLength(1);
  });

  it("does not repeat a card within one sample", () => {
    const result = sampleCommanders(pool, {}, 5, () => 0.5);
    const ids = result.map((c) => c.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns an empty array when nothing matches", () => {
    expect(sampleCommanders(pool, { query: "zzzz" }, 9, () => 0)).toEqual([]);
  });
});
```

Import `sampleCommanders` at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/commanders.test.ts`
Expected: FAIL — `sampleCommanders` is not exported

- [ ] **Step 3: Implement**

Replace the `CommanderFilters` type and `legalCommanders` in `src/lib/commanders.ts`, and add `sampleCommanders`:

```ts
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
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/commanders.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/commanders.ts src/lib/commanders.test.ts
git commit -m "feat: add colour-subset filtering, name search and sampling"
```

---

## Task 3: The sample endpoint

**Files:**
- Create: `src/app/api/commanders/sample/route.ts`
- Delete: `src/app/api/commanders/random/route.ts`

- [ ] **Step 1: Write the implementation**

```ts
// src/app/api/commanders/sample/route.ts
import { NextResponse } from "next/server";
import { sampleCommanders, type ColorCode } from "@/lib/commanders";
import { fetchCommanderPool } from "@/lib/scryfall/pool";

const COLORS = new Set(["W", "U", "B", "R", "G"]);
const DEFAULT_SIZE = 9;
const MAX_SIZE = 24;

/** Parses "WU" into ["W","U"], silently dropping anything unrecognised. */
function parseColors(raw: string | null): ColorCode[] {
  if (!raw) {
    return [];
  }
  return [...raw.toUpperCase()].filter((c) => COLORS.has(c)) as ColorCode[];
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const rawExclude = params.get("exclude");
  const colorVeto =
    rawExclude && COLORS.has(rawExclude) ? (rawExclude as ColorCode) : null;

  const size = Number(params.get("n") ?? DEFAULT_SIZE);
  const n = Number.isFinite(size) ? Math.min(Math.max(Math.trunc(size), 1), MAX_SIZE) : DEFAULT_SIZE;

  const pool = await fetchCommanderPool();
  const commanders = sampleCommanders(
    pool,
    {
      colorVeto,
      colors: parseColors(params.get("colors")),
      query: params.get("q") ?? "",
      pairsOnly: params.get("pairs") === "1",
    },
    n
  );

  // Never cache: each request must roll a fresh sample.
  return NextResponse.json(
    { commanders },
    { headers: { "cache-control": "no-store" } }
  );
}
```

Note this returns an empty array rather than a 404 when nothing matches — with user-driven filters, "no results" is a normal outcome the UI renders, not an error.

- [ ] **Step 2: Delete the old endpoint**

```bash
git rm src/app/api/commanders/random/route.ts
```

- [ ] **Step 3: Verify manually**

Run `npm run dev`, then:

```bash
curl -s "http://localhost:3000/api/commanders/sample?colors=G&n=3" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d['commanders'])); print([(c['name'], c['colorIdentity']) for c in d['commanders']])"
curl -s "http://localhost:3000/api/commanders/sample?pairs=1&n=5" | python3 -c "import json,sys; d=json.load(sys.stdin); print('all pairable:', all(c['canPair'] for c in d['commanders']), [c['name'] for c in d['commanders']])"
```

Expected: `3` with every colour identity a subset of `["G"]`; then `all pairable: True`. Run each twice — the names should differ.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/commanders/
git commit -m "feat: add the commander sample endpoint"
```

---

## Task 4: The detail panel

**Files:**
- Create: `src/components/CommanderDetail.tsx`
- Test: `src/components/CommanderDetail.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/CommanderDetail.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CommanderDetail } from "./CommanderDetail";

const card = {
  id: "a",
  name: "Anara, Wolvid Familiar",
  manaCost: "{3}{G}",
  typeLine: "Legendary Creature — Wolf",
  oracleText: "Partner. Commander creatures you own have hexproof.",
  colorIdentity: ["G"],
  imageUrl: "https://cards.scryfall.io/normal/anara.jpg",
  scryfallUrl: "https://scryfall.com/anara",
  hasPartner: true,
  canPair: true,
  setName: "Commander Legends",
  rarity: "uncommon",
};

describe("CommanderDetail", () => {
  it("names the printing that makes it legal", () => {
    render(<CommanderDetail card={card} onClose={() => {}} />);

    expect(screen.getByText(/uncommon in Commander Legends/i)).toBeInTheDocument();
  });

  it("shows the oracle text and type line", () => {
    render(<CommanderDetail card={card} onClose={() => {}} />);

    expect(screen.getByText(/hexproof/)).toBeInTheDocument();
    expect(screen.getByText("Legendary Creature — Wolf")).toBeInTheDocument();
  });

  it("marks a commander that can be paired", () => {
    render(<CommanderDetail card={card} onClose={() => {}} />);

    expect(screen.getByText(/can pair/i)).toBeInTheDocument();
  });

  it("omits the pair badge for a card that cannot pair", () => {
    render(<CommanderDetail card={{ ...card, canPair: false }} onClose={() => {}} />);

    expect(screen.queryByText(/can pair/i)).not.toBeInTheDocument();
  });

  it("closes when the close button is used", async () => {
    const onClose = vi.fn();
    render(<CommanderDetail card={card} onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/CommanderDetail.test.tsx`
Expected: FAIL — cannot resolve `./CommanderDetail`

- [ ] **Step 3: Implement**

```tsx
// src/components/CommanderDetail.tsx
"use client";

import type { Commander } from "@/lib/scryfall/types";

/** Detail view for one commander, shown when a grid tile is chosen. */
export function CommanderDetail({
  card,
  onClose,
}: {
  card: Commander;
  onClose: () => void;
}) {
  return (
    <div
      aria-label={card.name}
      className="rounded-xl border border-slate-300/40 bg-slate-900/40 p-4"
      role="dialog"
    >
      <div className="flex justify-end">
        <button className="text-sm underline" onClick={onClose} type="button">
          Close
        </button>
      </div>

      <div className="flex flex-wrap gap-4">
        {card.imageUrl ? (
          // Scryfall images are external and deliberately unoptimised.
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={card.name} className="w-56 rounded-xl" src={card.imageUrl} />
        ) : null}

        <div className="min-w-48 flex-1 space-y-2">
          <h3 className="text-lg font-semibold">{card.name}</h3>
          <p className="text-sm opacity-80">{card.manaCost}</p>
          <p className="text-sm">{card.typeLine}</p>
          {card.canPair ? (
            <p className="inline-block rounded border px-2 py-0.5 text-xs">
              Can pair with another commander
            </p>
          ) : null}
          <p className="whitespace-pre-line text-sm opacity-90">{card.oracleText}</p>
          <p className="text-sm opacity-70">
            {card.rarity === "uncommon" ? "Uncommon" : card.rarity} in {card.setName}
          </p>
          <a className="text-sm underline" href={card.scryfallUrl}>
            View on Scryfall
          </a>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/components/CommanderDetail.test.tsx`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/components/CommanderDetail.tsx src/components/CommanderDetail.test.tsx
git commit -m "feat: add the commander detail panel"
```

---

## Task 5: The browser

**Files:**
- Create: `src/components/CommanderBrowser.tsx`
- Test: `src/components/CommanderBrowser.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/CommanderBrowser.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommanderBrowser } from "./CommanderBrowser";

const card = (id: string, name: string, colorIdentity: string[] = ["G"]) => ({
  id,
  name,
  manaCost: "{1}{G}",
  typeLine: "Legendary Creature — Elf",
  oracleText: "Text.",
  colorIdentity,
  imageUrl: null,
  scryfallUrl: `https://scryfall.com/${id}`,
  hasPartner: false,
  canPair: false,
  setName: "Test Set",
  rarity: "uncommon",
});

function mockFetch(commanders: ReturnType<typeof card>[]) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ commanders }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  mockFetch([card("a", "Anara"), card("b", "Selvala")]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CommanderBrowser", () => {
  it("loads a sample on mount", async () => {
    render(<CommanderBrowser lockedExclude={null} />);

    expect(await screen.findByText("Anara")).toBeInTheDocument();
    expect(screen.getByText("Selvala")).toBeInTheDocument();
  });

  it("asks for nine cards and no filters by default", async () => {
    const fetchMock = mockFetch([card("a", "Anara")]);
    render(<CommanderBrowser lockedExclude={null} />);

    await screen.findByText("Anara");

    expect(fetchMock.mock.calls[0][0]).toContain("n=9");
    expect(fetchMock.mock.calls[0][0]).not.toContain("exclude=");
  });

  it("refetches with the colour when a pip is selected", async () => {
    const fetchMock = mockFetch([card("a", "Anara")]);
    render(<CommanderBrowser lockedExclude={null} />);
    await screen.findByText("Anara");

    await userEvent.click(screen.getByRole("button", { name: /green/i }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.at(-1)![0]).toContain("colors=G");
    });
  });

  it("always sends the locked exclusion", async () => {
    const fetchMock = mockFetch([card("a", "Anara")]);
    render(<CommanderBrowser lockedExclude="R" />);

    await screen.findByText("Anara");

    expect(fetchMock.mock.calls[0][0]).toContain("exclude=R");
  });

  it("disables the locked colour's pip", async () => {
    render(<CommanderBrowser lockedExclude="R" />);
    await screen.findByText("Anara");

    expect(screen.getByRole("button", { name: /red/i })).toBeDisabled();
  });

  it("asks only for pairable commanders when the toggle is on", async () => {
    const fetchMock = mockFetch([card("a", "Anara")]);
    render(<CommanderBrowser lockedExclude={null} />);
    await screen.findByText("Anara");

    await userEvent.click(screen.getByRole("button", { name: /can pair/i }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.at(-1)![0]).toContain("pairs=1");
    });
  });

  it("does not send the pairs flag when the toggle is off", async () => {
    const fetchMock = mockFetch([card("a", "Anara")]);
    render(<CommanderBrowser lockedExclude={null} />);

    await screen.findByText("Anara");

    expect(fetchMock.mock.calls[0][0]).not.toContain("pairs=");
  });

  it("opens the detail panel for a chosen card", async () => {
    render(<CommanderBrowser lockedExclude={null} />);
    await screen.findByText("Anara");

    await userEvent.click(screen.getByRole("button", { name: /Anara/ }));

    expect(await screen.findByRole("region", { name: "Anara" })).toBeInTheDocument();
  });

  it("says so when nothing matches", async () => {
    mockFetch([]);
    render(<CommanderBrowser lockedExclude={null} />);

    expect(await screen.findByText(/no commanders match/i)).toBeInTheDocument();
  });

  it("shows an error when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 500 }))
    );
    render(<CommanderBrowser lockedExclude={null} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/CommanderBrowser.test.tsx`
Expected: FAIL — cannot resolve `./CommanderBrowser`

- [ ] **Step 3: Implement**

```tsx
// src/components/CommanderBrowser.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { CommanderDetail } from "@/components/CommanderDetail";
import type { ColorCode } from "@/lib/commanders";
import type { Commander } from "@/lib/scryfall/types";

const COLORS: Array<{ code: ColorCode; name: string }> = [
  { code: "W", name: "White" },
  { code: "U", name: "Blue" },
  { code: "B", name: "Black" },
  { code: "R", name: "Red" },
  { code: "G", name: "Green" },
];

const SAMPLE_SIZE = 9;

export function CommanderBrowser({
  lockedExclude,
  lockedReason,
}: {
  /** Colour the viewer may not filter back in — the recipient's veto. */
  lockedExclude: ColorCode | null;
  lockedReason?: string;
}) {
  const [commanders, setCommanders] = useState<Commander[] | null>(null);
  const [selected, setSelected] = useState<Commander | null>(null);
  const [colors, setColors] = useState<ColorCode[]>([]);
  const [query, setQuery] = useState("");
  const [pairsOnly, setPairsOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ n: String(SAMPLE_SIZE) });
    if (colors.length > 0) {
      params.set("colors", colors.join(""));
    }
    if (query.trim()) {
      params.set("q", query.trim());
    }
    if (lockedExclude) {
      params.set("exclude", lockedExclude);
    }
    if (pairsOnly) {
      params.set("pairs", "1");
    }

    try {
      const response = await fetch(`/api/commanders/sample?${params}`);
      if (!response.ok) {
        throw new Error(String(response.status));
      }
      const data = (await response.json()) as { commanders: Commander[] };
      setCommanders(data.commanders);
    } catch {
      setError("Couldn't load commanders. Try again.");
    } finally {
      setLoading(false);
    }
  }, [colors, query, pairsOnly, lockedExclude]);

  useEffect(() => {
    void load();
  }, [load]);

  function togglePip(code: ColorCode) {
    setColors((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code]
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {COLORS.map(({ code, name }) => {
          const locked = lockedExclude === code;
          return (
            <button
              aria-pressed={colors.includes(code)}
              className={`rounded-full border px-3 py-1 text-sm ${
                colors.includes(code) ? "bg-sky-600 text-white" : ""
              } ${locked ? "line-through opacity-40" : ""}`}
              disabled={locked}
              key={code}
              onClick={() => togglePip(code)}
              type="button"
            >
              {name}
            </button>
          );
        })}

        <button
          aria-pressed={pairsOnly}
          className={`rounded-full border px-3 py-1 text-sm ${
            pairsOnly ? "bg-sky-600 text-white" : ""
          }`}
          onClick={() => setPairsOnly((on) => !on)}
          type="button"
        >
          Can pair
        </button>

        <input
          aria-label="Search by name"
          className="rounded-lg border px-3 py-1 text-sm"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name…"
          value={query}
        />

        <button
          className="rounded-lg border px-3 py-1 text-sm font-medium disabled:opacity-50"
          disabled={loading}
          onClick={() => void load()}
          type="button"
        >
          {loading ? "Rolling…" : "Roll nine more"}
        </button>
      </div>

      {lockedExclude && lockedReason ? (
        <p className="text-sm opacity-70">{lockedReason}</p>
      ) : null}

      {error ? (
        <p className="text-red-500" role="alert">
          {error}
        </p>
      ) : null}

      {selected ? (
        <CommanderDetail card={selected} onClose={() => setSelected(null)} />
      ) : null}

      {commanders && commanders.length === 0 ? (
        <p className="opacity-70">No commanders match those filters.</p>
      ) : null}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {(commanders ?? []).map((card) => (
          <li key={card.id}>
            <button
              className="w-full text-left"
              onClick={() => setSelected(card)}
              type="button"
            >
              {card.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" className="w-full rounded-lg" src={card.imageUrl} />
              ) : null}
              <span className="mt-1 block text-sm">{card.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/components/CommanderBrowser.test.tsx`
Expected: PASS, 10 tests

- [ ] **Step 5: Commit**

```bash
git add src/components/CommanderBrowser.tsx src/components/CommanderBrowser.test.tsx
git commit -m "feat: add the commander browser grid"
```

---

## Task 6: Wire the pages, retire the suggester

**Files:**
- Modify: `src/app/commanders/page.tsx`, `src/app/s/[token]/page.tsx`
- Delete: `src/components/CommanderSuggester.tsx`, `src/components/CommanderSuggester.test.tsx`
- Modify: `src/lib/commanders.ts`, `src/lib/commanders.test.ts` (drop `pickCommander`)

- [ ] **Step 1: Update the commanders page**

```tsx
// src/app/commanders/page.tsx
import Link from "next/link";
import { CommanderBrowser } from "@/components/CommanderBrowser";
import { ThemePrompt } from "@/components/ThemePrompt";

export const metadata = { title: "Commanders" };

export default function CommandersPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Legal commanders</h1>
      <p className="opacity-70">
        Every card here is a legendary creature printed in paper at uncommon,
        with the banned list already removed.
      </p>

      <ThemePrompt />
      <CommanderBrowser lockedExclude={null} />

      <Link className="underline" href="/">
        ← Back to the rules
      </Link>
    </main>
  );
}
```

`ThemePrompt` is built in Task 7. Implement that task before running the app, or temporarily omit the two `ThemePrompt` lines and add them back in Task 7.

- [ ] **Step 2: Update the reveal page**

In `src/app/s/[token]/page.tsx`, replace the `CommanderSuggester` import with `CommanderBrowser`, and swap the usage:

```tsx
        <CommanderBrowser
          lockedExclude={recipient.colorVeto}
          lockedReason={
            recipient.colorVeto
              ? `${recipient.name} vetoed a colour, so it stays filtered out.`
              : undefined
          }
        />
```

- [ ] **Step 2b: Correct the rules copy**

`src/components/RulesSummary.tsx` claims the commander must be a legendary
*creature*. The event's rule is *legendaries*, and the pool already includes 18
non-creature legendaries — Backgrounds and the Vehicle *Adrestia*. Change the
first bullet to:

```tsx
        <li>
          Commanders must be legendary cards that can be a commander —
          creatures, Backgrounds and the like — printed in paper at{" "}
          <strong>uncommon</strong>, including both halves of a partner pair.
        </li>
```

`src/components/RulesSummary.test.tsx` asserts `/legendary creatures.*uncommon/i`
via a text matcher. Update that assertion to `/legendary cards.*uncommon/i`,
keeping the same matcher technique already in the file.

- [ ] **Step 3: Delete the suggester and pickCommander**

```bash
git rm src/components/CommanderSuggester.tsx src/components/CommanderSuggester.test.tsx
```

In `src/lib/commanders.ts`, delete `pickCommander`, `CommanderSuggestion` and `isBannedPair` — nothing references them once the suggester is gone. **Keep `BANNED_PAIRS` imported only if still used; if not, remove that import too.** In `src/lib/commanders.test.ts`, delete the whole `describe("pickCommander", ...)` block.

- [ ] **Step 4: Verify nothing still references the deleted code**

```bash
grep -rn "CommanderSuggester\|pickCommander\|CommanderSuggestion" src/ tests/ || echo "CLEAN"
```

Expected: `CLEAN`

- [ ] **Step 5: Run the gate**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A src/
git commit -m "feat: use the browser on both pages, retire the suggester"
```

---

## Task 7: Theme prompts

**Files:**
- Create: `src/lib/prompts.ts`, `src/components/ThemePrompt.tsx`
- Test: `src/lib/prompts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/prompts.test.ts
import { describe, expect, it } from "vitest";
import { THEME_PROMPTS, pickPrompt } from "./prompts";

describe("THEME_PROMPTS", () => {
  it("offers a decent spread of ideas", () => {
    expect(THEME_PROMPTS.length).toBeGreaterThanOrEqual(20);
  });

  it("has no duplicates", () => {
    expect(new Set(THEME_PROMPTS).size).toBe(THEME_PROMPTS.length);
  });

  it("has no blank entries", () => {
    expect(THEME_PROMPTS.every((p) => p.trim().length > 0)).toBe(true);
  });
});

describe("pickPrompt", () => {
  it("picks using the injected rng", () => {
    expect(pickPrompt(() => 0)).toBe(THEME_PROMPTS[0]);
  });

  it("stays in bounds at the top of the rng range", () => {
    expect(pickPrompt(() => 1 - Number.EPSILON)).toBe(
      THEME_PROMPTS[THEME_PROMPTS.length - 1]
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/prompts.test.ts`
Expected: FAIL — cannot resolve `./prompts`

- [ ] **Step 3: Implement**

```ts
// src/lib/prompts.ts

/** Build prompts offered alongside the commander grid, purely for inspiration. */
export const THEME_PROMPTS = [
  "Go wide with tokens",
  "Spellslinger — instants and sorceries matter",
  "Artifacts matter",
  "Enchantress — draw off enchantments",
  "Lifegain payoffs",
  "Sacrifice and recursion",
  "+1/+1 counters",
  "Graveyard value",
  "One big creature, heavily protected",
  "Group hug, then win anyway",
  "Blink and flicker",
  "Landfall",
  "Tribal — pick a creature type and commit",
  "Steal your opponents' things",
  "Aggressive low-curve beatdown",
  "Mill as a resource, not a wincon",
  "Equipment and auras — suit up",
  "Chaos and coin flips",
  "Storm-lite: chain cheap spells",
  "Wheels and forced draw",
  "Control with few creatures",
  "Reanimate something enormous",
  "Pillowfort — make yourself unattractive to attack",
  "All commons except the commander",
] as const;

/**
 * Picks a prompt.
 *
 * `rng` returns a float in [0, 1) and is injected so tests are deterministic.
 */
export function pickPrompt(rng: () => number = Math.random): string {
  return THEME_PROMPTS[Math.floor(rng() * THEME_PROMPTS.length)];
}
```

```tsx
// src/components/ThemePrompt.tsx
"use client";

import { useEffect, useState } from "react";
import { pickPrompt } from "@/lib/prompts";

/**
 * A random build prompt.
 *
 * Chosen after mount rather than during render: picking randomly on the server
 * and again on the client would produce a hydration mismatch.
 */
export function ThemePrompt() {
  const [prompt, setPrompt] = useState<string | null>(null);

  useEffect(() => {
    setPrompt(pickPrompt());
  }, []);

  if (!prompt) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-300/30 px-4 py-2">
      <span className="text-sm opacity-70">Need a hook?</span>
      <strong className="text-sm">{prompt}</strong>
      <button
        className="ml-auto text-sm underline"
        onClick={() => setPrompt(pickPrompt())}
        type="button"
      >
        Another
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/prompts.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompts.ts src/lib/prompts.test.ts src/components/ThemePrompt.tsx src/app/commanders/page.tsx
git commit -m "feat: add theme prompts"
```

---

## Task 8: revealedAt in the data model

**Files:**
- Modify: `src/lib/participants.ts`, `src/lib/store.ts`
- Test: `src/lib/participants.test.ts` (new file)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/participants.test.ts
import { describe, expect, it } from "vitest";
import { isRevealed } from "./participants";

describe("isRevealed", () => {
  it("is false before the organiser unlocks it", () => {
    expect(isRevealed({ participants: [], revealedAt: null })).toBe(false);
  });

  it("is false when the field is absent from older stored data", () => {
    expect(isRevealed({ participants: [] } as never)).toBe(false);
  });

  it("is true once a timestamp is set", () => {
    expect(
      isRevealed({ participants: [], revealedAt: "2026-12-05T18:00:00.000Z" })
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/participants.test.ts`
Expected: FAIL — `isRevealed` is not exported

- [ ] **Step 3: Implement**

In `src/lib/participants.ts`, extend `EventData` and add the helper:

```ts
export type EventData = {
  participants: Participant[];
  /** ISO timestamp set by the organiser on reveal day; null while locked. */
  revealedAt: string | null;
};

/** True once the organiser has unlocked the public reveal page. */
export function isRevealed(event: EventData): boolean {
  return Boolean(event.revealedAt);
}
```

In `src/lib/store.ts`, update the empty constant and normalise reads so older stored data without the field keeps working:

```ts
const EMPTY: EventData = { participants: [], revealedAt: null };

/** Stored data predating revealedAt must not break; default it to null. */
function withDefaults(data: EventData | null): EventData {
  if (!data) {
    return EMPTY;
  }
  return { participants: data.participants ?? [], revealedAt: data.revealedAt ?? null };
}
```

Then wrap both return paths in `readEvent` with `withDefaults(...)`: the Blobs branch becomes `return withDefaults(data as EventData | null);` and the local branch `return withDefaults(JSON.parse(...) as EventData);`.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib`
Expected: PASS. `store.test.ts` asserts `{ participants: [] }` in places — update those expectations to `{ participants: [], revealedAt: null }`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/participants.ts src/lib/participants.test.ts src/lib/store.ts src/lib/store.test.ts
git commit -m "feat: add revealedAt to the event data"
```

---

## Task 9: The ring builder

**Files:**
- Create: `src/lib/ring.ts`
- Test: `src/lib/ring.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/ring.test.ts
import { describe, expect, it } from "vitest";
import { buildRing } from "./ring";
import type { Participant } from "./participants";

const person = (id: string, name: string, recipientId: string): Participant => ({
  id,
  name,
  recipientId,
  token: `token-${id}`,
  colorVeto: null,
  themeVeto: null,
  themeWish: null,
});

// A single cycle: p1 → p2 → p3 → p1
const cycle = [
  person("p1", "Ada", "p2"),
  person("p2", "Bob", "p3"),
  person("p3", "Cleo", "p1"),
];

describe("buildRing", () => {
  it("returns the names in cycle order", () => {
    expect(buildRing(cycle).names).toEqual(["Ada", "Bob", "Cleo"]);
  });

  it("returns one step per participant, closing the loop", () => {
    expect(buildRing(cycle).steps).toEqual([
      { from: "Ada", to: "Bob" },
      { from: "Bob", to: "Cleo" },
      { from: "Cleo", to: "Ada" },
    ]);
  });

  it("throws when the data is not a single cycle", () => {
    const twoLoops = [
      person("p1", "Ada", "p2"),
      person("p2", "Bob", "p1"),
      person("p3", "Cleo", "p4"),
      person("p4", "Dev", "p3"),
    ];

    expect(() => buildRing(twoLoops)).toThrow(/single cycle/i);
  });

  it("throws when a recipient id does not resolve", () => {
    const dangling = [person("p1", "Ada", "nope"), person("p2", "Bob", "p1")];

    expect(() => buildRing(dangling)).toThrow(/nope/);
  });

  it("throws on fewer than two participants", () => {
    expect(() => buildRing([person("p1", "Ada", "p1")])).toThrow(/at least 2/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/ring.test.ts`
Expected: FAIL — cannot resolve `./ring`

- [ ] **Step 3: Implement**

```ts
// src/lib/ring.ts
import type { Participant } from "./participants";

export type RingStep = { from: string; to: string };

export type Ring = {
  /** Participant names in gift order. */
  names: string[];
  /** One edge per participant; the last closes the loop. */
  steps: RingStep[];
};

/**
 * Turns the assignment map into a ring for display.
 *
 * The draw is a single cycle by construction, so anything else means the data
 * was corrupted — by a bad edit or a partial write. This throws rather than
 * rendering a picture that would quietly misrepresent who gave to whom.
 */
export function buildRing(participants: Participant[]): Ring {
  if (participants.length < 2) {
    throw new Error("A ring needs at least 2 participants.");
  }

  const byId = new Map(participants.map((p) => [p.id, p]));
  const names: string[] = [];

  let current = participants[0];
  for (let i = 0; i < participants.length; i++) {
    names.push(current.name);

    const next = byId.get(current.recipientId);
    if (!next) {
      throw new Error(
        `Participant ${current.name} points at unknown recipient ${current.recipientId}.`
      );
    }
    current = next;
  }

  // After exactly n hops a single cycle lands back at the start.
  if (current.id !== participants[0].id) {
    throw new Error("Assignments do not form a single cycle.");
  }

  const steps = names.map((from, i) => ({
    from,
    to: names[(i + 1) % names.length],
  }));

  return { names, steps };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/ring.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/ring.ts src/lib/ring.test.ts
git commit -m "feat: build the gift ring from assignments"
```

---

## Task 10: The stepped ring component

**Files:**
- Create: `src/components/RevealRing.tsx`
- Test: `src/components/RevealRing.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/RevealRing.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { RevealRing } from "./RevealRing";

const ring = {
  names: ["Ada", "Bob", "Cleo"],
  steps: [
    { from: "Ada", to: "Bob" },
    { from: "Bob", to: "Cleo" },
    { from: "Cleo", to: "Ada" },
  ],
};

describe("RevealRing", () => {
  it("starts with no names shown", () => {
    render(<RevealRing ring={ring} />);

    expect(screen.queryByText("Ada")).not.toBeInTheDocument();
    expect(screen.queryByText("Cleo")).not.toBeInTheDocument();
  });

  it("reveals the first pair on the first step", async () => {
    render(<RevealRing ring={ring} />);

    await userEvent.click(screen.getByRole("button", { name: /reveal/i }));

    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.queryByText("Cleo")).not.toBeInTheDocument();
  });

  it("adds one name per subsequent step", async () => {
    render(<RevealRing ring={ring} />);
    const button = screen.getByRole("button", { name: /reveal/i });

    await userEvent.click(button);
    await userEvent.click(button);

    expect(screen.getByText("Cleo")).toBeInTheDocument();
  });

  it("finishes after one step per participant and stops offering more", async () => {
    render(<RevealRing ring={ring} />);
    const button = screen.getByRole("button", { name: /reveal/i });

    await userEvent.click(button);
    await userEvent.click(button);
    await userEvent.click(button);

    expect(screen.queryByRole("button", { name: /reveal/i })).not.toBeInTheDocument();
    expect(screen.getByText(/all the way round/i)).toBeInTheDocument();
  });

  it("describes progress for screen readers", async () => {
    render(<RevealRing ring={ring} />);

    await userEvent.click(screen.getByRole("button", { name: /reveal/i }));

    expect(screen.getByRole("status")).toHaveTextContent("Ada gave to Bob");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/RevealRing.test.tsx`
Expected: FAIL — cannot resolve `./RevealRing`

- [ ] **Step 3: Implement**

```tsx
// src/components/RevealRing.tsx
"use client";

import { useState } from "react";
import type { Ring } from "@/lib/ring";

const SIZE = 320;
const CENTRE = SIZE / 2;
const RADIUS = SIZE / 2 - 40;

/** Evenly spaced points, first at the top, going clockwise. */
function position(index: number, total: number) {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  return { x: CENTRE + RADIUS * Math.cos(angle), y: CENTRE + RADIUS * Math.sin(angle) };
}

export function RevealRing({ ring }: { ring: Ring }) {
  const [taken, setTaken] = useState(0);
  const total = ring.names.length;
  const done = taken >= ring.steps.length;

  // Every slot is positioned up front so nothing shifts as names appear.
  const points = ring.names.map((name, i) => ({ name, ...position(i, total) }));
  const visibleNames = taken === 0 ? 0 : Math.min(taken + 1, total);

  return (
    <div className="space-y-4">
      <svg
        aria-hidden="true"
        className="mx-auto block max-w-full"
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
      >
        <defs>
          <marker
            id="ring-arrow"
            markerHeight="6"
            markerWidth="6"
            orient="auto-start-reverse"
            refX="5"
            refY="5"
            viewBox="0 0 10 10"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>

        {ring.steps.slice(0, taken).map((step, i) => {
          const from = points[i];
          const to = points[(i + 1) % total];
          return (
            <line
              key={`${step.from}-${step.to}`}
              markerEnd="url(#ring-arrow)"
              stroke="currentColor"
              strokeWidth="2"
              x1={from.x}
              x2={to.x}
              y1={from.y}
              y2={to.y}
            />
          );
        })}

        {points.map((point, i) => (
          <g key={point.name}>
            <circle
              cx={point.x}
              cy={point.y}
              fill="none"
              r="22"
              stroke="currentColor"
              strokeDasharray={i < visibleNames ? undefined : "3 3"}
              strokeWidth="1.5"
              opacity={i < visibleNames ? 1 : 0.35}
            />
            {i < visibleNames ? (
              <text
                dominantBaseline="middle"
                fontSize="11"
                textAnchor="middle"
                x={point.x}
                y={point.y}
                fill="currentColor"
              >
                {point.name}
              </text>
            ) : null}
          </g>
        ))}
      </svg>

      <p className="text-center" role="status">
        {taken === 0
          ? "Nobody revealed yet."
          : `${ring.steps[taken - 1].from} gave to ${ring.steps[taken - 1].to}`}
      </p>

      <div className="text-center">
        {done ? (
          <p className="font-semibold">That&apos;s all the way round.</p>
        ) : (
          <button
            className="rounded-lg border px-4 py-2 font-medium"
            onClick={() => setTaken((n) => n + 1)}
            type="button"
          >
            Reveal the next one
          </button>
        )}
      </div>
    </div>
  );
}
```

The names appear inside the SVG, so the tests query them as text nodes — `aria-hidden` on the `<svg>` keeps duplicate announcements away from screen readers, which get the `role="status"` line instead.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/components/RevealRing.test.tsx`
Expected: PASS, 5 tests. If `aria-hidden` prevents Testing Library from finding the names, remove it from the `<svg>` and rerun — the `role="status"` line remains the accessible narration either way.

- [ ] **Step 5: Commit**

```bash
git add src/components/RevealRing.tsx src/components/RevealRing.test.tsx
git commit -m "feat: add the stepped reveal ring"
```

---

## Task 11: The public reveal page

**Files:**
- Create: `src/app/reveal/page.tsx`

- [ ] **Step 1: Write the implementation**

```tsx
// src/app/reveal/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { RevealRing } from "@/components/RevealRing";
import { eventTitle } from "@/lib/event";
import { isRevealed } from "@/lib/participants";
import { buildRing } from "@/lib/ring";
import { readEvent } from "@/lib/store";

// Reflects live data; must never be prerendered at build time.
export const dynamic = "force-dynamic";

export const metadata = { title: "Reveal day" };

export default async function RevealDayPage() {
  const event = await readEvent();

  // Locked, or no draw yet: indistinguishable from a page that doesn't exist.
  if (!isRevealed(event) || event.participants.length < 2) {
    notFound();
  }

  const ring = buildRing(event.participants);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-3xl font-semibold">{eventTitle()}</h1>
      <h2 className="text-xl">Who had who</h2>
      <p className="opacity-70">
        One gift chain, all the way round. Reveal them one at a time.
      </p>

      <RevealRing ring={ring} />

      <Link className="underline" href="/">
        ← Back to the rules
      </Link>
    </main>
  );
}
```

Only names and arrows reach the page — no vetoes, wishes, or tokens — even though it is public.

- [ ] **Step 2: Verify the locked state**

```bash
printf '{"participants":[],"revealedAt":null}' > /tmp/locked-event.json
EVENT_DATA_PATH=/tmp/locked-event.json npm run dev
```

In another terminal: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/reveal`
Expected: `404`. Stop the dev server and delete `/tmp/locked-event.json`.

- [ ] **Step 3: Commit**

```bash
git add src/app/reveal/
git commit -m "feat: add the public reveal day page"
```

---

## Task 12: The reveal script

**Files:**
- Create: `scripts/reveal.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the implementation**

```ts
// scripts/reveal.ts
import { describeTarget, readEvent, writeEvent } from "#lib/store";

/**
 * Usage:
 *   npm run reveal            # unlock /reveal
 *   npm run reveal -- --undo  # lock it again
 *
 * Unlocking publishes every assignment at a public URL, so it is deliberately
 * a separate, explicit action rather than a date the site guesses at.
 */
async function main() {
  const undo = process.argv.slice(2).includes("--undo");

  console.log(describeTarget());

  const event = await readEvent();
  if (event.participants.length === 0) {
    throw new Error("No draw exists yet — nothing to reveal.");
  }

  event.revealedAt = undo ? null : new Date().toISOString();
  await writeEvent(event);

  console.log(
    undo
      ? "Locked. /reveal now 404s."
      : `Unlocked at ${event.revealedAt}. /reveal is now public.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
```

- [ ] **Step 2: Add the npm script**

Add to `package.json` `scripts`:

```json
"reveal": "node --experimental-strip-types scripts/reveal.ts"
```

- [ ] **Step 3: Verify end to end**

```bash
printf 'Your name,Colour to avoid,Theme to avoid,Theme you'"'"'d like\nAda,Red,Mill,Elves\nBob,,Stax,Artifacts\nCleo,Green,,\n' > /tmp/r.csv
EVENT_DATA_PATH=/tmp/r-event.json npm run draw -- /tmp/r.csv > /dev/null
EVENT_DATA_PATH=/tmp/r-event.json npm run reveal
python3 -c "import json; print('revealedAt:', json.load(open('/tmp/r-event.json'))['revealedAt'])"
EVENT_DATA_PATH=/tmp/r-event.json npm run reveal -- --undo
python3 -c "import json; print('after undo:', json.load(open('/tmp/r-event.json'))['revealedAt'])"
rm -f /tmp/r.csv /tmp/r-event.json
```

Expected: a timestamp, then `None`.

- [ ] **Step 4: Commit**

```bash
git add scripts/reveal.ts package.json
git commit -m "feat: add the reveal unlock script"
```

---

## Task 13: The countdown

**Files:**
- Create: `src/lib/countdown.ts`, `src/components/Countdown.tsx`
- Modify: `src/lib/event.ts`, `src/app/page.tsx`
- Test: `src/lib/countdown.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/countdown.test.ts
import { describe, expect, it } from "vitest";
import { countdownPhase, formatCandidates } from "./countdown";

const config = {
  signupsCloseAt: "2026-09-17",
  exchangeCandidates: ["2026-12-05", "2026-12-12", "2026-12-19"],
  exchangeAt: null as string | null,
};

describe("countdownPhase", () => {
  it("counts down to sign-ups closing", () => {
    const phase = countdownPhase(new Date("2026-09-10T00:00:00Z"), config);

    expect(phase).toEqual({ kind: "before-signups", days: 7 });
  });

  it("reports sign-ups closed while the exchange date is undecided", () => {
    const phase = countdownPhase(new Date("2026-10-01T00:00:00Z"), config);

    expect(phase.kind).toBe("signups-closed");
  });

  it("counts down to the exchange once a date is chosen", () => {
    const phase = countdownPhase(new Date("2026-12-01T00:00:00Z"), {
      ...config,
      exchangeAt: "2026-12-05",
    });

    expect(phase).toEqual({ kind: "before-exchange", days: 4 });
  });

  it("closes out once the exchange has happened", () => {
    const phase = countdownPhase(new Date("2026-12-06T00:00:00Z"), {
      ...config,
      exchangeAt: "2026-12-05",
    });

    expect(phase.kind).toBe("after-exchange");
  });
});

describe("formatCandidates", () => {
  it("lists the candidate dates in prose", () => {
    expect(formatCandidates(config.exchangeCandidates)).toBe(
      "5, 12 or 19 December"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/countdown.test.ts`
Expected: FAIL — cannot resolve `./countdown`

- [ ] **Step 3: Implement**

```ts
// src/lib/countdown.ts

export type CountdownConfig = {
  signupsCloseAt: string;
  exchangeCandidates: readonly string[];
  exchangeAt: string | null;
};

export type CountdownPhase =
  | { kind: "before-signups"; days: number }
  | { kind: "signups-closed" }
  | { kind: "before-exchange"; days: number }
  | { kind: "after-exchange" };

const DAY_MS = 86_400_000;

/** Whole days from `now` to `target`, rounded up. */
function daysUntil(now: Date, target: string): number {
  return Math.ceil((new Date(`${target}T00:00:00Z`).getTime() - now.getTime()) / DAY_MS);
}

/**
 * Works out which milestone to show.
 *
 * `now` is a parameter so every phase is testable without mocking the clock.
 */
export function countdownPhase(now: Date, config: CountdownConfig): CountdownPhase {
  const toSignups = daysUntil(now, config.signupsCloseAt);
  if (toSignups > 0) {
    return { kind: "before-signups", days: toSignups };
  }

  if (!config.exchangeAt) {
    return { kind: "signups-closed" };
  }

  const toExchange = daysUntil(now, config.exchangeAt);
  return toExchange > 0
    ? { kind: "before-exchange", days: toExchange }
    : { kind: "after-exchange" };
}

/** Renders candidate dates as "5, 12 or 19 December". */
export function formatCandidates(candidates: readonly string[]): string {
  const dates = candidates.map((d) => new Date(`${d}T00:00:00Z`));
  const days = dates.map((d) => d.getUTCDate());
  const month = dates[0].toLocaleString("en-GB", { month: "long", timeZone: "UTC" });

  return `${days.slice(0, -1).join(", ")} or ${days[days.length - 1]} ${month}`;
}
```

In `src/lib/event.ts`, append the schedule:

```ts
/** Sign-ups close at the end of this day. */
export const SIGNUPS_CLOSE_AT = "2026-09-17";

/** The exchange will be one of these; the group has not chosen yet. */
export const EXCHANGE_CANDIDATES = ["2026-12-05", "2026-12-12", "2026-12-19"] as const;

/**
 * Set to the agreed exchange date to turn on the second countdown.
 *
 * Deliberately not validated against EXCHANGE_CANDIDATES — plans change, and
 * the site should not refuse a date the group actually settled on.
 */
export const EXCHANGE_AT: string | null = null;
```

```tsx
// src/components/Countdown.tsx
import { EXCHANGE_AT, EXCHANGE_CANDIDATES, SIGNUPS_CLOSE_AT } from "@/lib/event";
import { countdownPhase, formatCandidates } from "@/lib/countdown";

/** Shows the next milestone. Server-rendered; the page is dynamic anyway. */
export function Countdown({ now = new Date() }: { now?: Date }) {
  const phase = countdownPhase(now, {
    signupsCloseAt: SIGNUPS_CLOSE_AT,
    exchangeCandidates: EXCHANGE_CANDIDATES,
    exchangeAt: EXCHANGE_AT,
  });

  const tbc = `Exchange: ${formatCandidates(EXCHANGE_CANDIDATES)} — date TBC`;

  return (
    <div className="rounded-xl border border-slate-300/30 px-4 py-3">
      {phase.kind === "before-signups" ? (
        <p>
          <strong>{phase.days} days</strong> until sign-ups close.
          <span className="block text-sm opacity-70">{tbc}</span>
        </p>
      ) : null}
      {phase.kind === "signups-closed" ? (
        <p>
          Sign-ups are closed.
          <span className="block text-sm opacity-70">{tbc}</span>
        </p>
      ) : null}
      {phase.kind === "before-exchange" ? (
        <p>
          <strong>{phase.days} days</strong> until the exchange.
        </p>
      ) : null}
      {phase.kind === "after-exchange" ? <p>The exchange has happened — hope you liked your deck.</p> : null}
    </div>
  );
}
```

Add `<Countdown />` to `src/app/page.tsx`, directly beneath the `<h1>`, importing it from `@/components/Countdown`.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/countdown.test.ts && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/countdown.ts src/lib/countdown.test.ts src/lib/event.ts src/components/Countdown.tsx src/app/page.tsx
git commit -m "feat: add the two-phase countdown"
```

---

## Task 14: Festive styling

**Files:**
- Create: `src/components/Snowfall.tsx`
- Modify: `src/app/globals.css`, `src/app/layout.tsx`

- [ ] **Step 1: Add the snow component**

```tsx
// src/components/Snowfall.tsx

const FLAKES = Array.from({ length: 24 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  delay: `${(i % 8) * 1.4}s`,
  duration: `${9 + (i % 5) * 2}s`,
  size: `${6 + (i % 3) * 3}px`,
}));

/**
 * Decorative snow. CSS-only and pointer-events:none so it can never intercept
 * a click on the card grid. Hidden entirely under prefers-reduced-motion.
 */
export function Snowfall() {
  return (
    <div aria-hidden="true" className="snowfall">
      {FLAKES.map((flake, i) => (
        <span
          className="snowflake"
          key={i}
          style={{
            left: flake.left,
            width: flake.size,
            height: flake.size,
            animationDelay: flake.delay,
            animationDuration: flake.duration,
          }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add the styles**

Append to `src/app/globals.css`:

```css
/* Winter palette */
:root {
  --background: #0b1220;
  --foreground: #e8eefc;
}

@media (prefers-color-scheme: light) {
  :root {
    --background: #f3f7ff;
    --foreground: #16203a;
  }
}

/* Decorative snow. Never interactive. */
.snowfall {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.snowflake {
  position: absolute;
  top: -10px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.35;
  animation-name: snow-fall;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}

@keyframes snow-fall {
  to {
    transform: translateY(105vh);
  }
}

@media (prefers-reduced-motion: reduce) {
  .snowfall {
    display: none;
  }
}

/* Page content sits above the snow. */
main {
  position: relative;
  z-index: 1;
}
```

- [ ] **Step 3: Mount it**

In `src/app/layout.tsx`, import `Snowfall` and render `<Snowfall />` as the first child inside `<body>`.

- [ ] **Step 4: Verify it doesn't block clicks**

Run `npm run dev`, open `/commanders`, and confirm the grid tiles still open the detail panel. Then run the E2E suite, which clicks through the UI:

Run: `npm run test:e2e`
Expected: PASS — a snow overlay intercepting pointer events would fail these.

- [ ] **Step 5: Commit**

```bash
git add src/components/Snowfall.tsx src/app/globals.css src/app/layout.tsx
git commit -m "feat: add winter palette and decorative snow"
```

---

## Task 15: Demo data

**Files:**
- Create: `scripts/seed-demo.ts`, `src/lib/demo.ts`, `src/demo/demo-event.json` (generated)
- Modify: `package.json`

- [ ] **Step 1: Write the seeder**

```ts
// scripts/seed-demo.ts
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { drawAssignments } from "#lib/draw";
import type { EventData, Participant } from "#lib/participants";
import { mintToken } from "#lib/tokens";

/**
 * Usage: npm run seed:demo [-- --revealed]
 *
 * Writes fake participants to src/demo/demo-event.json for the /demo routes.
 * It never imports the real store, so it cannot read or write real event data.
 * The people are invented, so committing their tokens protects nothing.
 */
const PEOPLE = [
  { name: "Ada Lovelace", colorVeto: "R" as const, themeVeto: "mill", themeWish: "elves and tokens" },
  { name: "Bob Ross", colorVeto: null, themeVeto: null, themeWish: null },
  { name: "Cleo Patra", colorVeto: "G" as const, themeVeto: "stax", themeWish: "artifacts, the more the better" },
  { name: "Dev Patel-Nakamura-Rodriguez", colorVeto: "U" as const, themeVeto: null, themeWish: "something with a very long explanation attached, because people do write essays in free-text fields and the layout should survive it" },
  { name: "Eli 🎄", colorVeto: null, themeVeto: "combo", themeWish: "lifegain" },
  { name: "Fay Wray", colorVeto: "B" as const, themeVeto: null, themeWish: null },
  { name: "Gus", colorVeto: null, themeVeto: null, themeWish: "go wide" },
  { name: "Hana", colorVeto: "W" as const, themeVeto: "tribal", themeWish: "spellslinger" },
];

async function main() {
  const revealed = process.argv.slice(2).includes("--revealed");

  const people = PEOPLE.map((p) => ({ ...p, id: randomUUID() }));
  const assignments = drawAssignments(people);

  const participants: Participant[] = people.map((person) => ({
    id: person.id,
    name: person.name,
    recipientId: assignments.get(person.id)!,
    token: mintToken(),
    colorVeto: person.colorVeto,
    themeVeto: person.themeVeto,
    themeWish: person.themeWish,
  }));

  const event: EventData = {
    participants,
    revealedAt: revealed ? new Date().toISOString() : null,
  };

  await mkdir("src/demo", { recursive: true });
  await writeFile("src/demo/demo-event.json", `${JSON.stringify(event, null, 2)}\n`);

  console.log(`Wrote ${participants.length} demo participants (revealed: ${revealed}).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
```

- [ ] **Step 2: Write the reader**

```ts
// src/lib/demo.ts
import demoEvent from "@/demo/demo-event.json";
import type { EventData } from "./participants";

/**
 * Demo data for the /demo routes.
 *
 * Deliberately does NOT import ./store — there is no code path from the demo
 * pages to real participant data, and no env var that could redirect this at
 * the real store.
 */
export function readDemoEvent(): EventData {
  return demoEvent as EventData;
}
```

- [ ] **Step 3: Add the npm script and generate the data**

Add to `package.json` `scripts`:

```json
"seed:demo": "node --experimental-strip-types scripts/seed-demo.ts"
```

Then run it with the reveal set, so `/demo/reveal` is immediately usable:

```bash
npm run seed:demo -- --revealed
python3 -c "
import json; d=json.load(open('src/demo/demo-event.json'))
by={p['id']:p['name'] for p in d['participants']}
for p in d['participants']: assert p['id']!=p['recipientId']; print(p['name'],'->',by[p['recipientId']])
print('revealedAt:', d['revealedAt'])"
```

Expected: eight name → name lines, no self-assignments, and a timestamp.

- [ ] **Step 4: Confirm the isolation property**

```bash
grep -n "store" src/lib/demo.ts scripts/seed-demo.ts || echo "NO STORE IMPORT — correct"
```

Expected: `NO STORE IMPORT — correct`

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-demo.ts src/lib/demo.ts src/demo/demo-event.json package.json
git commit -m "feat: add demo participants and an isolated reader"
```

---

## Task 16: Demo routes

**Files:**
- Create: `src/components/DemoBadge.tsx`, `src/app/demo/page.tsx`, `src/app/demo/reveal/page.tsx`, `src/app/demo/s/[token]/page.tsx`

- [ ] **Step 1: The badge**

```tsx
// src/components/DemoBadge.tsx

/** Marks a page as fake data, so it can never be mistaken for the real event. */
export function DemoBadge() {
  return (
    <p className="inline-block rounded-full border border-amber-400 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-400">
      Demo — invented people, not the real draw
    </p>
  );
}
```

- [ ] **Step 2: The demo index**

```tsx
// src/app/demo/page.tsx
import Link from "next/link";
import { DemoBadge } from "@/components/DemoBadge";
import { readDemoEvent } from "@/lib/demo";

export const metadata = {
  title: "Demo",
  robots: { index: false, follow: false },
};

export default function DemoIndexPage() {
  const { participants } = readDemoEvent();

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <DemoBadge />
      <h1 className="text-3xl font-semibold">Demo links</h1>
      <p className="opacity-70">
        Each link is what one participant would receive privately. Nothing here
        touches the real event data.
      </p>

      <ul className="space-y-2">
        {participants.map((person) => (
          <li key={person.id}>
            <Link className="underline" href={`/demo/s/${person.token}`}>
              {person.name}
            </Link>
          </li>
        ))}
      </ul>

      <Link className="underline" href="/demo/reveal">
        See the demo reveal day →
      </Link>
    </main>
  );
}
```

- [ ] **Step 3: The demo reveal page**

```tsx
// src/app/demo/reveal/page.tsx
import Link from "next/link";
import { DemoBadge } from "@/components/DemoBadge";
import { RevealRing } from "@/components/RevealRing";
import { readDemoEvent } from "@/lib/demo";
import { isRevealed } from "@/lib/participants";
import { buildRing } from "@/lib/ring";

export const metadata = {
  title: "Demo reveal",
  robots: { index: false, follow: false },
};

export default function DemoRevealPage() {
  const event = readDemoEvent();

  // Unlike the real page this explains itself rather than 404ing: on a demo,
  // a dead end teaches nothing.
  if (!isRevealed(event)) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 p-8">
        <DemoBadge />
        <h1 className="text-2xl font-semibold">Reveal day is locked</h1>
        <p className="opacity-70">
          The real page 404s in this state. Re-seed with{" "}
          <code>npm run seed:demo -- --revealed</code> to see the ring.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <DemoBadge />
      <h1 className="text-3xl font-semibold">Who had who</h1>
      <RevealRing ring={buildRing(event.participants)} />
      <Link className="underline" href="/demo">
        ← Back to the demo links
      </Link>
    </main>
  );
}
```

- [ ] **Step 4: The demo reveal-token page**

```tsx
// src/app/demo/s/[token]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { CommanderBrowser } from "@/components/CommanderBrowser";
import { DemoBadge } from "@/components/DemoBadge";
import { RevealDetails } from "@/components/RevealDetails";
import { RulesSummary } from "@/components/RulesSummary";
import { readDemoEvent } from "@/lib/demo";
import { findById, findByToken } from "@/lib/participants";

export const metadata = {
  title: "Demo reveal page",
  robots: { index: false, follow: false },
};

export default async function DemoTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const event = readDemoEvent();
  const giver = findByToken(event, token);
  if (!giver) {
    notFound();
  }

  const recipient = findById(event, giver.recipientId);
  if (!recipient) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-8">
      <DemoBadge />
      <h1 className="text-3xl font-semibold">Hi {giver.name}</h1>

      <RevealDetails recipient={recipient} />

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Commander ideas for them</h2>
        <CommanderBrowser
          lockedExclude={recipient.colorVeto}
          lockedReason={
            recipient.colorVeto
              ? `${recipient.name} vetoed a colour, so it stays filtered out.`
              : undefined
          }
        />
      </section>

      <RulesSummary />

      <Link className="underline" href="/demo">
        ← Back to the demo links
      </Link>
    </main>
  );
}
```

- [ ] **Step 5: Verify by hand**

Run `npm run dev`, then visit `/demo`, follow a participant link, and open `/demo/reveal` and step through the ring. Confirm the DEMO badge is on every page.

- [ ] **Step 6: Commit**

```bash
git add src/components/DemoBadge.tsx src/app/demo/
git commit -m "feat: add demo routes previewing the real pages"
```

---

## Task 17: End-to-end coverage

**Files:**
- Modify: `tests/e2e/fixture-event.json`, `tests/e2e/commanders.spec.ts`
- Create: `tests/e2e/reveal-day.spec.ts`, `tests/e2e/demo.spec.ts`

- [ ] **Step 1: Rebuild the fixture as a valid ring**

The current fixture has three people where Cleo's `recipientId` is `"does-not-exist"`. That deliberately-broken row is incompatible with `/reveal`, which requires a single cycle — `buildRing` would throw. Replace the whole file with a valid three-person cycle plus the reveal timestamp:

```json
{
  "participants": [
    {
      "id": "p1",
      "name": "Ada",
      "recipientId": "p2",
      "token": "e2e-test-token-ada",
      "colorVeto": "R",
      "themeVeto": "mill",
      "themeWish": "elves and tokens"
    },
    {
      "id": "p2",
      "name": "Bob",
      "recipientId": "p3",
      "token": "e2e-test-token-bob",
      "colorVeto": null,
      "themeVeto": null,
      "themeWish": null
    },
    {
      "id": "p3",
      "name": "Cleo",
      "recipientId": "p1",
      "token": "e2e-test-token-cleo",
      "colorVeto": "G",
      "themeVeto": "stax",
      "themeWish": "artifacts"
    }
  ],
  "revealedAt": "2026-12-05T18:00:00.000Z"
}
```

The chain is now Ada → Bob → Cleo → Ada.

- [ ] **Step 1b: Update the existing reveal spec to match**

`tests/e2e/reveal.spec.ts` assumes the old pairings and the dangling token. Apply exactly these changes:

1. "a valid token reveals the assignment" — Ada's page still names Bob as recipient. Unchanged.
2. "the reveal page shows the recipient's name and vetoes" — it visits **Bob's** token expecting Ada's vetoes, but Bob now gives to Cleo. Change the visited token to `e2e-test-token-cleo` (Cleo gives to Ada), keeping the Ada assertions.
3. "unknown and dangling-recipient tokens 404 identically" — the dangling participant no longer exists. Replace it with a single test:

```ts
test("an unknown token 404s", async ({ page }) => {
  const response = await page.goto("/s/not-a-real-token");

  expect(response?.status()).toBe(404);
});
```

4. "the suggester on a reveal page excludes the recipient's vetoed colour" — it visits Bob's token expecting `exclude=R` from Ada's veto. Change the visited token to `e2e-test-token-cleo`, which still yields Ada and `exclude=R`.
5. The `noindex` test is unaffected.

The dangling-recipient branch in `src/app/s/[token]/page.tsx` keeps its `console.error` and its 404, but is no longer covered end to end. That is an accepted loss: covering it required a fixture that cannot also produce a valid ring.

- [ ] **Step 2: Update the commanders spec**

```ts
// tests/e2e/commanders.spec.ts
import { expect, test } from "@playwright/test";

// Hits the live Scryfall API, so allow more than the 30s default budget.
test.setTimeout(60_000);

test("the browser loads a grid of real commanders", async ({ page }) => {
  await page.goto("/commanders");

  const tiles = page.locator("ul li button");
  await expect(tiles.first()).toBeVisible({ timeout: 30_000 });
  expect(await tiles.count()).toBeGreaterThan(1);
});

test("choosing a card opens its detail panel", async ({ page }) => {
  await page.goto("/commanders");

  const first = page.locator("ul li button").first();
  await expect(first).toBeVisible({ timeout: 30_000 });
  await first.click();

  // The panel is a labelled region, not a dialog: it has no focus trap or
  // modality, so claiming role="dialog" would mislead screen readers.
  await expect(page.getByText(/uncommon in /i)).toBeVisible();
});
```

- [ ] **Step 3: Write the reveal-day spec**

```ts
// tests/e2e/reveal-day.spec.ts
import { expect, test } from "@playwright/test";

test("the ring reveals one step at a time", async ({ page }) => {
  await page.goto("/reveal");

  await expect(page.getByRole("status")).toHaveText(/nobody revealed yet/i);

  await page.getByRole("button", { name: /reveal/i }).click();
  await expect(page.getByRole("status")).toHaveText(/gave to/i);
});

test("stepping to the end closes the loop", async ({ page }) => {
  await page.goto("/reveal");

  const button = page.getByRole("button", { name: /reveal/i });
  for (let i = 0; i < 3; i++) {
    await button.click();
  }

  await expect(page.getByText(/all the way round/i)).toBeVisible();
});
```

- [ ] **Step 4: Write the demo spec**

```ts
// tests/e2e/demo.spec.ts
import { expect, test } from "@playwright/test";

test("the demo index lists participants and is badged", async ({ page }) => {
  await page.goto("/demo");

  await expect(page.getByText(/demo — invented people/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Ada Lovelace" })).toBeVisible();
});

test("a demo link reveals that participant's recipient", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("link", { name: "Ada Lovelace" }).click();

  await expect(page.getByRole("heading", { name: /Hi Ada Lovelace/ })).toBeVisible();
  await expect(page.getByText(/demo — invented people/i)).toBeVisible();
});
```

- [ ] **Step 5: Run the whole suite**

Run: `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`
Expected: all green

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/
git commit -m "test: cover the browser, reveal day and demo routes"
```

---

## Task 18: Documentation

**Files:**
- Modify: `README.md`, `docs/superpowers/plans/2026-08-16-secret-santa-site.md`

- [ ] **Step 1: Update the README**

Add to the scripts table: `npm run reveal` (unlock/lock the public reveal page) and `npm run seed:demo` (regenerate demo data, `-- --revealed` to unlock the demo ring).

Add a short **Demo** section explaining that `/demo`, `/demo/s/<token>` and `/demo/reveal` render the real components against committed fake data, read through `src/lib/demo.ts`, which never imports the real store.

Add to **Running the event**: on the day, unlock the public ring with `npm run reveal` (and the Netlify credentials, as with `draw`).

Update the schedule: sign-ups close 17 September 2026; the exchange is 5, 12 or 19 December 2026, and setting `EXCHANGE_AT` in `src/lib/event.ts` switches the countdown to it.

- [ ] **Step 2: Note the superseded design in the old plan**

At the top of `docs/superpowers/plans/2026-08-16-secret-santa-site.md`, add a line noting that Tasks 9 and 10's `CommanderSuggester` and `/api/commanders/random` were superseded by the commander browser and `/api/commanders/sample`, with a link to this plan.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/
git commit -m "docs: document the browser, reveal day, countdown and demo"
```

---

## Self-Review Notes

**Spec coverage:** printing line (T1); `canPair` via `otag:pair-commander` (T1b); colour-subset filter, search, sampling, pairs-only (T2); sample endpoint with server-enforced veto (T3); detail panel (T4); grid, pips, locked pip (T5); both pages wired, suggester retired (T6); theme prompts (T7); `revealedAt` and `isRevealed` (T8); ring builder throwing on non-cycles (T9); stepped empty-ring reveal (T10); public gated `/reveal` (T11); unlock script (T12); two-phase countdown with TBC handling (T13); winter palette and reduced-motion snow (T14); demo seeder and isolated reader (T15); demo routes (T16); tests (T17); docs (T18).

**Known gaps, deliberate:**

- Automatic partner *pairing* is dropped with `pickCommander` and replaced by the "Can pair" toggle plus a detail-panel badge. The site no longer proposes a specific second commander; `otag:pair-commander` identifies cards that can pair, not which cards pair with which. "Partner with" cards name a specific partner that the tag cannot express, so a user could pick two that do not actually pair with each other. Accepted: every such pair is still legal under the house rule, since both are uncommon.
- The rules copy is corrected in T6 Step 2b to say *legendaries* rather than *legendary creatures*, matching both the organiser's rule and the pool the site already serves.
- The E2E fixture carries `revealedAt`, so `/reveal` is covered unlocked; the locked 404 is covered by the `isRevealed` unit test, per the spec's recorded trade-off.
- Task 17 Step 1 restructures the existing fixture because a dangling `recipientId` is incompatible with a valid ring. The dangling-recipient page guard keeps its `console.error`, but loses its E2E case.
