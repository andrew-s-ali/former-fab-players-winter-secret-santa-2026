# Commander Browser and Reveal Day Design

**Date:** 2026-08-16
**Status:** Approved, not yet implemented
**Builds on:** [Secret Santa site](2026-08-16-secret-santa-site-design.md)

## Purpose

The site works end to end: rules, a one-card commander suggester, secret reveal
pages, and the organiser's draw tooling. This covers the second round of work —
making the suggester a real browsing tool, adding a reveal-day payoff, dressing
the site for winter, and adding demo routes so the whole experience can be
clicked through before any real participant exists.

## Scope

In: the commander browser, theme prompts, the reveal-day ring, the countdown,
festive styling, and demo routes.

Out, deliberately deferred to its own spec: **anonymous questions** between
gifter and recipient. That feature requires the deployed site to accept writes,
which is the single reason the current security model is simple — a token today
authorises reading one assignment and nothing else. It deserves separate design.

Also out: deck price or budget tracking. The $75 limit stays on the honour
system, by the organiser's decision.

## Decisions

| Question | Decision | Why |
| --- | --- | --- |
| Browser layout | Grid of nine | Fast to scan while shopping for a commander |
| "More" behaviour | Rolls nine fresh | Keeps today's serendipity; no pagination state |
| Colour pips | Identity **within** the selected colours | How people shop for a deck's colours |
| Card detail | In-page panel | Keeps people browsing rather than bouncing to Scryfall |
| Veto on reveal page | Pip shown, disabled, with a reason | Explains itself; the veto stays a rule, not a suggestion |
| Theme prompts | One per page, with re-roll | Playful without making every card feel like homework |
| Draw shape | Unchanged — single cycle | See below |
| Reveal unlock | Organiser flips a switch | The exchange can slip; a date cannot be un-passed |
| Reveal access | Public at `/reveal` | After the exchange it isn't secret, and a shareable link beats hunting for tokens |
| Reveal animation | Empty ring, names appear as revealed | Maximum drama, with positions pre-allocated so nothing shifts |
| Countdown | Sign-ups close, then the exchange | The exchange is the deadline; there is no separate decks-due date |
| Undecided exchange date | Show the three candidates as TBC | The site must never assert a date the group has not agreed |
| Styling | Festive — palette, decoration, falling snow | Explicitly requested |
| Demo data | Committed JSON, separate read path | Structurally cannot reach real data |

### On the draw shape

The organiser initially expected the assignment graph to be a web. It cannot
be: `drawAssignments` shuffles and points each person at the next in the
shuffled order, so the result is always exactly one cycle. Nobody can draw
themselves, no two people can exchange mutually, and the group cannot split into
disconnected loops. This was re-confirmed as the desired behaviour, so the ring
visualisation is always an accurate picture of the data.

## Correction: what counts as a legal commander

The rules component currently reads "legendary **creatures** printed in paper at
uncommon". That is narrower than the event's actual rule, which is *legendaries*
— and narrower than the pool the site already serves. `is:commander r:u
game:paper` returns 18 non-creature legendaries, including Backgrounds
(*Acolyte of Bahamut*) and a Vehicle (*Adrestia*).

Confirmed with the organiser: those are legal. The pool stays as it is and the
**rules copy is corrected** to cover any legendary that can be a commander.

## Feature: partner toggle

Scryfall's oracle tag `otag:pair-commander` marks cards that can pair with
another commander. Measured against the pool on 2026-08-16:

| Query | Matches |
| --- | --- |
| `f:edh is:commander r:u game:paper` | 704 |
| …`keyword:partner` (what the code detects today) | 30 |
| …`otag:pair-commander` | **65** |
| `keyword:partner` not in `otag:pair-commander` | 0 |

The tag is a strict superset: it adds "Choose a Background" commanders, the
Backgrounds themselves, and "Partner with" cards, losing nothing. So `canPair`
replaces `hasPartner` as the signal the UI shows and filters on.

`fetchCommanderPool` runs a second query for the tagged set — cached the same
24 hours — and marks matching cards `canPair: true`. The browser gains a
"Can pair with another commander" toggle; the detail panel shows a badge.

This partially replaces what the old single-card suggester did. That component
proposed an actual *pair* of commanders; the grid cannot, so the toggle lets
someone browse pairable commanders and choose two themselves. Since every card
in the pool is uncommon, any two they pick satisfy the house rule.

## Verified Scryfall behaviour

