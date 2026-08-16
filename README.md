# Former Fab Players Winter Secret Santa 2026

A Next.js site for the 2026 winter Secret Santa, deployed on Netlify.

## Status

Feature-complete. The site suggests random legal commanders, runs the draw
from a CSV export, and serves each participant a secret reveal page with
their assignment. 68 unit tests, 7 Playwright E2E tests, and lint/typecheck/
build are all clean. See [the design spec](docs/superpowers/specs/2026-08-16-secret-santa-site-design.md)
and [the implementation plan](docs/superpowers/plans/2026-08-16-secret-santa-site.md)
for how it got here.

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

| Script                       | Does                                             |
| ----------------------------- | ------------------------------------------------ |
| `npm run dev`                 | Next dev server                                  |
| `npm run build`                | Production build                                 |
| `npm run lint`                 | ESLint                                            |
| `npm run typecheck`            | `next typegen` then `tsc --noEmit`                |
| `npm test`                     | Vitest (unit + component), single run             |
| `npm run test:watch`           | Vitest in watch mode                              |
| `npm run test:e2e`             | Playwright; boots the dev server itself           |
| `npm run netlify:dev`          | Netlify Dev, for functions/redirects/env parity   |
| `npm run draw`                 | CSV → derangement draw → tokens → store; prints links |
| `npm run update-participant`   | Edit one participant's vetoes/wish without redrawing |

CI runs lint → typecheck → unit → E2E on every push and pull request.

## Layout

```
src/app/        routes and layouts (App Router)
src/lib/        framework-free logic; unit-tested (the draw algorithm lands here)
scripts/        operator CLI: CSV import, the draw, participant edits
tests/e2e/      Playwright specs
```

Unit tests sit next to their subject (`src/lib/event.ts` → `src/lib/event.test.ts`).

## Running the event

1. Export the Google Form responses as CSV.
2. Confirm the headers match `COLUMN_MAP` in `scripts/csv.ts`. If they don't,
   the draw fails immediately and lists the headers it actually found.
3. Draw and mint links:

   ```bash
   NETLIFY_SITE_ID=<site-id> NETLIFY_AUTH_TOKEN=<token> SITE_URL=https://<site>.netlify.app \
     npm run draw -- responses.csv
   ```

   Both `draw` and `update-participant` print their resolved target first —
   e.g. `Using Netlify Blobs (site abc123, explicit credentials)` or
   `Using local file data/event.local.json` — so a forgotten export is obvious
   immediately instead of silently editing a stale local file. The script
   refuses to run a second time once a draw exists — re-running reshuffles
   everyone and invalidates every link already sent. Pass `--force` if you
   genuinely need to redraw from scratch; either way, if a draw already
   existed, it's snapshotted to a timestamped `event.backup-<timestamp>.json`
   (or blob key) first.

   `scripts/csv.ts` fails loudly, rather than silently importing bad data,
   on:
   - an unrecognised colour word (only white/blue/black/red/green plus "no
     preference" are understood — the error lists the known words),
   - an empty name (the error names the offending CSV row), and
   - two participants sharing a name, case-insensitively (the error names
     both). Names must be unique because `update-participant` (below) looks
     people up by name, not by row number.

   On success it prints one `name<TAB>url` line per participant, followed by
   a warning that anyone holding a link can read that assignment. **Treat
   that whole block as sensitive** — don't paste it into a shared channel,
   ticket, or chat; copy individual lines out to send privately instead.

4. Send each person their own link. Anyone holding a link can read that
   assignment, so send them privately.
5. To fix a veto afterwards, use `npm run update-participant` — never re-run
   `draw`, which reshuffles everyone and invalidates every link already sent.

   ```bash
   npm run update-participant -- "Ada" --color=R --veto="mill" --wish="elves"
   npm run update-participant -- "Ada" --color=none
   ```

   Looks the participant up by name (case-insensitive) and edits only the
   fields you pass — assignments and reveal tokens are never touched, so
   links already sent keep working. `--color` accepts either a code
   (`W`/`U`/`B`/`R`/`G`) or a colour name; `--veto`/`--wish` take free text;
   any of the three accepts `none` to clear that field. Unknown flags (e.g. a
   typo like `--colour=`) and repeated flags are rejected with an error
   rather than silently ignored, and an invalid colour is validated the same
   way as in the CSV import. It prints a before → after diff of the three
   fields so you can confirm the edit landed correctly.

Locally, omit the Netlify variables and the data goes to `data/event.local.json`
(gitignored). The repo is public — participant data must never be committed.

## Development notes

- **Path imports.** `package.json`'s `"imports"` map (`#lib/*` → `src/lib/*.ts`,
  `#scripts/*` → `scripts/*.ts`) exists because Node's built-in TypeScript
  stripping (`node --experimental-strip-types`, used to run the scripts) won't
  resolve extensionless relative imports, while `tsc` rejects imports with an
  explicit `.ts` suffix. The subpath-imports map satisfies both. Don't
  "simplify" these back to relative imports.
- **E2E fixture data.** `playwright.config.ts` sets
  `EVENT_DATA_PATH=tests/e2e/fixture-event.json` for its `webServer`, so the
  Playwright suite runs against fake, checked-in test data — Ada, Bob and a
  deliberately-broken third entry — with no Netlify credentials required.
  This is separate from and unrelated to real participant data; never point
  it at `data/event.local.json` or a real Blobs store.
- **The commander pool query** is `f:edh is:commander r:u game:paper`
  (currently ~704 cards), cached for 24h by Next's fetch cache. `game:paper`
  is load-bearing: without it, around 20 cards whose only uncommon printing
  is digital-only (MTGO reprints) would wrongly enter the pool.

## Deploying

`netlify.toml` pins the build command (`npm run build`), publish directory
(`.next`), and Node version (22). Netlify installs its Next.js runtime
automatically — no adapter package needed. The site also needs a Netlify
Blobs store available (Netlify provisions this per-site automatically; no
separate setup is required beyond having the site linked).

The Netlify CLI is **not** a project dependency: it pins
`@opentelemetry/api@~1.8.0`, which conflicts with Vitest 4's `^1.9.0` and
breaks `npm ci`. Run it through `npx` instead, or install it globally.

To connect this clone to the Netlify project and deploy:

```bash
npx --yes netlify-cli login && npx --yes netlify-cli link
npx --yes netlify-cli deploy --build --prod
```

`src/lib/store.ts` picks its data target from environment variables, not a
single flag — see the `resolveMode` doc comment there for the authoritative
rules. In short:

- Deployed on Netlify: `NETLIFY_BLOBS_CONTEXT` is auto-injected by the Netlify
  runtime (Functions, Edge Functions, and the Next.js server runtime once
  deployed), so Blobs is used automatically, with no manual credentials.
  `NETLIFY_SITE_ID` alone is **not** a reliable runtime signal — Netlify
  documents it as a build-time variable, not guaranteed to be set inside the
  deployed function/server runtime.
- Running a script locally against the real store (as in "Running the event"
  above): export both `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN` and Blobs is
  used with those credentials explicitly. Setting only one of the two is
  treated as a misconfiguration and fails loudly rather than silently falling
  back to the local file.
- Neither Netlify variable set, and no `NETLIFY_BLOBS_CONTEXT`: the local JSON
  file is used (`npm run dev`, Playwright E2E).

`writeEvent` also snapshots the current event to a timestamped sibling
key/file before overwriting a non-empty one — a way back from a careless
`--force` redraw or a crash mid-write. There's no rotation or automatic
cleanup of these backups.
