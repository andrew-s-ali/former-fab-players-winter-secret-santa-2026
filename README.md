# Former Fab Players Winter Secret Santa 2026

A Next.js site for the 2026 winter Secret Santa, deployed on Netlify.

## Status

Feature-complete, and currently **pre-launch**: the home page is a splash page
until the organiser opens registration (see *Before launch* below). Behind it,
the site takes sign-ups through Netlify Forms, provides a
filterable commander browser, runs the draw from those sign-ups (or a CSV export),
serves each participant a secret reveal page with their assignment,
and features a stepped public reveal-day ring, a two-phase countdown, a festive winter
palette with reduced-motion snowfall, local private scratchpads, interactive deck prompts,
demo preview routes, and an Identity-gated organiser console. 278 unit tests,
20 Playwright E2E tests, and lint/typecheck/build are all clean.

See:
- [Original Design Spec](docs/superpowers/specs/2026-08-16-secret-santa-site-design.md)
- [Original Implementation Plan](docs/superpowers/plans/2026-08-16-secret-santa-site.md)
- [Commander Browser & Reveal Day Design Spec](docs/superpowers/specs/2026-08-16-commander-browser-and-reveal-day-design.md)
- [Commander Browser & Reveal Day Implementation Plan](docs/superpowers/plans/2026-08-16-commander-browser-and-reveal-day.md)
- [Commander Browser Enhancements Implementation Plan](docs/superpowers/plans/2026-08-16-commander-browser-enhancements.md)

## Stack

| Concern    | Choice                                       |
| ---------- | -------------------------------------------- |
| Framework  | Next.js 16 (App Router), React 19, TypeScript |
| Styling    | Tailwind CSS v4                               |
| Unit tests | Vitest + Testing Library (jsdom)              |
| E2E tests  | Playwright (Chromium)                         |
| Hosting    | Netlify (zero-config Next.js runtime)         |

## Getting started

```bash
npm install
npx playwright install chromium   # once, for E2E
npm run dev                       # http://localhost:3000
```

## Scripts

| Script                       | Does                                                                        |
| ----------------------------- | --------------------------------------------------------------------------- |
| `npm run dev`                 | Next dev server                                                             |
| `npm run build`               | Production build                                                            |
| `npm run lint`                | ESLint                                                                      |
| `npm run typecheck`           | `next typegen` then `tsc --noEmit`                                           |
| `npm test`                    | Vitest (unit + component), single run                                       |
| `npm run test:watch`          | Vitest in watch mode                                                        |
| `npm run test:e2e`            | Playwright; boots the dev server itself                                     |
| `npm run netlify:dev`         | Netlify Dev, for functions/redirects/env parity                              |
| `npm run draw`                | Netlify Forms **or** CSV → derangement draw → tokens → store; prints links   |
| `npm run update-participant`  | Edit one participant's vetoes/wish without redrawing                        |
| `npm run reveal`              | Unlock or lock the public reveal page (`-- --undo` to lock)                 |
| `npm run seed:demo`           | Regenerate fake demo data in `src/demo/demo-event.json` (`-- --revealed` to unlock) |

CI runs lint → typecheck → unit → E2E on every push and pull request.

## Layout

```
src/app/        routes and layouts (App Router: /, /signup, /commanders, /s/[token], /reveal, /admin/**, /demo/**)
src/components/ React components (SplashPage, EventHome, CommanderBrowser, RevealRing, Countdown, Snowfall, etc.)
src/lib/        framework-free logic; unit-tested (draw, ring, filtering, countdown, launch gate, Scryfall, store)
src/demo/       committed fake event data for /demo routes (never touches real participants)
scripts/        operator CLI: sign-up import (Forms + CSV), the draw, participant edits, reveal day toggle, demo seeder
public/         static assets; __forms.html registers the sign-up form with Netlify
tests/e2e/      Playwright specs
```

Unit tests sit next to their subject (`src/lib/event.ts` → `src/lib/event.test.ts`, `src/components/RevealRing.tsx` → `src/components/RevealRing.test.tsx`).

## Demo

The site includes dedicated demo routes at `/demo`, `/demo/s/<token>`, and `/demo/reveal` so organizers and participants can preview the entire application workflow safely.