Checked against the live API on 2026-08-16: a search with `r:u` returns the
**uncommon printing itself**, not an arbitrary one. Tatyova, Benthic Druid comes
back as *Foundations*, rarity `uncommon`. So `set_name` on the existing response
is already the printing that makes the card legal — the "uncommon in X" line
needs no extra request, only two more fields carried through `normalizeCard`.

(For the record: Tatyova is also uncommon in Dominaria. She has 11 paper
uncommon printings. The line earns its place because players will want to know
*which* printing counts, not because the card looks illegal.)

## Feature: commander browser

`/commanders` becomes a client component, `CommanderBrowser`.

- A grid of nine random legal commanders.
- "Roll nine more" replaces the sample.
- Five colour pips. Selecting pips filters to commanders whose colour identity
  is a **subset** of the selection. No pips selected means no colour filter.
- A name search box, case-insensitive substring match.
- Clicking a tile opens a detail panel: full image, mana cost, type line, oracle
  text, "Uncommon in *{set}*", and a link to Scryfall. All of it comes from the
  sample response — no second fetch.

New endpoint, replacing `/api/commanders/random`:

```
GET /api/commanders/sample?colors=WU&q=selv&exclude=R&n=9
```

It filters the 24h-cached pool server-side and returns a random sample with
`cache-control: no-store`. `exclude` keeps its current meaning — a hard colour
veto — and is validated against the same whitelist. `colors` and `q` are the new
user-driven filters.

### The veto on the reveal page

The reveal page renders the same component with a `lockedExclude` prop. That
colour's pip renders struck through and unclickable, labelled with the reason
("Ada vetoed red"). The exclusion is applied server-side regardless of what the
client sends, so tampering with the request cannot surface vetoed colours.

## Feature: theme prompts

`src/lib/prompts.ts` exports roughly 24 hand-written build prompts ("go wide",
"spellslinger", "artifacts matter"). One renders above the grid with a re-roll
button. The initial prompt is chosen **client-side after mount**, avoiding a
server/client hydration mismatch from random selection.

## Feature: reveal day

`EventData` gains `revealedAt: string | null` (ISO timestamp).

`/reveal` is a public server component. While `revealedAt` is null it calls
`notFound()`. `scripts/reveal.ts` sets the field, and `--undo` clears it.

`src/lib/ring.ts` is pure and framework-free:

```ts
type RingStep = { from: string; to: string };
function buildRing(participants: Participant[]): { names: string[]; steps: RingStep[] }
```

It walks the assignment map from an arbitrary start, returning names in cycle
order and the edges between them. If the data is not a single cycle — which
would mean the draw or a later edit corrupted it — it throws rather than
rendering a misleading picture.

`RevealRing` is a client component. It computes every position up front from the
participant count, renders empty slots, and reveals one name-and-arrow per
click, following the chain. The closing arrow back to the first person is the
finale. It shows **names and arrows only** — never vetoes, wishes, or tokens,
even though the page is public.

## Feature: countdown and festive styling

### The real timeline

| Milestone | Date | Status |
| --- | --- | --- |
| Announcement | 10 September 2026 | Fixed — operational, not a code constant |
| Sign-ups close | 17 September 2026 | Fixed |
| Exchange | 5, 12 **or** 19 December 2026 | **Undecided** — depends on group availability |

The announcement date is when the organiser tells the group and takes the site
out of Netlify Team protection. Nothing in the code keys off it, so it stays an
operational note rather than a constant.

There is no separate decks-due deadline: the exchange is the deadline.

### Constants

```ts
export const SIGNUPS_CLOSE_AT = "2026-09-17";
export const EXCHANGE_CANDIDATES = ["2026-12-05", "2026-12-12", "2026-12-19"];
/** Set to one of EXCHANGE_CANDIDATES once the group settles on a date. */
export const EXCHANGE_AT: string | null = null;
```

### Behaviour

The site must never assert a date that has not been agreed. While `EXCHANGE_AT`
is null, the exchange is displayed as "5, 12 or 19 December — date TBC", and the
countdown targets sign-ups closing. Setting `EXCHANGE_AT` to one of the
candidates turns it into a real countdown; no other change is needed.

`src/lib/countdown.ts` exports a pure function of the current time, so every
phase is testable without mocking the clock:

| Condition | Shows |
| --- | --- |
| Before 17 Sep | "Sign-ups close in N days", plus the TBC exchange line |
| After 17 Sep, `EXCHANGE_AT` null | "Sign-ups are closed", plus the TBC exchange line |
| After 17 Sep, `EXCHANGE_AT` set and future | "The exchange is in N days" |
| On or after `EXCHANGE_AT` | A closing message; no countdown |

