# Secret Santa Site Design

**Date:** 2026-08-16
**Status:** Approved, not yet implemented
**Builds on:** [Project foundation](2026-08-15-project-foundation-design.md)

## Purpose

Host the Former Fab Players Winter Secret Santa 2026 — a Magic: The Gathering
deck exchange. The site does two jobs:

1. Suggest random commanders that are legal under the event's house rules.
2. Serve each participant a secret URL revealing who they drew, that person's
   vetoes, and their free-text wish.

Assignments are a derangement, not mutual pairs: if A builds for B, B does not
necessarily build for A.

## Event rules

| Rule           | Detail                                                                  |
| -------------- | ----------------------------------------------------------------------- |
| Commander      | Legendary creatures printed **in paper at uncommon**                     |
| Deck contents  | Any rarity                                                               |
| Budget         | $75                                                                      |
| Partners       | Both partnered commanders must be uncommon                               |
| Banned         | 7 commanders (below)                                                     |
| Player inputs  | One colour veto, one theme veto, one free-text theme wish — all optional |

### Banned commanders

Tatyova, Benthic Druid · Alexios, Deimos of Kosmos · Dionus, Elvish Archdruid ·
Queza, Augur of Agonies · Mica, Reader of Ruins · Zada, Hedron Grinder ·
**Malcolm, Keen-Eyed Navigator + Kediss, Emberclaw Familiar as a pair**

Malcolm and Kediss are each individually legal. Only that specific partner
combination is banned, so the ban is a pair rule, not two card bans.

The banned list is displayed on the site so players can see it.

## Scryfall integration

### The canonical query

```
f:edh is:commander r:u game:paper
```

704 cards, verified against the live API on 2026-08-16.

`game:paper` is **required**, not decorative. Without it the query returns 724.
The extra 20 are cards whose only uncommon printing is digital — MTGO Masters
Edition reprints of Legends and Portal Three Kingdoms cards (Boris Devilboon,
Lady Caleria, Lu Meng, Xiahou Dun, and similar). Those were never uncommon in
paper, so the house rule excludes them.

### Colour-identity exclusion

A player's colour veto removes every commander whose colour **identity**
contains that colour. In Scryfall syntax that is `-id>=r`, which takes the pool
from 704 to 493 for red and leaks nothing.

`-id:r` is **wrong** for this purpose: it means "identity is not exactly mono-red"
and leaves red multicolour commanders in the results (611 cards).

In practice the app filters the cached pool in memory on each card's
`color_identity` array, which is equivalent and needs no extra request. The
query form is recorded here so the two can be cross-checked.

### Fetching and caching

Scryfall requires an accurate `User-Agent` and an `Accept` header on every
request; omitting `Accept` returns HTTP 400 (confirmed during design). All
requests are made **server-side** with:

```
User-Agent: FormerFabSecretSanta/1.0
Accept: application/json
```

The app fetches the whole pool once — 5 paginated requests, ~100ms apart —
and caches it for 24 hours, then filters and picks in memory. This costs about
5 requests a day rather than one per button press, stays well inside Scryfall's
rate limits, and makes veto filtering instant.

Only the fields the UI needs are kept: name, mana cost, type line, oracle text,
colour identity, a normal-size image URI, the Scryfall page URL, and whether the
card has partner.

### Partner handling

Every card in the pool is uncommon, so any two partners drawn from it satisfy
"both must be uncommon" automatically — no extra rarity check is needed. When
the suggester rolls a card with partner it may offer a second partner card. The
sole special case is refusing to produce Malcolm + Kediss together.

## Data model

A single Netlify Blobs store holding one `event.json`, read server-side only.
It never reaches the browser and is never committed — the GitHub repo is public.

```ts
type Participant = {
  id: string;
  name: string;
  recipientId: string;
  token: string;                              // 16 random bytes, base64url
  colorVeto: "W" | "U" | "B" | "R" | "G" | null;
  themeVeto: string | null;
  themeWish: string | null;
};
```

Tokens are the entire access-control model for the reveal page, so they must be
generated with `crypto.randomBytes` — never `Math.random`.

Theme vetoes and wishes stay free text. Scryfall has no theme data, so they are
guidance for the human building the deck, not a machine filter.

## Pages

| Route         | Purpose                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| `/`           | Rules, $75 budget, the uncommon-commander rule, the banned list                                                    |
| `/commanders` | Public suggester: random legal commander, with an optional colour filter                                           |
| `/s/[token]`  | Secret reveal: recipient's name, their three inputs, a suggester pre-filtered to their veto, and the rules restated |

`/s/[token]` sets `noindex` and `no-store`, and renders dynamically. An unknown
token returns 404 — identical to a mistyped one, so the endpoint reveals nothing
about which tokens exist. There is no route that lists participants.

## The draw

`src/lib/draw.ts` is pure and framework-free:

```ts
function drawAssignments(participants: Person[], rng: () => number): Map<Id, Id>
```

It returns a derangement — nobody draws themselves, and every participant is
someone's recipient exactly once. The RNG is injected so tests are deterministic
while production uses a crypto-backed source.

`scripts/draw.ts` wraps it for operational use: read the Google Form CSV export,
run the draw, mint tokens, write the blob, and print each person's link for
distribution. Sign-ups happen in Google Forms, so the site has **no public write
path** — it is read-only in production.

## Testing

| Layer     | Covers                                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit      | Draw is a valid derangement over many seeds; no self-assignment; single-participant input is rejected rather than looping forever              |
| Unit      | Pool filtering: banned cards excluded; colour veto removes all matching colour identities; Malcolm + Kediss never co-occur                     |
| Unit      | Scryfall response parsing against a captured fixture, so tests never hit the network                                                           |
| Component | Reveal page renders recipient name, vetoes and wish                                                                                            |
| E2E       | Home page shows rules and banned list; suggester returns a card; a known-good token reveals an assignment; an unknown token 404s               |

E2E seeds a fixture blob rather than using real participant data.

## Accepted trade-offs

- The reveal link is a bearer secret: anyone it is forwarded to can read that
  assignment. Acceptable for a friendly event.
- Correcting a veto means re-running the script, not editing in a UI. Re-running
  the draw would reshuffle everyone, so the script must support updating
  participant details **without** redrawing.

## Out of scope

Accounts, email delivery, a shipped/received tracker, public sign-up forms, and
any admin write UI.
