# Secret Santa Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Former Fab Players Winter Secret Santa 2026 site — a random legal-commander suggester plus per-participant secret reveal pages.

**Architecture:** Pure logic (Scryfall normalising, filtering, the draw) lives in `src/lib` with no framework imports and full unit coverage. Next.js App Router pages are thin consumers. Participant data lives in Netlify Blobs, read server-side only, written by a local script — the deployed site has no write path.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Vitest + Testing Library, Playwright, Netlify Blobs, Scryfall API.

**Spec:** [2026-08-16-secret-santa-site-design.md](../specs/2026-08-16-secret-santa-site-design.md)

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/rules.ts` | Event constants: budget, ban list, banned pairs |
| `src/lib/scryfall/types.ts` | `ScryfallCard` (raw API shape) and `Commander` (normalised) |
| `src/lib/scryfall/normalize.ts` | Raw Scryfall card → `Commander`, incl. transform-layout images |
| `src/lib/scryfall/pool.ts` | Fetch + cache the full commander pool |
| `src/lib/scryfall/__fixtures__/pool-sample.json` | Captured API response for offline tests |
| `src/lib/commanders.ts` | Filtering (bans, colour veto) and random selection incl. partners |
| `src/lib/draw.ts` | Derangement algorithm |
| `src/lib/tokens.ts` | Crypto-random reveal tokens |
| `src/lib/participants.ts` | `Participant` type and lookup helpers |
| `src/lib/store.ts` | Read/write `event.json` — Netlify Blobs, local-file fallback |
| `src/app/page.tsx` | Home: rules, budget, ban list |
| `src/app/commanders/page.tsx` | Public suggester page |
| `src/app/s/[token]/page.tsx` | Secret reveal page |
| `src/app/api/commanders/random/route.ts` | Returns one random legal commander |
| `src/components/CommanderSuggester.tsx` | Client component: button + card display |
| `src/components/RulesSummary.tsx` | Shared rules/ban-list block |
| `scripts/draw.ts` | CSV → draw → tokens → blob; prints links |
| `scripts/update-participant.ts` | Edit vetoes **without** redrawing |
| `tests/e2e/*.spec.ts` | Playwright specs |

---

## Task 1: Event rules constants

**Files:**
- Create: `src/lib/rules.ts`
- Test: `src/lib/rules.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/rules.test.ts
import { describe, expect, it } from "vitest";
import { BANNED_COMMANDERS, BANNED_PAIRS, BUDGET_USD } from "./rules";

describe("event rules", () => {
  it("bans the six individually banned commanders", () => {
    expect(BANNED_COMMANDERS).toEqual([
      "Tatyova, Benthic Druid",
      "Alexios, Deimos of Kosmos",
      "Dionus, Elvish Archdruid",
      "Queza, Augur of Agonies",
      "Mica, Reader of Ruins",
      "Zada, Hedron Grinder",
    ]);
  });

  it("bans Malcolm + Kediss as a pair, not individually", () => {
    expect(BANNED_PAIRS).toEqual([
      ["Malcolm, Keen-Eyed Navigator", "Kediss, Emberclaw Familiar"],
    ]);
    expect(BANNED_COMMANDERS).not.toContain("Malcolm, Keen-Eyed Navigator");
    expect(BANNED_COMMANDERS).not.toContain("Kediss, Emberclaw Familiar");
  });

  it("sets the budget to 75 USD", () => {
    expect(BUDGET_USD).toBe(75);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/rules.test.ts`
Expected: FAIL — `Failed to resolve import "./rules"`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/rules.ts

/** Commanders banned outright from the event. */
export const BANNED_COMMANDERS = [
  "Tatyova, Benthic Druid",
  "Alexios, Deimos of Kosmos",
  "Dionus, Elvish Archdruid",
  "Queza, Augur of Agonies",
  "Mica, Reader of Ruins",
  "Zada, Hedron Grinder",
] as const;

/**
 * Partner combinations that are banned together. Each card is individually
 * legal — only the pairing is prohibited.
 */
export const BANNED_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["Malcolm, Keen-Eyed Navigator", "Kediss, Emberclaw Familiar"],
];

/** Deck budget in US dollars. */
export const BUDGET_USD = 75;

/** The Scryfall query defining the legal commander pool. */
export const COMMANDER_POOL_QUERY = "f:edh is:commander r:u game:paper";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/rules.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/rules.ts src/lib/rules.test.ts
git commit -m "feat: add event rules constants"
```

---

## Task 2: Scryfall types and card normalising

Four cards in the live pool use the `transform` layout and have **no top-level
`image_uris`** — the image lives on `card_faces[0].image_uris`. A naive reader
renders a broken image for Exdeath, Garland, The Emperor of Palamecia and
Ultimecia. That is what this task's second test pins.

**Files:**
- Create: `src/lib/scryfall/types.ts`, `src/lib/scryfall/normalize.ts`
- Test: `src/lib/scryfall/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/scryfall/normalize.test.ts
import { describe, expect, it } from "vitest";
import { normalizeCard } from "./normalize";
import type { ScryfallCard } from "./types";

const normalCard: ScryfallCard = {
  id: "50a22ad6-d2a4-48a6-91c9-147c946a60a5",
  name: "Aang, A Lot to Learn",
  mana_cost: "{2}{G/W}",
  type_line: "Legendary Creature — Human Avatar Ally",
  oracle_text: "Aang has vigilance as long as there's a Lesson card in your graveyard.",
  color_identity: ["G", "W"],
  keywords: [],
  layout: "normal",
  scryfall_uri: "https://scryfall.com/card/tle/146/aang-a-lot-to-learn",
  image_uris: { normal: "https://cards.scryfall.io/normal/aang.jpg" },
};

const transformCard: ScryfallCard = {
  id: "b1f0c0de-0000-4000-8000-000000000001",
  name: "Exdeath, Void Warlock // Neo Exdeath, Dimension's End",
  type_line: "Legendary Creature — Human Warlock // Legendary Creature — Void Avatar",
  color_identity: ["B", "U"],
  keywords: [],
  layout: "transform",
  scryfall_uri: "https://scryfall.com/card/fin/95/exdeath-void-warlock",
  card_faces: [
    {
      name: "Exdeath, Void Warlock",
      mana_cost: "{2}{U}{B}",
      oracle_text: "Whenever you cast a spell, mill a card.",
      image_uris: { normal: "https://cards.scryfall.io/normal/exdeath-front.jpg" },
    },
    {
      name: "Neo Exdeath, Dimension's End",
      mana_cost: "",
      oracle_text: "Trample.",
      image_uris: { normal: "https://cards.scryfall.io/normal/exdeath-back.jpg" },
    },
  ],
};