- `/demo`: Lists invented demo participants (e.g. Ada Lovelace, Bob Ross, Eli 🎄) and provides direct links to their secret reveal pages and the demo reveal ring.
- `/demo/s/<token>`: Renders the full recipient reveal page for a demo participant, including their assigned recipient, theme wish/veto, locked color veto, and the interactive commander browser.
- `/demo/reveal`: Renders the stepped reveal-day ring animation.
- **Isolation guarantee:** Demo routes load strictly from `src/demo/demo-event.json` via `src/lib/demo.ts`. `src/lib/demo.ts` never imports `src/lib/store.ts` or Netlify Blobs, making it structurally impossible for real participant data to leak into demo views.
- All demo pages display a prominent `DEMO` badge.
- To reseed demo data:
  ```bash
  npm run seed:demo              # locked demo reveal ring
  npm run seed:demo -- --revealed  # unlocked demo reveal ring
  ```

## Running the event

### 0. Before launch: the splash page

Until registration opens, `/` is a splash page — the event's name, a countdown,
and the candidate exchange dates. It deliberately shows **no rules, no budget,
no ban list, no sign-up link and no links onward at all**: it introduces the
event, and everything else waits. That means the URL can be shared, bookmarked
and posted well ahead of time.

To open the event, set the date in `src/lib/event.ts`:

```ts
export const SIGNUPS_OPEN_AT: string | null = "2026-09-01";
```

- `null` (the default) keeps the splash up indefinitely and says "sign-ups open
  soon" rather than counting down. It is also the fail-safe: a missing date
  never opens the event by accident.
- A date swaps the splash for the real home page — rules, ban list, sign-up
  link, commander browser — at the start of that day, UTC. `/` is rendered per
  request, so **the switch needs no redeploy**; it happens on the day.

The rest of the site is *not* behind this gate. `/signup`, `/commanders` and
`/demo` all keep working for anyone with a direct link, and `/signup` accepts
entries from whenever it is deployed until `SIGNUPS_CLOSE_AT`. The splash stops
the event being *advertised* early, not the URLs being reachable — say the word
if you want sign-ups gated on the same date too.

`tests/e2e/home.spec.ts` covers both sides and picks which one to run from
`SIGNUPS_OPEN_AT`, so opening the event does not mean editing the suite.

### 1. Schedule & Configuration

- **Sign-ups open:** not announced (`SIGNUPS_OPEN_AT = null` in `src/lib/event.ts` — see step 0).
- **Sign-ups close:** 17 September 2026 (`SIGNUPS_CLOSE_AT = "2026-09-17"` in `src/lib/event.ts`).
- **Exchange date:** One of 5, 12, or 19 December 2026 (`EXCHANGE_CANDIDATES`).
- Setting `EXCHANGE_AT` in `src/lib/event.ts` (e.g. `export const EXCHANGE_AT = "2026-12-12";`) automatically switches the home page countdown from the sign-up phase to the exchange countdown.

### 2. Collect Sign-ups

Sign-ups come in through **Netlify Forms** at `/signup`. Nothing is exported or
copied by hand — `npm run draw` reads the submissions directly.

**One-time setup**, before sharing the link:

1. Netlify UI > **Forms** > **Enable form detection**.
2. Deploy. Detection is a scan of the *built* HTML, so the form only registers
   on a deploy that includes `public/__forms.html`.
3. Confirm it registered: the Forms tab should list `santa-signup`, and
   `https://<site>.netlify.app/__forms.html` should return 200.

If either check fails, submissions are dropped silently — the browser gets a
success response and Netlify never records anything.

**Before drawing, check the spam list.** Every submission goes through Akismet,
and short free-text answers arriving in a burst from one group look a lot like
spam. A false positive is invisible: the person is simply absent, the draw still
succeeds, and the ring is quietly one participant short. `npm run draw` prints
the held-back count and names on every run — if anything is listed, review it at
Forms > santa-signup > Spam and mark real sign-ups as verified before drawing.

#### CSV fallback

The CSV importer is still there for a Google Form export, a hand-written sheet,
or a rescue if something goes wrong with the live form:

1. Export the responses as CSV.
2. Confirm the headers match `COLUMN_MAP` in `scripts/csv.ts`. If they don't, the
   draw fails immediately and lists the headers it actually found.

Both sources funnel through `src/lib/signup.ts`, so validation, colour parsing
and duplicate handling behave identically either way.

### 3. Draw and Mint Links

