# Former Fab Players Winter Secret Santa 2026

A Next.js site for the 2026 winter Secret Santa, deployed on Netlify.

## Status

Feature-complete. The site provides a filterable commander browser, runs the draw
from a CSV export, serves each participant a secret reveal page with their assignment,
and features a stepped public reveal-day ring, a two-phase countdown, a festive winter
palette with reduced-motion snowfall, and demo preview routes. 162 unit tests, 12 Playwright
E2E tests, and lint/typecheck/build are all clean.

See:
- [Original Design Spec](docs/superpowers/specs/2026-08-16-secret-santa-site-design.md)
- [Original Implementation Plan](docs/superpowers/plans/2026-08-16-secret-santa-site.md)
- [Commander Browser & Reveal Day Design Spec](docs/superpowers/specs/2026-08-16-commander-browser-and-reveal-day-design.md)
- [Commander Browser & Reveal Day Implementation Plan](docs/superpowers/plans/2026-08-16-commander-browser-and-reveal-day.md)

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
| `npm run draw`                | CSV → derangement draw → tokens → store; prints links                        |
| `npm run update-participant`  | Edit one participant's vetoes/wish without redrawing                        |
| `npm run reveal`              | Unlock or lock the public reveal page (`-- --undo` to lock)                 |
| `npm run seed:demo`           | Regenerate fake demo data in `src/demo/demo-event.json` (`-- --revealed` to unlock) |

CI runs lint → typecheck → unit → E2E on every push and pull request.

## Layout

```
src/app/        routes and layouts (App Router: /, /commanders, /s/[token], /reveal, /demo/**)
src/components/ React components (CommanderBrowser, CommanderDetail, RevealRing, Countdown, Snowfall, etc.)
src/lib/        framework-free logic; unit-tested (draw, ring, filtering, countdown, Scryfall, store)
src/demo/       committed fake event data for /demo routes (never touches real participants)
scripts/        operator CLI: CSV import, the draw, participant edits, reveal day toggle, demo seeder
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

### 1. Schedule & Configuration

- **Sign-ups close:** 17 September 2026 (`SIGNUPS_CLOSE_AT = "2026-09-17"` in `src/lib/event.ts`).
- **Exchange date:** One of 5, 12, or 19 December 2026 (`EXCHANGE_CANDIDATES`).
- Setting `EXCHANGE_AT` in `src/lib/event.ts` (e.g. `export const EXCHANGE_AT = "2026-12-12";`) automatically switches the home page countdown from the sign-up phase to the exchange countdown.

### 2. Export & Validate CSV

1. Export the Google Form responses as CSV.
2. Confirm the headers match `COLUMN_MAP` in `scripts/csv.ts`. If they don't, the draw fails immediately and lists the headers it actually found.

### 3. Draw and Mint Links

```bash
NETLIFY_SITE_ID=<site-id> NETLIFY_AUTH_TOKEN=<token> SITE_URL=https://<site>.netlify.app \
  npm run draw -- responses.csv
```

Both `draw` and `update-participant` print their resolved target first — e.g. `Using Netlify Blobs (site abc123, explicit credentials)` or `Using local file data/event.local.json` — so a forgotten export is obvious immediately instead of silently editing a stale local file. The script refuses to run a second time once a draw exists — re-running reshuffles everyone and invalidates every link already sent. Pass `--force` if you genuinely need to redraw from scratch; either way, if a draw already existed, it is snapshotted to a timestamped `event.backup-<timestamp>.json` (or blob key) first.

`scripts/csv.ts` fails loudly on:
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

This sets `revealedAt` in the store and prints the live `/reveal` URL.
To re-lock if run prematurely:

```bash
NETLIFY_SITE_ID=<site-id> NETLIFY_AUTH_TOKEN=<token> \
  npm run reveal -- --undo
```

When locked (`revealedAt` is null), `/reveal` renders a 404.

Locally, omit the Netlify variables and scripts operate on `data/event.local.json` (gitignored). The repo is public — participant data must never be committed.

## Development & Architecture notes

- **Commander Browser & Filtering:**
  - The browser (`src/components/CommanderBrowser.tsx`) provides 5 color filter pips (`W`, `U`, `B`, `R`, `G`) using subset semantics (a two-color card appears only when both of its colors are selected; colorless cards match all selections), a live search query input, and a "Can pair" toggle.
  - On the secret reveal page (`/s/[token]`), the recipient's color veto is pre-excluded, disabled, and rendered as a locked red pip.
  - The client requests random batches of 9 commanders from `/api/commanders/sample`, which enforces server-side veto exclusions and applies `cache-control: no-store` to guarantee fresh random samples on each roll.
  - Clicking any card tile opens `CommanderDetail.tsx` displaying the card image, mana cost, type line, oracle text, uncommon printing legality line (`Uncommon in <Set Name>`), and pairing badge.
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

## Deploying

`netlify.toml` pins the build command (`npm run build`), publish directory (`.next`), and Node version (22). Netlify installs its Next.js runtime automatically — no adapter package needed. The site uses Netlify Blobs (`secret-santa` store) provisioned automatically per-site.

The Netlify CLI is **not** a project dependency (due to an OpenTelemetry dependency conflict with Vitest 4). Run it via `npx` or install it globally:

```bash
npx --yes netlify-cli login && npx --yes netlify-cli link
npx --yes netlify-cli deploy --build --prod
```

### Store Resolution (`src/lib/store.ts`)

- **Deployed on Netlify:** `NETLIFY_BLOBS_CONTEXT` is auto-injected by the Netlify server runtime; Blobs is used automatically with no manual credentials.
- **Local operator scripts:** Provide `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN` to read/write the live Blobs store. If only one variable is set, the script exits immediately with a misconfiguration error.
- **Local development / E2E:** When neither Netlify variable is set, the store falls back to `data/event.local.json` (or `EVENT_DATA_PATH`).
- **Atomic Writes & Backups:** `writeEvent` snapshots the current state to a timestamped backup before writing changes (via atomic temp-file rename on local disk or timestamped key in Blobs).