const partnerCard: ScryfallCard = {
  id: "c2f0c0de-0000-4000-8000-000000000002",
  name: "Alena, Kessig Trapper",
  mana_cost: "{4}{R}",
  type_line: "Legendary Creature — Human Scout",
  oracle_text: "Partner (You can have two commanders if both have partner.)",
  color_identity: ["R"],
  keywords: ["First strike", "Partner"],
  layout: "normal",
  scryfall_uri: "https://scryfall.com/card/cma/104/alena-kessig-trapper",
  image_uris: { normal: "https://cards.scryfall.io/normal/alena.jpg" },
};

describe("normalizeCard", () => {
  it("maps a normal card's fields", () => {
    expect(normalizeCard(normalCard)).toEqual({
      id: "50a22ad6-d2a4-48a6-91c9-147c946a60a5",
      name: "Aang, A Lot to Learn",
      manaCost: "{2}{G/W}",
      typeLine: "Legendary Creature — Human Avatar Ally",
      oracleText:
        "Aang has vigilance as long as there's a Lesson card in your graveyard.",
      colorIdentity: ["G", "W"],
      imageUrl: "https://cards.scryfall.io/normal/aang.jpg",
      scryfallUrl: "https://scryfall.com/card/tle/146/aang-a-lot-to-learn",
      hasPartner: false,
    });
  });

  it("falls back to the first face's image for transform cards", () => {
    const result = normalizeCard(transformCard);

    expect(result.imageUrl).toBe(
      "https://cards.scryfall.io/normal/exdeath-front.jpg"
    );
    expect(result.manaCost).toBe("{2}{U}{B}");
    expect(result.oracleText).toContain("mill a card");
  });

  it("detects the Partner keyword", () => {
    expect(normalizeCard(partnerCard).hasPartner).toBe(true);
    expect(normalizeCard(normalCard).hasPartner).toBe(false);
  });

  it("returns null imageUrl when no face has an image", () => {
    const imageless: ScryfallCard = { ...normalCard, image_uris: undefined };
    expect(normalizeCard(imageless).imageUrl).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/scryfall/normalize.test.ts`
Expected: FAIL — cannot resolve `./normalize`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/scryfall/types.ts

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
  image_uris?: { normal?: string };
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
};
```

```ts
// src/lib/scryfall/normalize.ts
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
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/scryfall/normalize.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/scryfall/
git commit -m "feat: normalise Scryfall cards, handling transform layouts"
```

---

## Task 3: Fetch and cache the commander pool

**Files:**
- Create: `src/lib/scryfall/pool.ts`
- Test: `src/lib/scryfall/pool.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/scryfall/pool.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCommanderPool } from "./pool";

function pageResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const card = (id: string, name: string) => ({
  id,
  name,
  mana_cost: "{1}{U}",
  type_line: "Legendary Creature — Human Wizard",
  oracle_text: "Draw a card.",
  color_identity: ["U"],
  keywords: [],
  layout: "normal",
  scryfall_uri: `https://scryfall.com/card/${id}`,
  image_uris: { normal: `https://cards.scryfall.io/normal/${id}.jpg` },
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchCommanderPool", () => {
  it("follows pagination and normalises every card", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        pageResponse({
          data: [card("a", "Alpha")],
          has_more: true,
          next_page: "https://api.scryfall.com/cards/search?page=2",
          total_cards: 2,
        })
      )
      .mockResolvedValueOnce(
        pageResponse({
          data: [card("b", "Beta")],
          has_more: false,
          total_cards: 2,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const pool = await fetchCommanderPool();

    expect(pool.map((c) => c.name)).toEqual(["Alpha", "Beta"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends the User-Agent and Accept headers Scryfall requires", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      pageResponse({ data: [card("a", "Alpha")], has_more: false, total_cards: 1 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchCommanderPool();

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["User-Agent"]).toBe("FormerFabSecretSanta/1.0");
    expect(init.headers["Accept"]).toBe("application/json");
  });

  it("throws a descriptive error when Scryfall fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 400 }))
    );

    await expect(fetchCommanderPool()).rejects.toThrow(/Scryfall request failed: 400/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/scryfall/pool.test.ts`
Expected: FAIL — cannot resolve `./pool`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/scryfall/pool.ts
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
    url = page.has_more ? page.next_page : undefined;
  }

  return cards;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/scryfall/pool.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Verify against the live API**

Run:

```bash
curl -s "https://api.scryfall.com/cards/search?unique=cards&q=f%3Aedh+is%3Acommander+r%3Au+game%3Apaper" -H "User-Agent: FormerFabSecretSanta/1.0" -H "Accept: application/json" | python3 -c "import json,sys; print(json.load(sys.stdin)['total_cards'])"
```

Expected: `704` (may drift upward as sets release; a number in the low 700s is correct, `0` or an error is not)

- [ ] **Step 6: Commit**

```bash
git add src/lib/scryfall/pool.ts src/lib/scryfall/pool.test.ts
git commit -m "feat: fetch and cache the Scryfall commander pool"
```

---

## Task 4: Filtering and random selection

**Files:**
- Create: `src/lib/commanders.ts`
- Test: `src/lib/commanders.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/commanders.test.ts
import { describe, expect, it } from "vitest";
import { legalCommanders, pickCommander } from "./commanders";
import type { Commander } from "./scryfall/types";

const make = (name: string, colorIdentity: string[], hasPartner = false): Commander => ({
  id: name.toLowerCase().replace(/\W+/g, "-"),
  name,
  manaCost: "{1}{G}",
  typeLine: "Legendary Creature — Elf Druid",
  oracleText: "",
  colorIdentity,
  imageUrl: null,
  scryfallUrl: `https://scryfall.com/${name}`,
  hasPartner,
});

const pool: Commander[] = [
  make("Tatyova, Benthic Druid", ["G", "U"]),
  make("Zada, Hedron Grinder", ["R"]),
  make("Anara, Wolvid Familiar", ["G"], true),
  make("Malcolm, Keen-Eyed Navigator", ["U"], true),
  make("Kediss, Emberclaw Familiar", ["R"], true),
  make("Selvala, Explorer Returned", ["G", "W"]),
  make("Krark, the Thumbless", ["R"], true),
];

describe("legalCommanders", () => {
  it("removes banned commanders", () => {
    const names = legalCommanders(pool, {}).map((c) => c.name);

    expect(names).not.toContain("Tatyova, Benthic Druid");
    expect(names).not.toContain("Zada, Hedron Grinder");
  });

  it("keeps Malcolm and Kediss, which are only banned as a pair", () => {
    const names = legalCommanders(pool, {}).map((c) => c.name);

    expect(names).toContain("Malcolm, Keen-Eyed Navigator");
    expect(names).toContain("Kediss, Emberclaw Familiar");
  });

  it("removes every commander whose colour identity contains the vetoed colour", () => {
    const names = legalCommanders(pool, { colorVeto: "G" }).map((c) => c.name);

    expect(names).not.toContain("Anara, Wolvid Familiar");
    expect(names).not.toContain("Selvala, Explorer Returned");
    expect(names).toContain("Malcolm, Keen-Eyed Navigator");
  });
});

describe("pickCommander", () => {
  it("returns a legal commander using the injected rng", () => {
    const result = pickCommander(pool, {}, () => 0);

    expect(result).not.toBeNull();
    expect(result!.commander.name).toBe("Anara, Wolvid Familiar");
  });

  it("offers a partner when the rolled commander has partner", () => {
    const result = pickCommander(pool, {}, () => 0);

    expect(result!.commander.hasPartner).toBe(true);
    expect(result!.partner).not.toBeNull();
    expect(result!.partner!.hasPartner).toBe(true);
    expect(result!.partner!.name).not.toBe(result!.commander.name);
  });

  it("never pairs Malcolm with Kediss", () => {
    const duo = [
      make("Malcolm, Keen-Eyed Navigator", ["U"], true),
      make("Kediss, Emberclaw Familiar", ["R"], true),
    ];

    const result = pickCommander(duo, {}, () => 0);

    expect(result!.commander.name).toBe("Malcolm, Keen-Eyed Navigator");
    expect(result!.partner).toBeNull();
  });

  it("returns null when the filters leave nothing", () => {
    expect(pickCommander([make("Zada, Hedron Grinder", ["R"])], {}, () => 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/commanders.test.ts`
Expected: FAIL — cannot resolve `./commanders`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/commanders.ts
import { BANNED_COMMANDERS, BANNED_PAIRS } from "./rules";
import type { Commander } from "./scryfall/types";

export type ColorCode = "W" | "U" | "B" | "R" | "G";

export type CommanderFilters = {
  /** Exclude commanders whose colour identity contains this colour. */
  colorVeto?: ColorCode | null;
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

/** Applies the ban list and the colour veto. */
export function legalCommanders(
  pool: Commander[],
  filters: CommanderFilters
): Commander[] {
  return pool.filter((card) => {
    if (BANNED.has(card.name)) {
      return false;
    }
    if (filters.colorVeto && card.colorIdentity.includes(filters.colorVeto)) {
      return false;
    }
    return true;
  });
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/commanders.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/commanders.ts src/lib/commanders.test.ts
git commit -m "feat: filter and randomly pick legal commanders"
```

---

## Task 5: The draw

**Files:**
- Create: `src/lib/draw.ts`
- Test: `src/lib/draw.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/draw.test.ts
import { describe, expect, it } from "vitest";
import { drawAssignments } from "./draw";

const people = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Player ${i}` }));

/** Deterministic, well-distributed rng so repeated runs explore many shuffles. */
function seededRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe("drawAssignments", () => {
  it("gives everyone exactly one recipient", () => {
    const result = drawAssignments(people(6), seededRng(1));

    expect(result.size).toBe(6);
    for (const person of people(6)) {
      expect(result.has(person.id)).toBe(true);
    }
  });

  it("makes everyone a recipient exactly once", () => {
    const result = drawAssignments(people(6), seededRng(2));
    const recipients = [...result.values()];

    expect(new Set(recipients).size).toBe(6);
  });

  it("never assigns anyone to themselves, across many seeds", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const result = drawAssignments(people(8), seededRng(seed));

      for (const [giver, recipient] of result) {
        expect(giver).not.toBe(recipient);
      }
    }
  });

  it("handles the smallest valid group of two", () => {
    const result = drawAssignments(people(2), seededRng(3));

    expect(result.get("p0")).toBe("p1");
    expect(result.get("p1")).toBe("p0");
  });

  it("rejects a group too small to derange", () => {
    expect(() => drawAssignments(people(1), seededRng(1))).toThrow(
      /at least 2 participants/
    );
  });

  it("rejects duplicate participant ids", () => {
    const dupes = [
      { id: "p0", name: "A" },
      { id: "p0", name: "B" },
    ];

    expect(() => drawAssignments(dupes, seededRng(1))).toThrow(/duplicate/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/draw.test.ts`
Expected: FAIL — cannot resolve `./draw`

- [ ] **Step 3: Write the implementation**

Uses the cycle method: shuffle, then have each person give to the next in the
shuffled order, wrapping at the end. This produces a single cycle, so
self-assignment is structurally impossible — no retry loop that could spin
forever.

```ts
// src/lib/draw.ts

export type Person = { id: string; name: string };

/**
 * Assigns each participant a recipient, as a single cycle.
 *
 * Nobody draws themselves and everyone receives exactly once. `rng` returns a
 * float in [0, 1) and is injected so tests are deterministic.
 *
 * @throws if there are fewer than 2 participants, or ids repeat.
 */
export function drawAssignments(
  participants: Person[],
  rng: () => number = Math.random
): Map<string, string> {
  if (participants.length < 2) {
    throw new Error("A draw needs at least 2 participants.");
  }

  const ids = participants.map((p) => p.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Participants contain duplicate ids.");
  }

  // Fisher-Yates shuffle.
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const assignments = new Map<string, string>();
  for (let i = 0; i < order.length; i++) {
    assignments.set(order[i], order[(i + 1) % order.length]);
  }

  return assignments;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/draw.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/draw.ts src/lib/draw.test.ts
git commit -m "feat: add derangement draw"
```

---

## Task 6: Tokens and participant types

**Files:**
- Create: `src/lib/tokens.ts`, `src/lib/participants.ts`
- Test: `src/lib/tokens.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/tokens.test.ts
import { describe, expect, it } from "vitest";
import { mintToken } from "./tokens";

describe("mintToken", () => {
  it("is URL-safe base64 with no padding", () => {
    expect(mintToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("carries at least 128 bits of entropy", () => {
    // 16 bytes base64url-encodes to 22 characters.
    expect(mintToken().length).toBeGreaterThanOrEqual(22);
  });

  it("does not repeat across many mints", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => mintToken()));

    expect(tokens.size).toBe(1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/tokens.test.ts`
Expected: FAIL — cannot resolve `./tokens`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/tokens.ts
import { randomBytes } from "node:crypto";

/**
 * Mints a reveal token.
 *
 * This token is the only thing protecting a participant's assignment, so it
 * must come from a CSPRNG — never Math.random.
 */
export function mintToken(): string {
  return randomBytes(16).toString("base64url");
}
```

```ts
// src/lib/participants.ts
import type { ColorCode } from "./commanders";

export type Participant = {
  id: string;
  name: string;
  /** The participant this person builds a deck for. */
  recipientId: string;
  /** Secret used in the reveal URL. */
  token: string;
  colorVeto: ColorCode | null;
  themeVeto: string | null;
  themeWish: string | null;
};

export type EventData = {
  participants: Participant[];
};

/** Finds the participant holding a reveal token, or null. */
export function findByToken(
  event: EventData,
  token: string
): Participant | null {
  return event.participants.find((p) => p.token === token) ?? null;
}

/** Finds a participant by id, or null. */
export function findById(event: EventData, id: string): Participant | null {
  return event.participants.find((p) => p.id === id) ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/tokens.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/tokens.ts src/lib/tokens.test.ts src/lib/participants.ts
git commit -m "feat: add reveal tokens and participant types"
```

---

## Task 7: The event store

Production reads Netlify Blobs. Local dev and E2E read a gitignored JSON file,
so neither needs Netlify credentials.

**Files:**
- Create: `src/lib/store.ts`
- Modify: `.gitignore`
- Test: `src/lib/store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/store.test.ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readEvent } from "./store";

const originalEnv = { ...process.env };

beforeEach(() => {
  delete process.env.NETLIFY_SITE_ID;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("readEvent", () => {
  it("reads the local file when Netlify credentials are absent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "santa-"));
    const path = join(dir, "event.json");
    await writeFile(
      path,
      JSON.stringify({
        participants: [
          {
            id: "p1",
            name: "Ada",
            recipientId: "p2",
            token: "tok",
            colorVeto: "R",
            themeVeto: "mill",
            themeWish: "elves",
          },
        ],
      })
    );
    process.env.EVENT_DATA_PATH = path;

    const event = await readEvent();

    expect(event.participants).toHaveLength(1);
    expect(event.participants[0].name).toBe("Ada");
  });

  it("returns an empty event when the local file is missing", async () => {
    process.env.EVENT_DATA_PATH = join(tmpdir(), "does-not-exist-santa.json");

    expect(await readEvent()).toEqual({ participants: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/store.test.ts`
Expected: FAIL — cannot resolve `./store`

- [ ] **Step 3: Install the Blobs client**

Run: `npm install @netlify/blobs`

- [ ] **Step 4: Write the implementation**

```ts
// src/lib/store.ts
import { readFile } from "node:fs/promises";
import type { EventData } from "./participants";

const STORE_NAME = "secret-santa";
const BLOB_KEY = "event.json";

const EMPTY: EventData = { participants: [] };

/** Netlify injects NETLIFY_SITE_ID at runtime; locally we fall back to a file. */
function useBlobs(): boolean {
  return Boolean(process.env.NETLIFY_SITE_ID);
}

function localPath(): string {
  return process.env.EVENT_DATA_PATH ?? "data/event.local.json";
}

/**
 * Reads the event data.
 *
 * Server-side only — this contains every assignment, and must never be
 * imported into a client component.
 */
export async function readEvent(): Promise<EventData> {
  if (useBlobs()) {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore(STORE_NAME);
    const data = await store.get(BLOB_KEY, { type: "json" });
    return (data as EventData) ?? EMPTY;
  }

  try {
    return JSON.parse(await readFile(localPath(), "utf8")) as EventData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return EMPTY;
    }
    throw error;
  }
}

/** Writes the event data. Used by scripts, never by the deployed site. */
export async function writeEvent(event: EventData): Promise<void> {
  if (useBlobs()) {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore(STORE_NAME);
    await store.setJSON(BLOB_KEY, event);
    return;
  }

  const { writeFile, mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  await mkdir(dirname(localPath()), { recursive: true });
  await writeFile(localPath(), JSON.stringify(event, null, 2));
}
```

- [ ] **Step 5: Ignore the local data file**

Add to `.gitignore`:

```
# local participant data — never commit; the repo is public
/data
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- src/lib/store.test.ts`
Expected: PASS, 2 tests

- [ ] **Step 7: Commit**

```bash
git add src/lib/store.ts src/lib/store.test.ts .gitignore package.json package-lock.json
git commit -m "feat: add event store backed by Netlify Blobs"
```

---

## Task 8: Rules component and home page

**Files:**
- Create: `src/components/RulesSummary.tsx`
- Modify: `src/app/page.tsx`
- Test: `src/components/RulesSummary.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/RulesSummary.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RulesSummary } from "./RulesSummary";

describe("RulesSummary", () => {
  it("states the budget", () => {
    render(<RulesSummary />);

    expect(screen.getByText(/\$75/)).toBeInTheDocument();
  });

  it("states the uncommon commander rule", () => {
    render(<RulesSummary />);

    expect(screen.getByText(/uncommon/i)).toBeInTheDocument();
  });

  it("lists every banned commander", () => {
    render(<RulesSummary />);

    expect(screen.getByText("Tatyova, Benthic Druid")).toBeInTheDocument();
    expect(screen.getByText("Zada, Hedron Grinder")).toBeInTheDocument();
    expect(screen.getByText(/Malcolm.*Kediss/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/RulesSummary.test.tsx`
Expected: FAIL — cannot resolve `./RulesSummary`

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/RulesSummary.tsx
import { BANNED_COMMANDERS, BUDGET_USD } from "@/lib/rules";

export function RulesSummary() {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Rules</h2>

      <ul className="list-disc space-y-1 pl-5">
        <li>
          Commanders must be legendary creatures printed in paper at{" "}
          <strong>uncommon</strong>.
        </li>
        <li>Deck cards may be any rarity.</li>
        <li>
          Budget: <strong>${BUDGET_USD}</strong>.
        </li>
        <li>Partnered commanders must both be uncommon.</li>
      </ul>

      <div>
        <h3 className="font-semibold">Banned commanders</h3>
        <ul className="list-disc space-y-1 pl-5">
          {BANNED_COMMANDERS.map((name) => (
            <li key={name}>{name}</li>
          ))}
          <li>Malcolm, Keen-Eyed Navigator + Kediss, Emberclaw Familiar (as a pair)</li>
        </ul>
      </div>
    </section>
  );
}
```

```tsx
// src/app/page.tsx
import Link from "next/link";
import { RulesSummary } from "@/components/RulesSummary";
import { eventTitle } from "@/lib/event";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">{eventTitle()}</h1>

      <RulesSummary />

      <Link className="underline" href="/commanders">
        Browse random legal commanders →
      </Link>
    </main>
  );
}
```

- [ ] **Step 4: Update the existing home page test**

`src/app/page.test.tsx` still asserts the placeholder copy. Replace it:

```tsx
// src/app/page.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("renders the event title as the page heading", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: /secret santa 2026/i })
    ).toBeInTheDocument();
  });

  it("links to the commander browser", () => {
    render(<Home />);

    expect(screen.getByRole("link", { name: /commanders/i })).toHaveAttribute(
      "href",
      "/commanders"
    );
  });
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, all suites

- [ ] **Step 6: Commit**

```bash
git add src/components/RulesSummary.tsx src/components/RulesSummary.test.tsx src/app/page.tsx src/app/page.test.tsx
git commit -m "feat: add rules summary and home page"
```

---

## Task 9: Random commander API route

**Files:**
- Create: `src/app/api/commanders/random/route.ts`

- [ ] **Step 1: Write the implementation**

The pool fetch is mocked in unit tests and exercised for real in E2E; this
route is thin glue, so it gets no unit test of its own.

```ts
// src/app/api/commanders/random/route.ts
import { NextResponse } from "next/server";
import { pickCommander, type ColorCode } from "@/lib/commanders";
import { fetchCommanderPool } from "@/lib/scryfall/pool";

const COLORS = new Set(["W", "U", "B", "R", "G"]);

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("exclude");
  const colorVeto = raw && COLORS.has(raw) ? (raw as ColorCode) : null;

  const pool = await fetchCommanderPool();
  const suggestion = pickCommander(pool, { colorVeto });

  if (!suggestion) {
    return NextResponse.json(
      { error: "No legal commander matches those filters." },
      { status: 404 }
    );
  }

  // Never cache: each request must roll a fresh commander.
  return NextResponse.json(suggestion, {
    headers: { "cache-control": "no-store" },
  });
}
```

- [ ] **Step 2: Verify manually**

Run `npm run dev`, then:

```bash
curl -s "http://localhost:3000/api/commanders/random?exclude=R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['commander']['name'], d['commander']['colorIdentity'])"
```

Expected: a commander name with no `R` in its colour identity. Run it a few
times — the name should change.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/commanders/random/route.ts
git commit -m "feat: add random commander endpoint"
```

---

## Task 10: Commander suggester component and page

**Files:**
- Create: `src/components/CommanderSuggester.tsx`, `src/app/commanders/page.tsx`
- Test: `src/components/CommanderSuggester.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/CommanderSuggester.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommanderSuggester } from "./CommanderSuggester";

const suggestion = {
  commander: {
    id: "a",
    name: "Anara, Wolvid Familiar",
    manaCost: "{3}{G}",
    typeLine: "Legendary Creature — Wolf",
    oracleText: "Partner",
    colorIdentity: ["G"],
    imageUrl: "https://cards.scryfall.io/normal/anara.jpg",
    scryfallUrl: "https://scryfall.com/anara",
    hasPartner: true,
  },
  partner: null,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CommanderSuggester", () => {
  it("fetches and shows a commander when clicked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(suggestion), { status: 200 })
      )
    );

    render(<CommanderSuggester colorVeto={null} />);
    await userEvent.click(screen.getByRole("button", { name: /random commander/i }));

    expect(await screen.findByText("Anara, Wolvid Familiar")).toBeInTheDocument();
  });

  it("passes the colour veto to the endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(suggestion), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<CommanderSuggester colorVeto="R" />);
    await userEvent.click(screen.getByRole("button", { name: /random commander/i }));

    expect(fetchMock.mock.calls[0][0]).toContain("exclude=R");
  });

  it("shows an error message when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 500 }))
    );

    render(<CommanderSuggester colorVeto={null} />);
    await userEvent.click(screen.getByRole("button", { name: /random commander/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/CommanderSuggester.test.tsx`
Expected: FAIL — cannot resolve `./CommanderSuggester`

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/CommanderSuggester.tsx
"use client";

import { useState } from "react";
import type { ColorCode } from "@/lib/commanders";
import type { Commander } from "@/lib/scryfall/types";

type Suggestion = { commander: Commander; partner: Commander | null };

function CommanderCard({ card }: { card: Commander }) {
  return (
    <figure className="space-y-2">
      {card.imageUrl ? (
        // Scryfall images are external and unoptimised on purpose: adding them
        // to next/image config buys nothing for a handful of views.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={card.name}
          className="w-64 rounded-xl"
          height={340}
          src={card.imageUrl}
          width={244}
        />
      ) : null}
      <figcaption>
        <a className="font-semibold underline" href={card.scryfallUrl}>
          {card.name}
        </a>
        <p className="text-sm opacity-70">{card.typeLine}</p>
      </figcaption>
    </figure>
  );
}

export function CommanderSuggester({ colorVeto }: { colorVeto: ColorCode | null }) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function roll() {
    setLoading(true);
    setError(null);

    try {
      const query = colorVeto ? `?exclude=${colorVeto}` : "";
      const response = await fetch(`/api/commanders/random${query}`);

      if (!response.ok) {
        throw new Error(String(response.status));
      }

      setSuggestion((await response.json()) as Suggestion);
    } catch {
      setError("Couldn't load a commander. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        className="rounded-lg border px-4 py-2 font-medium disabled:opacity-50"
        disabled={loading}
        onClick={roll}
        type="button"
      >
        {loading ? "Rolling…" : "Random commander"}
      </button>

      {error ? (
        <p className="text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {suggestion ? (
        <div className="flex flex-wrap gap-6">
          <CommanderCard card={suggestion.commander} />
          {suggestion.partner ? <CommanderCard card={suggestion.partner} /> : null}
        </div>
      ) : null}
    </div>
  );
}
```

```tsx
// src/app/commanders/page.tsx
import Link from "next/link";
import { CommanderSuggester } from "@/components/CommanderSuggester";

export const metadata = { title: "Random commanders" };

export default function CommandersPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Random legal commanders</h1>
      <p className="opacity-70">
        Every suggestion is a legendary creature printed in paper at uncommon,
        with the banned list already removed.
      </p>

      <CommanderSuggester colorVeto={null} />

      <Link className="underline" href="/">
        ← Back to the rules
      </Link>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/CommanderSuggester.test.tsx`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/components/CommanderSuggester.tsx src/components/CommanderSuggester.test.tsx src/app/commanders/page.tsx
git commit -m "feat: add commander suggester page"
```

---

## Task 11: Secret reveal page

An unknown token must 404 exactly like a malformed one, so the page never
reveals which tokens exist.

**Files:**
- Create: `src/app/s/[token]/page.tsx`, `src/components/RevealDetails.tsx`
- Test: `src/components/RevealDetails.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/RevealDetails.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RevealDetails } from "./RevealDetails";

const recipient = {
  id: "p2",
  name: "Ada Lovelace",
  recipientId: "p3",
  token: "secret",
  colorVeto: "R" as const,
  themeVeto: "mill",
  themeWish: "something with elves",
};

describe("RevealDetails", () => {
  it("names the recipient", () => {
    render(<RevealDetails recipient={recipient} />);

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("shows both vetoes and the wish", () => {
    render(<RevealDetails recipient={recipient} />);

    expect(screen.getByText(/red/i)).toBeInTheDocument();
    expect(screen.getByText(/mill/)).toBeInTheDocument();
    expect(screen.getByText(/something with elves/)).toBeInTheDocument();
  });

  it("says so when a veto was left blank", () => {
    render(
      <RevealDetails
        recipient={{ ...recipient, colorVeto: null, themeVeto: null, themeWish: null }}
      />
    );

    expect(screen.getAllByText(/no preference/i).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/RevealDetails.test.tsx`
Expected: FAIL — cannot resolve `./RevealDetails`

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/RevealDetails.tsx
import type { Participant } from "@/lib/participants";

const COLOR_NAMES: Record<string, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
};

const NONE = "No preference given";

export function RevealDetails({ recipient }: { recipient: Participant }) {
  return (
    <section className="space-y-4">
      <p className="opacity-70">You are building for</p>
      <h2 className="text-2xl font-semibold">{recipient.name}</h2>

      <dl className="space-y-3">
        <div>
          <dt className="font-semibold">Colour to avoid</dt>
          <dd>{recipient.colorVeto ? COLOR_NAMES[recipient.colorVeto] : NONE}</dd>
        </div>
        <div>
          <dt className="font-semibold">Theme to avoid</dt>
          <dd>{recipient.themeVeto ?? NONE}</dd>
        </div>
        <div>
          <dt className="font-semibold">What they&apos;d like</dt>
          <dd>{recipient.themeWish ?? NONE}</dd>
        </div>
      </dl>
    </section>
  );
}
```

```tsx
// src/app/s/[token]/page.tsx
import { notFound } from "next/navigation";
import { CommanderSuggester } from "@/components/CommanderSuggester";
import { RevealDetails } from "@/components/RevealDetails";
import { RulesSummary } from "@/components/RulesSummary";
import { findById, findByToken } from "@/lib/participants";
import { readEvent } from "@/lib/store";

// Assignments must never be cached or prerendered.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your Secret Santa",
  robots: { index: false, follow: false },
};

export default async function RevealPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const event = await readEvent();
  const giver = findByToken(event, token);

  // Unknown and malformed tokens must be indistinguishable.
  if (!giver) {
    notFound();
  }

  const recipient = findById(event, giver.recipientId);
  if (!recipient) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-8">
      <h1 className="text-3xl font-semibold">Hi {giver.name}</h1>

      <RevealDetails recipient={recipient} />

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Commander ideas for them</h2>
        <p className="opacity-70">
          Filtered to exclude their vetoed colour and every banned commander.
        </p>
        <CommanderSuggester colorVeto={recipient.colorVeto} />
      </section>

      <RulesSummary />
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/RevealDetails.test.tsx`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/components/RevealDetails.tsx src/components/RevealDetails.test.tsx "src/app/s/[token]/page.tsx"
git commit -m "feat: add secret reveal page"
```

---

## Task 12: The draw script

**Files:**
- Create: `scripts/draw.ts`, `scripts/csv.ts`
- Modify: `package.json`
- Test: `scripts/csv.test.ts`

**Assumption to confirm before running:** the Google Form column headers below
are a guess — the form does not exist yet. `COLUMN_MAP` is the one place to
change them, and the script fails loudly listing the actual headers when a
mapping is wrong, rather than silently importing blanks.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/csv.test.ts
import { describe, expect, it } from "vitest";
import { parseCsv, toParticipantInputs } from "./csv";

describe("parseCsv", () => {
  it("handles quoted fields containing commas and newlines", () => {
    const csv = 'Name,Wish\n"Ada","elves, tokens\nand counters"\n';

    expect(parseCsv(csv)).toEqual([
      { Name: "Ada", Wish: "elves, tokens\nand counters" },
    ]);
  });

  it("handles escaped double quotes", () => {
    const csv = 'Name,Wish\n"Ada","she said ""hi"""\n';

    expect(parseCsv(csv)[0].Wish).toBe('she said "hi"');
  });
});

describe("toParticipantInputs", () => {
  const rows = [
    {
      "Your name": "Ada",
      "Colour to avoid": "Red",
      "Theme to avoid": "Mill",
      "Theme you'd like": "Elves",
    },
  ];

  it("maps form columns onto participant fields", () => {
    expect(toParticipantInputs(rows)).toEqual([
      { name: "Ada", colorVeto: "R", themeVeto: "Mill", themeWish: "Elves" },
    ]);
  });

  it("treats blank and 'no preference' answers as null", () => {
    const blank = [
      {
        "Your name": "Bob",
        "Colour to avoid": "No preference",
        "Theme to avoid": "",
        "Theme you'd like": "   ",
      },
    ];

    expect(toParticipantInputs(blank)).toEqual([
      { name: "Bob", colorVeto: null, themeVeto: null, themeWish: null },
    ]);
  });

  it("throws listing the real headers when the name column is missing", () => {
    expect(() => toParticipantInputs([{ Nickname: "Ada" }])).toThrow(/Nickname/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- scripts/csv.test.ts`
Expected: FAIL — cannot resolve `./csv`

Note: `vitest.config.mts` currently restricts `include` to `src/**`. Widen it:

```ts
include: ["src/**/*.{test,spec}.{ts,tsx}", "scripts/**/*.{test,spec}.ts"],
```

- [ ] **Step 3: Write the implementation**

```ts
// scripts/csv.ts

export type Row = Record<string, string>;

export type ParticipantInput = {
  name: string;
  colorVeto: "W" | "U" | "B" | "R" | "G" | null;
  themeVeto: string | null;
  themeWish: string | null;
};

/**
 * Google Form column headers. Confirm these against the real CSV export —
 * they are the only thing to change if the form's wording differs.
 */
const COLUMN_MAP = {
  name: "Your name",
  colorVeto: "Colour to avoid",
  themeVeto: "Theme to avoid",
  themeWish: "Theme you'd like",
} as const;

const COLOR_CODES: Record<string, ParticipantInput["colorVeto"]> = {
  white: "W",
  blue: "U",
  black: "B",
  red: "R",
  green: "G",
};

/** Minimal RFC 4180 parser: handles quotes, embedded commas and newlines. */
export function parseCsv(input: string): Row[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") {
        i++;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...body] = rows;
  return body
    .filter((cells) => cells.some((cell) => cell.trim() !== ""))
    .map((cells) =>
      Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]))
    );
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "" || /^no preference$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/** Maps raw CSV rows onto participant inputs. */
export function toParticipantInputs(rows: Row[]): ParticipantInput[] {
  return rows.map((row) => {
    if (!(COLUMN_MAP.name in row)) {
      throw new Error(
        `CSV has no "${COLUMN_MAP.name}" column. Found: ${Object.keys(row).join(", ")}. ` +
          "Update COLUMN_MAP in scripts/csv.ts to match the form."
      );
    }

    const rawColor = blankToNull(row[COLUMN_MAP.colorVeto]);

    return {
      name: (row[COLUMN_MAP.name] ?? "").trim(),
      colorVeto: rawColor ? (COLOR_CODES[rawColor.toLowerCase()] ?? null) : null,
      themeVeto: blankToNull(row[COLUMN_MAP.themeVeto]),
      themeWish: blankToNull(row[COLUMN_MAP.themeWish]),
    };
  });
}
```

```ts
// scripts/draw.ts
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { drawAssignments } from "../src/lib/draw";
import type { EventData, Participant } from "../src/lib/participants";
import { writeEvent, readEvent } from "../src/lib/store";
import { mintToken } from "../src/lib/tokens";
import { parseCsv, toParticipantInputs } from "./csv";

/**
 * Usage: npm run draw -- responses.csv [--force]
 *
 * Refuses to overwrite an existing draw without --force: rerunning reshuffles
 * everyone, invalidating links already sent out.
 */
async function main() {
  const [path, ...flags] = process.argv.slice(2);
  if (!path) {
    throw new Error("Usage: npm run draw -- <responses.csv> [--force]");
  }

  const existing = await readEvent();
  if (existing.participants.length > 0 && !flags.includes("--force")) {
    throw new Error(
      `A draw already exists with ${existing.participants.length} participants. ` +
        "Re-running reshuffles everyone and breaks links already sent. " +
        "Use scripts/update-participant.ts to fix details, or pass --force to redraw."
    );
  }

  const inputs = toParticipantInputs(parseCsv(await readFile(path, "utf8")));
  const people = inputs.map((input) => ({ ...input, id: randomUUID() }));
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

  const event: EventData = { participants };
  await writeEvent(event);

  const base = process.env.SITE_URL ?? "http://localhost:3000";
  console.log(`\nDrew ${participants.length} participants.\n`);
  for (const p of participants) {
    console.log(`${p.name}\t${base}/s/${p.token}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
```

- [ ] **Step 4: Add the npm scripts**

Add to `package.json` `scripts`:

```json
"draw": "node --experimental-strip-types scripts/draw.ts",
"update-participant": "node --experimental-strip-types scripts/update-participant.ts"
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- scripts/csv.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 6: Smoke-test the script end to end**

```bash
printf 'Your name,Colour to avoid,Theme to avoid,Theme you'"'"'d like\nAda,Red,Mill,Elves\nBob,,Stax,"Artifacts, lots"\nCleo,Green,,\n' > /tmp/santa-test.csv
EVENT_DATA_PATH=/tmp/santa-event.json npm run draw -- /tmp/santa-test.csv
```

Expected: three name/URL lines. Confirm nobody drew themselves:

```bash
python3 -c "
import json; d=json.load(open('/tmp/santa-event.json'))
by={p['id']:p['name'] for p in d['participants']}
for p in d['participants']: print(p['name'],'->',by[p['recipientId']]); assert p['id']!=p['recipientId']
print('no self-assignments')"
```

- [ ] **Step 7: Commit**

```bash
git add scripts/csv.ts scripts/csv.test.ts scripts/draw.ts package.json vitest.config.mts
git commit -m "feat: add draw script with CSV import"
```

---

## Task 13: Update participants without redrawing

**Files:**
- Create: `scripts/update-participant.ts`

- [ ] **Step 1: Write the implementation**

```ts
// scripts/update-participant.ts
import type { ColorCode } from "../src/lib/commanders";
import { readEvent, writeEvent } from "../src/lib/store";

/**
 * Usage:
 *   npm run update-participant -- "Ada" --color=R --veto="mill" --wish="elves"
 *   npm run update-participant -- "Ada" --color=none
 *
 * Edits details only. Assignments and tokens are never touched, so links
 * already sent out keep working.
 */
async function main() {
  const [name, ...flags] = process.argv.slice(2);
  if (!name) {
    throw new Error(
      'Usage: npm run update-participant -- "<name>" [--color=R|none] [--veto=...] [--wish=...]'
    );
  }

  const event = await readEvent();
  const participant = event.participants.find(
    (p) => p.name.toLowerCase() === name.toLowerCase()
  );

  if (!participant) {
    throw new Error(
      `No participant named "${name}". Known: ${event.participants
        .map((p) => p.name)
        .join(", ")}`
    );
  }

  const get = (flag: string) =>
    flags.find((f) => f.startsWith(`--${flag}=`))?.slice(flag.length + 3);

  const color = get("color");
  if (color !== undefined) {
    participant.colorVeto =
      color === "none" ? null : (color.toUpperCase() as ColorCode);
  }

  const veto = get("veto");
  if (veto !== undefined) {
    participant.themeVeto = veto === "none" ? null : veto;
  }

  const wish = get("wish");
  if (wish !== undefined) {
    participant.themeWish = wish === "none" ? null : wish;
  }

  await writeEvent(event);

  console.log(`Updated ${participant.name}:`, {
    colorVeto: participant.colorVeto,
    themeVeto: participant.themeVeto,
    themeWish: participant.themeWish,
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
```

- [ ] **Step 2: Verify it leaves assignments untouched**

```bash
EVENT_DATA_PATH=/tmp/santa-event.json python3 -c "
import json; d=json.load(open('/tmp/santa-event.json'))
print(json.dumps([(p['name'],p['recipientId'],p['token']) for p in d['participants']]))" > /tmp/before.json

EVENT_DATA_PATH=/tmp/santa-event.json npm run update-participant -- "Ada" --color=U --wish="dragons"

EVENT_DATA_PATH=/tmp/santa-event.json python3 -c "
import json; d=json.load(open('/tmp/santa-event.json'))
print(json.dumps([(p['name'],p['recipientId'],p['token']) for p in d['participants']]))" > /tmp/after.json

diff /tmp/before.json /tmp/after.json && echo 'assignments and tokens unchanged'
```

Expected: `assignments and tokens unchanged`, and Ada's colour veto now `U`.

- [ ] **Step 3: Commit**

```bash
git add scripts/update-participant.ts
git commit -m "feat: add participant update script"
```

---

## Task 14: End-to-end tests

**Files:**
- Create: `tests/e2e/rules.spec.ts`, `tests/e2e/commanders.spec.ts`, `tests/e2e/reveal.spec.ts`, `tests/e2e/fixture-event.json`
- Modify: `playwright.config.ts`, `tests/e2e/home.spec.ts`

- [ ] **Step 1: Create the fixture event data**

```json
// tests/e2e/fixture-event.json
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
      "recipientId": "p1",
      "token": "e2e-test-token-bob",
      "colorVeto": null,
      "themeVeto": null,
      "themeWish": null
    }
  ]
}
```

- [ ] **Step 2: Point the dev server at the fixture**

In `playwright.config.ts`, extend `webServer`:

```ts
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      EVENT_DATA_PATH: "tests/e2e/fixture-event.json",
    },
  },
```

- [ ] **Step 3: Write the specs**

```ts
// tests/e2e/rules.spec.ts
import { expect, test } from "@playwright/test";

test("home page shows the rules and the ban list", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("$75")).toBeVisible();
  await expect(page.getByText("Tatyova, Benthic Druid")).toBeVisible();
  await expect(page.getByText(/Malcolm.*Kediss/)).toBeVisible();
});
```

```ts
// tests/e2e/commanders.spec.ts
import { expect, test } from "@playwright/test";

test("suggester returns a real commander from Scryfall", async ({ page }) => {
  await page.goto("/commanders");
  await page.getByRole("button", { name: /random commander/i }).click();

  // The card name renders as a link to Scryfall.
  const card = page.locator("figcaption a").first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toHaveAttribute("href", /scryfall\.com/);
});
```

```ts
// tests/e2e/reveal.spec.ts
import { expect, test } from "@playwright/test";

test("a valid token reveals the assignment", async ({ page }) => {
  await page.goto("/s/e2e-test-token-ada");

  await expect(page.getByRole("heading", { name: /Hi Ada/ })).toBeVisible();
  await expect(page.getByText("Bob")).toBeVisible();
});

test("the reveal page shows the recipient's vetoes", async ({ page }) => {
  await page.goto("/s/e2e-test-token-bob");

  // Bob draws Ada, who vetoed red and mill.
  await expect(page.getByText("Red")).toBeVisible();
  await expect(page.getByText("mill")).toBeVisible();
  await expect(page.getByText("elves and tokens")).toBeVisible();
});

test("an unknown token 404s", async ({ page }) => {
  const response = await page.goto("/s/not-a-real-token");

  expect(response?.status()).toBe(404);
});

test("the reveal page is not indexable", async ({ page }) => {
  await page.goto("/s/e2e-test-token-ada");

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/
  );
});
```

- [ ] **Step 4: Replace the placeholder home spec**

`tests/e2e/home.spec.ts` duplicates `rules.spec.ts` now. Delete it:

```bash
git rm tests/e2e/home.spec.ts
```

- [ ] **Step 5: Run the E2E suite**

Run: `npm run test:e2e`
Expected: PASS, 6 tests

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/ playwright.config.ts
git commit -m "test: add end-to-end coverage for rules, suggester and reveal"
```

---

## Task 15: Deployment configuration

**Files:**
- Modify: `netlify.toml`, `README.md`

- [ ] **Step 1: Verify the full gate passes**

Run: `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`
Expected: all green

- [ ] **Step 2: Document the operational runbook**

Add to `README.md`:

````markdown
## Running the event

1. Export the Google Form responses as CSV.
2. Confirm the headers match `COLUMN_MAP` in `scripts/csv.ts`.
3. Draw and mint links:

   ```bash
   NETLIFY_SITE_ID=<site-id> NETLIFY_AUTH_TOKEN=<token> SITE_URL=https://<site>.netlify.app \
     npm run draw -- responses.csv
   ```

4. Send each person their own link. Anyone holding a link can read that
   assignment, so send them privately.
5. To fix a veto afterwards, use `npm run update-participant` — never re-run
   `draw`, which reshuffles everyone and invalidates every link already sent.

Locally, omit the Netlify variables and the data goes to `data/event.local.json`
(gitignored). The repo is public — participant data must never be committed.
````

- [ ] **Step 3: Deploy and verify in production**

```bash
npx --yes netlify-cli deploy --build --prod
```

Then check the live site: `/` shows the rules, `/commanders` returns a card, and
a real token URL reveals the right person.

- [ ] **Step 4: Commit**

```bash
git add README.md netlify.toml
git commit -m "docs: add event runbook"
```

---

## Self-Review Notes

**Spec coverage:** rules constants (T1); paper-uncommon pool and its caching
(T3); colour-identity veto (T4); pair-only Malcolm/Kediss ban (T1, T4);
partner handling (T4); derangement (T5); crypto tokens (T6); Blobs storage with
local fallback (T7); all three pages (T8, T10, T11); identical 404 for unknown
tokens and `noindex` (T11, T14); CSV ingestion (T12); edit-without-redraw
(T13); test layers from the spec's table (T2–T14).

**Known gaps, deliberate:** the Google Form column names in `COLUMN_MAP` are
guesses and must be confirmed against the real export before the draw is run
(flagged in T12). Scryfall's pool size will drift above 704 as sets release;
T3's verification step accepts that.