```bash
NETLIFY_SITE_ID=<site-id> NETLIFY_AUTH_TOKEN=<token> SITE_URL=https://<site>.netlify.app \
  npm run draw -- --from=netlify-forms
```

From a CSV instead:

```bash
NETLIFY_SITE_ID=<site-id> NETLIFY_AUTH_TOKEN=<token> SITE_URL=https://<site>.netlify.app \
  npm run draw -- responses.csv
```

**Resubmissions.** With a live form, someone fixing a typo just signs up again,
so duplicate names are now normal rather than a mistake. The draw refuses to
guess: by default it fails and names the person. Pass `--latest-wins` to keep the
most recent submission per name (it prints what it superseded). Two genuinely
different people who share a name still have to be told apart by hand — names
identify people to `update-participant`.

Both `draw` and `update-participant` print their resolved target first — e.g. `Using Netlify Blobs (site abc123, explicit credentials)` or `Using local file data/event.local.json` — so a forgotten export is obvious immediately instead of silently editing a stale local file. The script refuses to run a second time once a draw exists — re-running reshuffles everyone and invalidates every link already sent. Pass `--force` if you genuinely need to redraw from scratch; either way, if a draw already existed, it is snapshotted to a timestamped `event.backup-<timestamp>.json` (or blob key) first.

Sign-up validation (`src/lib/signup.ts`, both sources) fails loudly on:
- an unrecognised colour word (only white/blue/black/red/green plus "no preference" are understood),
- an empty name (names the offending CSV row), and
- two participants sharing a name, case-insensitively (names both). Names must be unique because `update-participant` looks people up by name, not row number.

On success it prints one `name<TAB>url` line per participant, followed by a warning that anyone holding a link can read that assignment. **Treat that whole block as sensitive** — don't paste it into a shared channel, ticket, or chat; copy individual lines out to send privately instead.

### 4. Distribute Links

Send each person their own link (`https://<site>.netlify.app/s/<token>`). Anyone holding a link can read that assignment, so send them privately.

### 5. Participant Edits (Post-Draw)

To fix a veto or wish afterwards, use `npm run update-participant` — never re-run `draw`, which reshuffles everyone and invalidates every link already sent.

```bash
NETLIFY_SITE_ID=<site-id> NETLIFY_AUTH_TOKEN=<token> \
  npm run update-participant -- "Ada" --color=R --veto="mill" --wish="elves"
NETLIFY_SITE_ID=<site-id> NETLIFY_AUTH_TOKEN=<token> \
  npm run update-participant -- "Ada" --color=none
```

Looks the participant up by name (case-insensitive) and edits only the fields you pass — assignments and reveal tokens are never touched, so links already sent keep working. `--color` accepts either a code (`W`/`U`/`B`/`R`/`G`) or a colour name; `--veto`/`--wish` take free text; any of the three accepts `none` to clear that field.

### 6. Reveal Day

On the day of the gift exchange, unlock the public reveal ring (`/reveal`):

```bash
NETLIFY_SITE_ID=<site-id> NETLIFY_AUTH_TOKEN=<token> SITE_URL=https://<site>.netlify.app \
  npm run reveal
```

This sets `revealedAt` in the store and prints the live `/reveal` URL. The
organiser console at `/admin` does the same thing behind a login (see below).
To re-lock if run prematurely:

```bash
NETLIFY_SITE_ID=<site-id> NETLIFY_AUTH_TOKEN=<token> \
  npm run reveal -- --undo
```

When locked (`revealedAt` is null), `/reveal` renders a 404.

Locally, omit the Netlify variables and scripts operate on `data/event.local.json` (gitignored). The repo is public — participant data must never be committed.

### 7. Organiser Console (optional)

`/admin` does the reversible parts of the job from a browser — unlock or re-lock
reveal day, and edit a participant's preferences — behind Netlify Identity, so
running the event no longer means pasting a full-scope `NETLIFY_AUTH_TOKEN` onto
a command line.

**It deliberately does not offer the draw.** Re-running it reshuffles everyone
and invalidates every link already sent, and unlike the other actions there is
no undo, so it stays on the CLI where running it takes intent.

**Setup** (dashboard only — Identity has no configuration API):

1. Project configuration > **Identity** > Enable Identity.
2. Registration preferences > **Invite only**. With open registration the
   signup handler would hand the organiser role to anyone who signed up.
3. Invite yourself under Identity > Users. Identity email links may return to
   the site homepage; the app forwards their callback token to `/admin/login`,
   which processes it and asks for a password.