An `EXCHANGE_AT` value not present in `EXCHANGE_CANDIDATES` is allowed — plans
change — but the constant's comment should say so, so nobody assumes validation
that does not exist.

Festive styling: a winter palette, decorative touches, and CSS-only falling
snow. The snow must be disabled under `prefers-reduced-motion`, and must not sit
above the card grid in a way that interferes with clicking.

## Feature: demo routes

Three routes mirror the real ones and render the same components:

| Route | Shows |
| --- | --- |
| `/demo` | The eight demo participants and their reveal links |
| `/demo/s/[token]` | A demo participant's reveal page |
| `/demo/reveal` | The demo ring |

Every demo page carries a visible DEMO badge and is `noindex`.

`scripts/seed-demo.ts` runs the real `drawAssignments` and `mintToken` over
eight fixed fake participants and writes `src/demo/demo-event.json`. `--revealed`
controls whether `revealedAt` is set. The participants deliberately cover the
branches that matter: some with a colour veto and some without, some with long
free-text wishes and some blank (so the "No preference given" fallbacks render),
and one with an awkwardly long name.

**The safety property:** demo pages read that JSON through `readDemoEvent()` in
`src/lib/demo.ts`, which does not import `store.ts`. There is no flag, env var,
or code path by which seeding or viewing the demo can read or write real
participant data. Committing the file is safe because the participants are
invented, so their tokens protect nothing.

Trade-off accepted: toggling the demo between locked and revealed requires
re-running the seeder and committing, rather than flipping a switch live.

## Data model changes

```ts
type EventData = {
  participants: Participant[];
  revealedAt: string | null;   // new
};
```

`readEvent` must treat a missing `revealedAt` as null so existing stored data
keeps working without migration.

`Commander` gains two fields, both already present in the fetched payload:

```ts
  setName: string;   // the set of the uncommon printing
  rarity: string;    // expected to be "uncommon"; carried for display honesty
```

## File structure

| File | Responsibility |
| --- | --- |
| `src/lib/commanders.ts` | Extended: colour-subset filter, name search, sampling |
| `src/lib/prompts.ts` | New: the theme prompt list |
| `src/lib/ring.ts` | New: cycle → ordered names and edges |
| `src/lib/countdown.ts` | New: pure phase logic given a "now" |
| `src/lib/demo.ts` | New: `readDemoEvent()`, isolated from the real store |
| `src/lib/store.ts` | `revealedAt` support |
| `src/app/api/commanders/sample/route.ts` | New sampling endpoint |
| `src/app/commanders/page.tsx` | Hosts the browser |
| `src/app/reveal/page.tsx` | New: public, gated on `revealedAt` |
| `src/app/demo/**` | New: index, reveal, and per-token demo pages |
| `src/components/CommanderBrowser.tsx` | Grid, filters, search |
| `src/components/CommanderDetail.tsx` | Detail panel |
| `src/components/ThemePrompt.tsx` | Prompt with re-roll |
| `src/components/RevealRing.tsx` | Stepped ring |
| `src/components/Countdown.tsx` | Two-phase countdown |
| `scripts/reveal.ts` | Flip `revealedAt` |
| `scripts/seed-demo.ts` | Generate the demo dataset |

`src/components/CommanderSuggester.tsx` is superseded by `CommanderBrowser` and
should be removed once nothing references it.

## Testing

| Layer | Covers |
| --- | --- |
| Unit | Colour-subset filtering, name search, sample size, veto exclusion still applied |
| Unit | `buildRing` returns cycle order; throws on a non-cycle or dangling id |
| Unit | Countdown: all four phases, including `EXCHANGE_AT` null vs set, given an injected "now" |
| Unit | Prompt list is non-empty and has no duplicates |
| Unit | `isRevealed(event)` — the helper the `/reveal` guard is one line over |
| Component | Grid renders nine; filters refetch; detail panel opens; locked pip is disabled and labelled |
| E2E | `/commanders` grid loads real Scryfall cards; `/demo/reveal` steps through the ring; a demo token reveals a demo participant |

The E2E fixture can only hold one reveal state at a time. It will carry
`revealedAt` set, so the ring is covered end to end; the locked-and-404 path is
covered by the `isRevealed` unit test rather than a second Playwright server.
This is a deliberate trade-off, recorded here so a future reader does not
mistake it for an oversight.

## Open item

The exchange date is one of three candidates and will not be settled until the
group compares availability. The site handles this explicitly rather than
guessing: see the countdown section. Choosing it later is a one-constant change.