4. Grant the `admin`, `organiser`, or `organizer` role (Identity > Users > Edit
   settings > `app_metadata.roles`). Role changes take effect on the next login
   or token refresh, not immediately.

**It cannot be tested locally.** Identity does not work under `netlify dev`, and
`getUser()` returns `null` off-platform — so `/admin` always renders its
signed-out state on `npm run dev`. That is why all the actual work lives in
`src/lib/admin.ts` under unit test, and the routes are a role check plus a call.
Test the auth flow itself on a Deploy Preview.

**Enforcement is server-side, in two places:** `src/app/admin/page.tsx` decides
what renders, and every Server Action in `src/app/admin/actions.ts` re-checks the
role independently — an action is a callable endpoint regardless of what the page
showed. Role-based redirect rules in `netlify.toml` were considered and left out:
on this site every route resolves through the Next.js server handler, and a
forced edge rule shadowing that catch-all risks 404ing the console outright for
no security gain over the checks already in place.

**Previews are isolated from production data** — `src/lib/store.ts` gives any
non-production deploy context its own empty store, so a console on a Deploy
Preview has nothing to unlock and cannot reach the real event. See *Store
Resolution* below. Password-protecting previews in the Netlify UI is still worth
doing, but it guards a different thing: it stops strangers reading a preview, not
an organiser acting on the wrong browser tab.

## Development & Architecture notes

- **Commander Browser & Filtering:**
  - The browser (`src/components/CommanderBrowser.tsx`) provides 5 color filter pips (`W`, `U`, `B`, `R`, `G`) using subset semantics (a two-color card appears only when both of its colors are selected; colorless cards match all selections), a live search query input, and a "Can pair" toggle.
  - On the secret reveal page (`/s/[token]`), the recipient's color veto is pre-excluded, disabled, and rendered as a locked red pip.
  - The client requests random batches of 9 commanders from `/api/commanders/sample`, which enforces server-side veto exclusions and applies `cache-control: no-store` to guarantee fresh random samples on each roll.
  - Clicking any card tile opens `CommanderDetail.tsx` displaying the card image, mana cost, type line, oracle text, uncommon printing legality line (`Uncommon in <Set Name>`), estimated USD market price (`~$X.XX`), and pairing badge.
    - Price falls back to the foil price only when no non-foil price exists, and is then labelled `(foil)`. A foil is often several times the non-foil, so an unlabelled fallback would misrepresent a card's cost against the $75 budget.
  - **External Deckbuilding Links:** The detail view offers one-click outbound links to EDHREC (normalized commander slug), Moxfield advanced commander deck search, and Scryfall.
  - **Interactive Theme Prompts:** `ThemePrompt.tsx` surfaces curated deckbuilding hooks (e.g. "Spellslinger", "Artifacts", "Voltron") with a "Search this theme" button.
    - The button sets a **separate `theme=` filter matched against the card's rules text** — never the `q=` name filter. Prompt keywords are mechanics, and 16 of the 22 match **zero** commander names in the live pool while each matches 9–462 cards by rules text; routing them through the name box makes the feature return nothing for most prompts.
    - The active theme renders as a chip ("showing commanders whose rules text mentions…") with a Clear theme button, so it is visible and reversible rather than a mysterious empty grid.
- **Private Notes Scratchpad (`SecretScratchpad.tsx`):**
  - Present on `/s/[token]` and `/demo/s/[token]`, providing participants a place to draft deck ideas, card links, or wishlist thoughts.
  - Backed by browser `localStorage` keyed uniquely per token (`secret-santa-scratchpad-<token>`).
  - SSR hydration-safe via React 19's `useSyncExternalStore` with custom window storage events for instantaneous multi-tab sync.
  - **Privacy Guarantee:** Scratchpad notes are stored exclusively in the client's local browser and are never sent over the network, stored in Netlify Blobs, or leaked into server logs.
- **Reveal Day Confetti & Discord Export (`RevealRing.tsx`, `Confetti.tsx`):**
  - Once all participants are stepped through on `/reveal` and the loop closes, a festive CSS-only particle celebration (`<Confetti />`) triggers, respecting `@media (prefers-reduced-motion: reduce)` settings.
  - A "Copy Discord Summary" button formats the complete gift exchange ring into spoiler markdown (`||Giver ➜ Recipient||`) with copy feedback for instant channel announcements.
- **Scryfall Queries & Caching:**
  - Upstream queries:
    - Pool: `f:edh is:commander r:u game:paper` (~704 cards). `game:paper` is load-bearing: without it, digital-only MTGO uncommon reprints would wrongly enter the pool.
    - Partner-capable: `f:edh is:commander r:u game:paper otag:pair-commander` (~65 cards). Catches Partner, Partner with, "Choose a Background", and Backgrounds.
  - Cached for 24 hours (`revalidate: 86400`) via Next.js fetch cache. Scryfall sees ~6 requests per day total across all users.
  - Every request sends Scryfall's required headers: `User-Agent: FormerFabSecretSanta/1.0` and `Accept: application/json`.
  - Transform-layout cards (e.g. Exdeath, Garland, The Emperor of Palamecia, Ultimecia) fall back to `card_faces[0]` for image and oracle data.
- **Reveal Ring Algorithm:**
  - `buildRing` (`src/lib/ring.ts`) verifies that the derangement forms a single complete cycle across all participants before constructing the stepped reveal sequence. If non-cycle or disconnected components are found, it fails loudly.
- **Path Imports:**
  - `package.json`'s `"imports"` map (`#lib/*` → `src/lib/*.ts`, `#scripts/*` → `scripts/*.ts`) exists because Node's built-in TypeScript stripping (`node --experimental-strip-types`, used to run the scripts) won't resolve extensionless relative imports, while `tsc` rejects imports with an explicit `.ts` suffix.
- **E2E Test Fixtures:**
  - `playwright.config.ts` sets `EVENT_DATA_PATH=tests/e2e/fixture-event.json` for its `webServer`, running tests against fake, committed test data (Ada, Bob, Cleo) without requiring Netlify credentials.
  - **The suite runs serially (`workers: 1`), deliberately.** With four workers on a cold cache, parallel first-hits to each route contend on on-demand compilation and the initial Scryfall pool fetch, and 3–4 tests time out. CI always starts cold, where `retries: 2` was quietly masking it. Serial costs about seven seconds on a ~23s suite and makes cold runs deterministic.

## Deploying

`netlify.toml` pins the build command (`npm run build`), publish directory (`.next`), and Node version (22). Netlify installs its Next.js runtime automatically — no adapter package needed. The site uses Netlify Blobs (`secret-santa` store) provisioned automatically per-site.

The Netlify CLI is **not** a project dependency (due to an OpenTelemetry dependency conflict with Vitest 4). Run it via `npx` or install it globally:

```bash
npx --yes netlify-cli login && npx --yes netlify-cli link
npx --yes netlify-cli deploy --build --prod
```

### Store Resolution (`src/lib/store.ts`)

- **Deployed on Netlify:** `NETLIFY_BLOBS_CONTEXT` is auto-injected by the Netlify server runtime; Blobs is used automatically with no manual credentials. Which store depends on `CONTEXT` — see below.
- **Local operator scripts:** Provide `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN` to read/write the live Blobs store. If only one variable is set, the script exits immediately with a misconfiguration error.
- **Local development / E2E:** When neither Netlify variable is set, the store falls back to `data/event.local.json` (or `EVENT_DATA_PATH`).
- **Deploy-context isolation:** `getStore` is scoped to the *site*, so it is shared by production and every Deploy Preview and branch deploy. Only `CONTEXT=production` gets it; every other context gets a deploy-scoped store via `getDeployStore`, which starts empty.

  This is not hypothetical tidiness. Without it, the organiser console at `/admin` would offer a working "unlock /reveal" button on a public preview URL that writes to the real event, publishing the whole ring early — and after reveal day a preview would serve the full ring to anyone with the URL. With it, a preview renders "no draw yet", `/s/<token>` 404s, and the console has nothing to unlock: the same structural isolation the `/demo` routes have.

  **A missing `CONTEXT` fails closed**, to the deploy-scoped store. If Netlify ever stops providing it, production shows an empty event — loud, obvious, fixed in minutes — rather than previews quietly writing to live data. `describeTarget()` prints which store was chosen, so a wrong answer is visible rather than inferred.

  Explicit credentials are unaffected: the operator's CLI always reaches the real store.

- **Atomic Writes & Backups:** `writeEvent` snapshots the current state to a timestamped backup before writing changes (via atomic temp-file rename on local disk or timestamped key in Blobs).
