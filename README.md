# Former Fab Players Winter Secret Santa 2026

A Next.js site for the 2026 winter Secret Santa, deployed on Netlify.

## Status

Feature-complete, and currently **pre-launch**: the home page is a splash page
until the organiser opens registration (see *Before launch* below). Behind it,
the site takes sign-ups through Netlify Forms, provides a filterable commander
browser, takes each person's own two pool commanders — either of which may be a
**partner pair** — on the sign-up form itself, runs the draw from those sign-ups
(or a CSV export), collects a private recommendation for every other
participant, serves each participant a locked three-card shortlist with a
one-time hidden-card trade, and features a stepped public reveal-day ring, a
two-phase countdown, a festive winter palette with reduced-motion snowfall,
private per-link scratchpads and decklist links, enlarged card previews on
hover, interactive deck prompts, demo preview routes, an Identity-gated
organiser console, a **Discord nudge** for whoever still owes card picks, and a
**deletion path** for every copy of someone's personal data. 539 unit tests, 28
Playwright E2E tests, and lint/typecheck/build are all clean.

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
| Data       | Netlify Blobs + Netlify Database (Postgres)   |
| Sign-ups   | Netlify Forms → a `formSubmitted` function → Postgres |
| Nudges     | Netlify scheduled function → Discord incoming webhook |

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
| `npm run forget`              | Erase one person's personal data, or the whole event's (`-- --everyone`); prints the plan and stops unless given `--yes` |
| `npm run nudge`               | Post the outstanding-picks nudge to Discord (`-- --dry-run` to preview, `-- --force` to ignore the quiet period) |
| `npm run seed:demo`           | Regenerate fake demo data in `src/demo/demo-event.json` (`-- --revealed` to unlock); fetches the real pool so demo pool cards are real |

CI runs lint → typecheck → unit → E2E on every push and pull request.

## Layout

```
src/app/        routes and layouts (App Router: /, /signup, /commanders, /s/[token], /reveal, /admin/**, /demo/**)
db/             Drizzle schema for persistent card picks and secret shortlists
src/components/ React components (SplashPage, EventHome, CommanderBrowser, RevealRing, Countdown, Snowfall, etc.)
src/lib/        framework-free logic; unit-tested (draw, ring, pairing, pool rules, filtering, countdown, launch gate, Scryfall, store, nudge, erasure planning)
src/demo/       committed fake event data for /demo routes (never touches real participants)
src/test-support/ commander fixtures shared by the test suite (never imported by app code)
netlify/functions/ signup-submitted.mts mirrors Forms into Postgres; nudge.mts posts outstanding picks to Discord on a schedule
scripts/        operator CLI: sign-up import (Forms + CSV), the draw, participant edits, reveal day toggle, Discord nudge, data erasure, demo seeder
public/         static assets; __forms.html registers the sign-up form with Netlify
tests/e2e/      Playwright specs
```

Unit tests sit next to their subject (`src/lib/event.ts` → `src/lib/event.test.ts`, `src/components/RevealRing.tsx` → `src/components/RevealRing.test.tsx`).

## Demo

The site includes dedicated demo routes at `/demo`, `/demo/s/<token>`, and `/demo/reveal` so organizers and participants can preview the entire application workflow safely.

The demo data is a **complete event, mid-flight**: eight invented people have
all signed up, all chosen their own two commanders, and all made their 56
recommendations for each other, so the workshop has closed and every assignment
is open. That is the state worth previewing — a half-finished one shows a
workshop rather than the thing people are waiting for.

- `/demo`: Lists the invented participants (Ada Lovelace, Bob Ross, Eli 🎄 …) with their colour vetoes and whether they have saved a decklist, plus links onward to reveal day, the sign-up form and the commander browser.
- `/demo/s/<token>`: The full private link — the participant's own sign-up answers (collapsed), who they are building for with that person's vetoes, their three cards, a link to the browser, and the decklist box.
  - **The shortlist is drawn by the real function.** `pickSecretCards` runs over the selections committed in `demo-event.json`, so what the demo shows is what the live site would compute, not a stand-in. That is what `src/lib/card-pool.ts` exists for: the pool rules are pure and separate from `card-selections.ts`, which owns the storage, so the demo can use them without loading a database client.
  - The draw is seeded from the participant's token rather than `Math.random`, because a real shortlist is drawn once and stored. Without the seed, reloading a demo link would reshuffle the three cards and imply they are not fixed.
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

A sign-up carries a name, an **email address**, an optional colour veto, two
optional theme answers, and **two commanders, which are required**.

The two commanders are the start of that person's own pool: everyone else adds
one more card to it after the draw, and whoever ends up building their deck is
shown a shortlist taken from the whole pool.

The address is required, because a roster without one cannot be used to send
the private links — which is the only reason it is collected. It is personal
data: it lands in the Netlify Forms store, the `signups` table and the event
store, and is shown on the Identity-gated organiser console. It is never
rendered on a page any participant can see, and `npm run forget` removes every
copy of it (see *Erasing Personal Data*). Validation is deliberately permissive
(`something@something.something`) — a stricter pattern mostly succeeds at
rejecting real addresses, and a typo that parses is caught by the mail
bouncing.

The two commanders are chosen from a **type-to-filter dropdown of every legal
commander**, not typed freely, so a submission cannot name a card outside the
pool. Either may be a **partner pair** — a pair is one of the two choices, not
both — and the form offers the partner slot only for a commander that can
actually take one. The form also re-checks them against the colour veto, dropping a pick if
the veto is changed underneath it. Alongside it is a link to the full commander
browser at `/commanders`, opened in a new tab so following it does not discard
a half-filled form.

Card picks are submitted **by name** rather than by Scryfall id, so the Netlify
Forms dashboard and the CSV fallback both stay readable.

#### From Forms into the database

Netlify Forms stores submissions in Netlify's own store, reachable only through
the UI, the API or a CSV export — nothing queries it like a database. The bridge
is a **platform-event function**, `netlify/functions/signup-submitted.mts`,
which exports a `formSubmitted` handler. Netlify invokes it (signed, in the
background) with the submitted fields; it resolves the two card names against
the live pool and writes a row to the `signups` table.

Forms deliberately stays the front door. It runs Akismet, gives the organiser a
spam list and a dashboard, and needs no backend code — none of which is worth
hand-rolling on a public endpoint.

Two properties worth knowing:

- **Picks are resolved on arrival, not at draw time.** The legal pool changes
  when a set is released, so resolving late means a release between sign-up and
  the draw can invalidate a pick that was fine when it was made. The CSV and
  Forms-API fallbacks still resolve late, because that is all they can do.
- **A retried delivery is a no-op.** `FormSubmittedEvent` is `{ data }` and
  nothing else — no submission id, no timestamp — and platform-event functions
  are retried on invocation error. The row's primary key is therefore a hash of
  the submission's own content: the same answers collide and are dropped, while
  a genuine resubmission hashes differently and lands as its own row for
  `dedupeSignups` to arbitrate exactly as a second CSV row would.

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
2. Confirm the headers match `COLUMN_MAP` in `scripts/csv.ts` — including the
   two card columns (`First commander for your pool`, `Second commander for
   your pool`). If they don't, the draw fails immediately and lists the headers
   it actually found.

Both sources funnel through `src/lib/signup.ts`, so validation, colour parsing
and duplicate handling behave identically either way.

### 3. Draw and Mint Links

The default source is the database — the rows the sign-up function wrote:

```bash
NETLIFY_DB_URL=<postgres-url> NETLIFY_SITE_ID=<site-id> NETLIFY_AUTH_TOKEN=<token> SITE_URL=https://<site>.netlify.app \
  npm run draw
```

`NETLIFY_DB_URL` is the connection string `drizzle-orm/netlify-db` reads; copy
it from the Netlify UI. The Netlify variables are still needed because the draw
*writes* to Blobs. Reading the database first means a bad connection string
fails the run before anything has been written.

Straight from the Forms API instead, skipping the database (card names are
resolved at draw time on this path):

```bash
NETLIFY_SITE_ID=<site-id> NETLIFY_AUTH_TOKEN=<token> SITE_URL=https://<site>.netlify.app \
  npm run draw -- --from=netlify-forms
```

From a CSV:

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
- an empty name (names the offending CSV row),
- two participants sharing a name, case-insensitively (names both). Names must be unique because `update-participant` looks people up by name, not row number,
- a missing card pick, or the same card picked twice, and
- a card name that is not in the live pool, is banned, or carries that person's own vetoed colour. The draw fetches the pool and checks every pick **before writing anything**, and reports every bad pick in one go rather than dying on the first — each one means going back to the person who submitted it.

**The draw cross-checks Netlify Forms against the database before it runs.**
Two things can silently swallow a real sign-up: Akismet flags it into the spam
list, or `signup-submitted` throws and no row is ever written. Either way the
submitter sees success and the person is simply absent — the draw succeeds and
the ring is quietly one short. `scripts/reconcile.ts` compares the two and:

- **stops the draw** when a verified submission has no row, because the draw is
  the irreversible step and carrying on writes a ring permanently missing
  someone (`--ignore-unrecorded` overrides);
- **warns** about anything in the spam list, since whether those are real people
  is a judgement only the organiser can make;
- **notes** rows with no verified submission behind them, and draws them anyway.

Without `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN` the check cannot run, and the
draw says so loudly rather than passing in silence.

The draw also refuses to run with fewer than **four** participants. A giver's
shortlist is four unique cards from their recipient's pool minus their own
contribution to it, which leaves exactly as many cards as there are
participants — so three people can never unlock the exchange however they pick.

On success it prints one `name<TAB>url` line per participant. **Treat that whole block as sensitive** — don't paste it into a shared channel, ticket, or chat; copy individual lines out to send privately instead.

### 4. Distribute Links

Send each person their own link (`https://<site>.netlify.app/s/<token>`). The link first opens a private card workshop, but it reveals the assignment once every participant has finished, so send it privately.

Each participant saves one commander for every other participant. Their own two cards came in with their sign-up and are shown read-only — changing one is an organiser job rather than a self-service one, because they are already in the pool everyone else is drawing against. The app excludes each recipient's vetoed colour on both the search endpoint and the save action. When every required slot is filled, the submissions lock automatically. Duplicate recommendations are allowed while choosing, but the exchange does not unlock until every assigned recipient has at least four unique eligible cards after excluding their deck builder's own recommendation.

Once unlocked, each deck builder receives a stable random set of four cards drawn from their recipient's two sign-up picks plus recommendations from everyone except the deck builder. Three cards are shown. The fourth remains server-side and hidden until the participant permanently trades one visible card for it; that cash-in can only succeed once.

Their private link shows, in order: a collapsed recap of their own sign-up answers (their two cards, colour veto, theme veto and wish); the person they are building for, that person's stated vetoes, and the three-card shortlist; a link to the commander browser; and a box to save the decklist they are assembling. The decklist link lives in the `deck_builds` table keyed by *giver*, so reading that table never reveals who is building for whom.

**One slow person holds up everybody**, by design — the exchange cannot unlock until the last pick is in, and this is a group of friends who can chase each other. See *Chasing Outstanding Picks* below for the tooling that makes it obvious who to chase.

**Where the picks live.** The two sign-up picks are stored on the participant record in Netlify Blobs, written by the draw; the `card_selections` table holds peer picks only. The draw already writes the Blobs store and holds no Postgres credentials, so seeding the table there would add a second, separately-failing write to the one step that must not half-succeed.

### 5. Participant Edits (Post-Draw)

To fix a veto or wish afterwards, use `npm run update-participant` — never re-run `draw`, which reshuffles everyone and invalidates every link already sent.

```bash
NETLIFY_SITE_ID=<site-id> NETLIFY_AUTH_TOKEN=<token> \
  npm run update-participant -- "Ada" --color=R --veto="mill" --wish="elves"
NETLIFY_SITE_ID=<site-id> NETLIFY_AUTH_TOKEN=<token> \
  npm run update-participant -- "Ada" --color=none
```

Looks the participant up by name (case-insensitive) and edits only the fields you pass — assignments and reveal tokens are never touched, so links already sent keep working. `--color` accepts either a code (`W`/`U`/`B`/`R`/`G`) or a colour name; `--veto`/`--wish` take free text; any of the three accepts `none` to clear that field.

`--email` corrects an address; there is no `none` for it, since it is required.

`--color` is refused if the participant's **own** pool cards carry that colour, and names them: those cards are already in the pool everyone else draws from, and nothing downstream re-checks them. Clearing the veto (`--color=none`) is always allowed.

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

**What it shows.** The roster with everyone's email (and a "mail everyone"
link that puts the addresses in Bcc), each person's stated preferences, a
**Who to chase** section counting outstanding picks per person, and **every
participant's pool** — their own two sign-up choices plus one from each other
participant, attributed to whoever chose it, with a count of distinct choices
and a list of who has not picked yet. Attribution is safe: everybody picks for
everybody, so who contributed what says nothing about who was assigned whom.

An address that has been erased at its owner's request shows as *"address
erased at their request"* rather than an empty mailto link, and drops out of
both the mail-everyone and chase-these-people links.

**It does not hide your own pool.** If you are playing, looking at your own
entry spoils your own shortlist, and nothing stops you — that was a deliberate
choice over special-casing the signed-in organiser.

**The pools tolerate a database outage.** They are the only part of the console
that needs Postgres; if the read fails the section says so and the reveal
toggle and participant edits keep working, rather than the whole console 500ing
over reference material.

**It deliberately does not offer the draw, or erasure.** Re-running the draw
reshuffles everyone and invalidates every link already sent; erasure is
irreversible and in some modes destroys the only remaining copy. Neither has an
undo, so both stay on the CLI where running them takes intent. Everything the
console does offer is either reversible or additive.

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

### 8. Chasing Outstanding Picks (Discord)

The exchange cannot start until every participant has picked one commander for
every other participant. That is deliberate — this is a group of friends who
can bug each other — but it makes one slow person invisible unless somebody
goes looking at the console. A scheduled function posts who is holding things
up into Discord.

**Netlify has no email service of its own.** Form notifications only reach the
address you configure, and Identity's transactional emails only reach Identity
users (that is you, not the participants). A Discord incoming webhook needs no
provider, no domain verification and no API key — the webhook URL *is* the
credential.

**Setup:**

1. In Discord: **Server Settings > Integrations > Webhooks > New Webhook**,
   pick the channel, **Copy Webhook URL**.
2. In Netlify: **Project configuration > Environment variables**, add
   `DISCORD_WEBHOOK_URL`, scope **Functions**. Variables set in `netlify.toml`
   are *not* available to functions, and values are frozen per deploy — so
   redeploy after adding it.
3. Preview what it will say before it says it:

   ```bash
   NETLIFY_SITE_ID=<site-id> NETLIFY_AUTH_TOKEN=<token> NETLIFY_DB_URL=<url> \
     npm run nudge -- --dry-run
   ```

**It is quiet on purpose.** A bot that posts every day gets muted, and a muted
bot is worse than none on the day it matters. So:

- Nothing is posted at all once everybody has picked.
- Progress is news: it posts as soon as the picture changes.
- No progress is not news: it waits `QUIET_DAYS` (3) before repeating itself.

The last post's fingerprint is kept in `nudge.json` beside the event data. It
is written **only after a successful send**, so a failed post does not go quiet
for three days having said nothing.

**What it says**, and does not:

```
🎁 **Secret Santa — commander picks**

9 of 12 picks are in. Waiting on 1 person:
• **Dara** — 3 picks

Everyone picks one commander for every other player — …
```

Names and counts, nothing else. Assignments are not an input to `nudgeStatus`
at all, and reveal tokens are not either — that is structural rather than a
rule to remember, and there are tests asserting neither appears in a message.
`allowed_mentions` is pinned so a message can never ping `@everyone` or a role.

**The schedule** is `0 23 * * *` in `netlify/functions/nudge.mts` — 23:00 UTC,
which is 6pm US Eastern in winter, when this event runs. Cron is always UTC, so
it drifts an hour if it ever runs through the summer. Scheduled functions only
fire on **published production deploys**, never on Deploy Previews or branch
deploys, and there is no local schedule — invoke it once with
`netlify functions:invoke nudge`, or use `npm run nudge -- --dry-run`, which
runs the same code path.

**From the console.** `/admin` has a *Who to chase* section listing everyone by
how many picks they still owe — the pools below it show the same shortfall per
*pool*, which is the wrong axis for chasing anybody, since one slow person
appears under every other participant. It has a **Post a nudge to Discord**
button (which ignores the quiet period, because somebody asked explicitly) and
a mailto fallback addressed to just those people, Bcc'd.

**Real @-pings** would need a Discord user id per participant, which the
sign-up form does not collect. `nudgeMessage` takes a `mention` resolver for
exactly that — swapping in one that returns `<@123…>` is the whole change on
this side.

### 9. Erasing Personal Data

The sign-up form collects real names and email addresses, and by the time an
event has run they are in **five** places — three of which nothing else in this
project ever touches again:

| Where | What is in it |
| --- | --- |
| Netlify Forms | The original submission. Outlives everything here: deleting our copy does nothing to Netlify's. |
| `signups` (Postgres) | The mirrored row. |
| `event.json` (Blobs) | The drawn participant record, with the private token. |
| **`event.backup-*.json` (Blobs)** | A complete copy of all of the above, **one per edit**. `writeEvent` snapshots before every write and never cleans up. |
| `deck_builds.notes` (Postgres) | Free text a builder wrote about a named person. |
| `nudge.json` (Blobs) | The last Discord nudge's fingerprint, which lists participants by name. |

`card_selections` and `secret_card_sets` are the exception — random ids and card
names, which identify nobody once the event record they map back to is gone.

`npm run forget` is the one command that knows that list. It **prints a plan and
changes nothing** unless you pass `--yes`; none of this is reversible and some of
it is the only remaining copy.

```bash
NETLIFY_SITE_ID=<site-id> NETLIFY_AUTH_TOKEN=<token> NETLIFY_DB_URL=<url> \
  npm run forget -- "Ada Lovelace"
```

Three modes:

- **Before the draw** — `npm run forget -- "<name>" --yes` deletes their sign-up
  row and their form submission. They are simply never included.
- **After the draw** — a plain delete is *refused*, and says who it would strand.
  The ring is a single cycle, so dropping one person leaves their giver with
  nobody to build for while their cards sit in everyone else's pools. Use
  `--redact --yes` instead: it blanks the email, theme veto and theme wish, and
  deletes the sign-up row, the form submission and their private notes, while
  keeping the name, token, assignment and pool cards that other people's pages
  are built from. The console then shows *"address erased at their request"* in
  place of the mailto link. If the name has to go too, the only honest answer is
  a full wipe once the exchange has finished.
- **After the event** — `npm run forget -- --everyone --yes` empties every table
  and deletes `event.json`, `nudge.json` **and every backup snapshot**. Every private link
  stops working. Tables are emptied rather than deleted by id, so a withdrawn
  sign-up or a row left by a redraw goes too.

Two things worth knowing:

- **The spam list counts.** Akismet holds real sign-ups back often enough that
  this project has a whole reconciliation step for it, and a held-back
  submission has the same name and email as a verified one. `forget` reads both
  lists.
- **Without `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN` it warns loudly and
  skips Forms**, telling you to delete the submission by hand. That is the copy
  that outlives all the others, so erasing everything else and calling it done
  would be erasing nothing.

`event.json` is deleted **last**, after every other step. It is the only thing
mapping a random participant id back to a person, so if a later step failed with
it already gone, the rows it was meant to reach could no longer be identified.
Losing the map last means a partial failure is always fixed by running the
command again — there is a test that reorders it and fails.

## Development & Architecture notes

- **Both stages of the private link are previewable** — `/demo/s/<token>?phase=workshop` and `/demo/s/<token>`, linked from each other and from `/demo`.
  - The link means two different things at two different times: first the **workshop**, where each person picks one commander for every other participant, and then — once everybody has finished — their **assignment**. Only the second was ever visible in the demo, which made the workshop look like it did not exist.
  - `DemoCardWorkshop.tsx` runs the **same `CardSelectionStudio`** against browser state, starting from a half-finished set of picks so both the done and the outstanding targets are on screen. `CardSelectionStudio` takes optional `onSave`/`onRemove` that override the server actions; only the demo passes them, and a test asserts the demo never calls the real ones.
  - Saving is re-implemented rather than stubbed, because the rules are the part worth showing: the recipient's vetoed colour, legal partners, and both checked against the *pair* rather than either half. Those checks come from `pairing.ts`, so the demo runs the same ones the server action does — there is a test that picks a vetoed card and expects the refusal.

- **The one-time trade, playable on `/demo` (`DemoCardTrade.tsx`):**
  - The real cash-in writes to Postgres and cannot be undone — which is the point of it, and also why nobody wants to learn what it does by spending theirs. The demo runs the **same `SecretCardChoices` component** against browser state, so the trade can be tried, seen and reset.
  - `visibleShortlist` in `card-pool.ts` is the rule for which of the four are shown; the real page and the demo both call it, so which card appears and where it lands (appended last, not slotted into the gap) is shared rather than re-implemented.
  - `SecretCardChoices` takes an optional `onCashIn` that overrides the server action. Only the demo passes it; a test asserts the demo never calls `cashInCardAction`, since the cash-in is the one control on that page that writes.
  - **The demo is handed all four cards**, so the hidden one sits in the page payload and could be read out of it. The real page never sends it — `getOrCreateSecretCards` returns only the visible three and the fourth stays in the database until the trade is spent. Don't take the demo's shape as a pattern for the real one.

- **Card hover preview (`CardImage.tsx`):**
  - Hovering any card image shows it enlarged next to the cursor — 340px wide, about 6× a 56px thumbnail — because card art at thumbnail size is unreadable and the reason to look at a commander is its rules text. Every card image on the site goes through this one component.
  - **Rendered through a portal to `document.body`.** Several of the places a card appears sit inside `overflow-hidden` containers, which would clip a preview positioned in the normal flow.
  - Position is written straight to the node on `mousemove` rather than held in React state: re-rendering the tree at pointer rate is what makes hover previews feel sticky. It flips to the left of the cursor near the right edge and clamps vertically, so it is never partly off-screen.
  - **Suppressed where hovering is not a real thing** (`(hover: hover) and (pointer: fine)`). On a touch screen the first tap would fire the hover handlers and leave a card floating with nothing to dismiss it.
  - Also opens on focus, anchored to the element rather than the cursor — these images sit inside buttons on the browser grid, so they are reachable by tab. `pointer-events: none` keeps the preview from ever swallowing a click.
  - Note for tests: jsdom implements no `window.matchMedia`, so `vitest.setup.ts` stubs it (reporting hover-capable, the case worth exercising by default). React synthesises `onMouseEnter` from `mouseover`, so a test dispatching a raw `mouseenter` event will silently do nothing.

- **Partner pairs (`src/lib/pairing.ts`):**
  - A selection is a **pick**: one commander, optionally with a partner. A pair is *one* choice — it fills one of a person's two pool slots and one place on a shortlist, because it is one deck's worth of commander.
  - Legality is derived from the card, with no hand-maintained pairing table. The pool contains exactly three pairing groups — 30 plain **Partner**, 20 **"Choose a Background"**, 15 **Backgrounds** — and `pairingRoleOf` reads them from the type line, rules text and keywords. Partner goes with Partner; a Background chooser goes with a Background; nothing else pairs.
  - **It fails closed.** `"Partner with <name>"` is explicitly rejected rather than treated as generic Partner — that variant pairs with exactly one card, so treating it as generic would offer 29 illegal partners. None appear at uncommon today, but a set could add one. `fetchCommanderPool` cross-checks Scryfall's `otag:pair-commander` against the derived role and warns by name about anything it cannot classify; those cards are simply never offered a partner.
  - **A Background is not a commander.** All 15 used to be selectable alone, so a sign-up could name one as a standalone commander and the draw would accept it. `canBePrimary` now keeps them out of every primary list (695 offered, not 710) and they appear only as the partner half.
  - Identity is by `pickId`, the two ids sorted and joined, so "A + B" and "B + A" are one option — two people who independently choose the same pair cannot fill two of a shortlist's four slots with the same deck.
  - **Colour vetoes apply to the combined identity.** A partner can carry a colour the commander does not; `pickColorIdentity` is what the veto is checked against, in the sign-up resolver, the save action and the organiser's `--color` guard alike.
  - The rules are structural over `PairableCard`, so the same code runs against a full `Commander` on the server and the trimmed `CommanderOption` in the browser — one implementation that cannot disagree with itself.
  - **A pair is drawn inside one card's footprint** (`PickCards.tsx`): the two cards overlap at the corners, each at 86% width, inset into a box the size of a single card. Side by side at half width they read as two separate things and shrink the art to nothing; stacked, a pair takes the same room as every other option in the row — which is what it is, one choice. The partner sits *behind and offset upward* so its title bar stays visible above the commander, letting both be named at a glance; tucking it under the bottom corner instead showed only art and an edge. Either half can still be hovered for the enlarged view.
  - `PartnerPicker.tsx` is shared by the sign-up form and the card workshop: it appears only after a commander that can actually take a partner, lists only legal partners with the vetoed colour and banned combinations already removed, and always offers "save on its own". Everything it enforces is re-checked server-side in `saveCardAction` and `resolveSelfCards`, because a Server Action is a callable endpoint whatever the page showed.
  - The jsonb columns needed **no migration**: `card_selections.card`, `signups.self_cards` and `secret_card_sets.cards` hold a richer shape, and jsonb is jsonb.

- **Sign-up commander picker (`CommanderCombobox.tsx`):**
  - Backed by `/api/commanders/names`, which returns the whole legal pool
    trimmed to `id`, `name`, `colorIdentity` and `imageUrl` — 710 cards, ~144 KB
    raw and about 36 KB compressed. The full pool is 480 KB, nearly all of it
    oracle text a dropdown never shows; keeping `imageUrl` costs only ~8 KB
    compressed (the URLs share long prefixes) and buys an instant thumbnail for
    whatever gets picked, with no second request.
  - That endpoint takes **no colour-veto parameter and applies none**, unlike
    `/api/commanders/sample`. The only veto in play here is the person's own,
    chosen on the same form, so it is not a secret being kept from them — which
    lets the client re-filter instantly when they change it, and lets one
    response be cached for everybody. The ban list *is* applied server-side.
  - Follows the ARIA combobox pattern rather than a `<datalist>`, whose
    filtering, styling and mobile presentation are all browser-defined and
    which offers no way to report "42 more matches". Renders at most 50 options
    and states how many are hidden, so "my card isn't legal" stays
    distinguishable from "I need to type more".
  - Note for tests: the colour `<select>` is *also* exposed as a `combobox`
    with its own `option` children, so option lookups must be scoped to the
    listbox (`getByRole("listbox").getByRole("option")`). Playwright's `fill()`
    does not open the list either — use `pressSequentially`.

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
- **Saving on `/s/[token]` (`DecklistLink.tsx`, `SecretScratchpad.tsx`):**
  - Both boxes save **when focus leaves them**, and neither requires a press. The notes box also autosaves a second after typing stops; the decklist box keeps its Save button as the visible affordance. They used to disagree — the decklist saved *only* on the button, so pasting a link and navigating away lost it silently, the one field on the page with no protection.
  - The decklist only saves what validates. Tabbing out of a half-typed URL is ordinary, and firing a doomed request on every such blur would turn a normal pause into an error banner, so `normalizeDecklistUrl` runs on the client first — which is why it lives in `deck-build-rules.ts` with no database import.
  - Emptying the decklist box does **not** clear the saved link; the box says so and points at Remove. Blanking a stored value by tabbing past it is too easy to do by accident.
  - Both share `useLocalDraft`: every keystroke is mirrored to `localStorage` and the draft is cleared only once the server acknowledges the save. Anything a closed tab or a failed request left behind is offered back on the next visit, restored with a notice — and re-saved automatically, except a decklist draft that does not validate, which is restored but left for the participant to finish.

- **Private Notes Scratchpad (`SecretScratchpad.tsx`):**
  - Present on `/s/[token]`, providing participants a place to draft deck ideas, card links, or wishlist thoughts.
  - **Stored in Postgres** (`deck_builds.notes`, keyed by giver), not in the browser. Debounced autosave a second after typing stops, and immediately on blur.
  - `localStorage` is still used, for a different job — see `useLocalDraft` above, and React 19's `useSyncExternalStore` inside it.
  - **These notes are no longer browser-only, and the copy no longer says they are.** They were local, and the UI promised it. Moving them to the database is what makes them survive a cleared browser or a swapped phone — which is why they moved — but notes about a named person now leave the device, so the wording says where they are kept instead. A test asserts the old "never sent to a server" claim has not crept back in.
  - The `/demo` scratchpad is read-only, because the demo routes never reach a database. The no-database branch of `/s/[token]` (`CARD_SELECTIONS_DISABLED=1`) does not render notes at all.
- **Reveal Day Confetti & Discord Export (`RevealRing.tsx`, `Confetti.tsx`):**
  - Once all participants are stepped through on `/reveal` and the loop closes, a festive CSS-only particle celebration (`<Confetti />`) triggers, respecting `@media (prefers-reduced-motion: reduce)` settings.
  - A "Copy Discord Summary" button formats the complete gift exchange ring into spoiler markdown (`||Giver ➜ Recipient||`) with copy feedback for instant channel announcements.
- **Scryfall Queries & Caching:**
  - Upstream queries:
    - Pool: `f:edh is:commander r:u game:paper` (710 cards as of August 2026; it grows with each set). `game:paper` is load-bearing: without it, digital-only MTGO uncommon reprints would wrongly enter the pool.
    - Partner-capable: `f:edh is:commander r:u game:paper otag:pair-commander` (~65 cards). Catches Partner, Partner with, "Choose a Background", and Backgrounds.
  - Cached for 24 hours (`revalidate: 86400`) via Next.js fetch cache. Scryfall sees ~6 requests per day total across all users.
  - Every request sends Scryfall's required headers: `User-Agent: FormerFabSecretSanta/1.0` and `Accept: application/json`.
  - Transform-layout cards (e.g. Exdeath, Garland, The Emperor of Palamecia, Ultimecia) fall back to `card_faces[0]` for image and oracle data.
- **Reveal Ring Algorithm:**
  - `buildRing` (`src/lib/ring.ts`) verifies that the derangement forms a single complete cycle across all participants before constructing the stepped reveal sequence. If non-cycle or disconnected components are found, it fails loudly.
- **What is and is not covered by the checks:**
  - The Postgres paths **are** covered, by `*.integration.test.ts` files that
    run against [PGlite](https://pglite.dev) — Postgres compiled to
    WebAssembly, in-process, no container and no connection string. The
    harness in `src/test-support/database.ts` applies the **real committed
    migrations**, so a migration that does not apply cleanly fails in `npm test`
    rather than on deploy. Tests mock `#db/index` onto it, so the code under
    test is the real code: no injected client, no test-only branch in
    production.
  - What that does *not* prove: that the Netlify driver connects, that
    `NETLIFY_DB_URL` is right, or that migrations run in the deploy pipeline.
    Those still need a Deploy Preview.
  - The `formSubmitted` handler is still uncovered: platform-event functions
    are invoked by Netlify and cannot be triggered by `netlify dev`. Submit the
    form on a Deploy Preview and check the function log — and note that the
    draw now cross-checks Netlify Forms against the database precisely because
    a failure there is otherwise silent (see *Draw and Mint Links*).
  - **Scheduled functions have the same problem**, and the same answer: there is
    no local cron, so `netlify/functions/nudge.mts` is a call to `runNudge` and
    nothing else. `runNudge` is unit-tested, and `npm run nudge -- --dry-run`
    runs the identical path from a terminal. Everything worth getting wrong —
    what the message says, when to stay quiet, what must never appear in it —
    is in `src/lib/nudge.ts`, which is pure.
  - **Erasure is covered end to end but not against Netlify.** `forget.ts` is
    pure and unit-tested, the database deletions run against PGlite, and
    `scripts/forget.test.ts` drives the whole CLI with a stubbed Forms API —
    including a test that reorders the steps and fails, since deleting
    `event.json` before the rows it identifies is unrecoverable. What is not
    proven is that the real Forms DELETE endpoint behaves as documented.

- **Chasing and erasing are both pure cores with thin shells** (`nudge.ts` /
  `nudge-run.ts`, `forget.ts` / `scripts/forget.ts`):
  - Same shape as `src/lib/admin.ts`, and for the same reason: the three
    callers of a nudge are a cron, a Server Action and a CLI, and the cron is
    the one that cannot be run locally. Putting the decisions in a pure module
    means the untestable caller is a single function call.
  - `nudgeStatus` takes an event and the selection rows. **Assignments and
    reveal tokens are not parameters**, which is the structural version of "a
    public Discord channel must never see them" — there are tests asserting
    neither reaches a message, but the type signature is what makes them true.
  - `forget.ts` only *plans*. What counts as personal data, and what each mode
    touches, is decided by code that needs no database, no Netlify account and
    no nerve to run once and find out; the script executes a plan it is handed.

- **Path Imports:**
  - `package.json`'s `"imports"` map (`#lib/*` → `src/lib/*.ts`, `#scripts/*` → `scripts/*.ts`) exists because Node's built-in TypeScript stripping (`node --experimental-strip-types`, used to run the scripts) won't resolve extensionless relative imports, while `tsc` rejects imports with an explicit `.ts` suffix.
  - **Client components and the database:** anything a `"use client"` component imports is bundled for the browser, so importing a module that reaches `db/` drags `drizzle-orm` and `pg` in and the build fails with `Can't resolve 'dns'` — an error that names `node_modules`, not the import that caused it. This is why the pure halves are split out: `card-pool.ts` from `card-selections.ts`, and `deck-build-rules.ts` from `deck-builds.ts`. `src/components/client-bundle.test.ts` walks each client component's import graph and fails with the offending chain, stopping at `"use server"` modules — a Server Action is a boundary rather than a leak, and is exactly how a client component is meant to reach the database.
  - `src/lib/module-resolution.test.ts` enforces this: it parses each import statement in `src/lib` and fails naming any relative value import. It exists because the rule was broken twice by ordinary-looking edits, and both times the breakage was invisible until an operator ran a script — Next and Vitest resolve `./pairing` perfectly well, so lint, typecheck, unit tests, E2E and the build all pass while `npm run update-participant` is dead.
  - **This applies transitively, and inside `src/lib` too.** A script importing `#lib/signup` also has to resolve everything `signup.ts` itself imports, so cross-module *value* imports within `src/lib` use `#lib/...` rather than `./...`. A plain `./rules` there is invisible to the app — Next and Vitest both resolve it — and breaks every operator script the moment one of them reaches that module. Type-only imports are erased before Node sees them and are exempt.
- **E2E Test Fixtures:**
  - `playwright.config.ts` sets `EVENT_DATA_PATH=tests/e2e/fixture-event.json` for its `webServer`, running tests against fake, committed test data (Ada, Bob, Cleo) without requiring Netlify credentials.
  - **The suite runs serially (`workers: 1`), deliberately.** With four workers on a cold cache, parallel first-hits to each route contend on on-demand compilation and the initial Scryfall pool fetch, and 3–4 tests time out. CI always starts cold, where `retries: 2` was quietly masking it. Serial costs about seven seconds on a ~23s suite and makes cold runs deterministic.

## Deploying

`netlify.toml` pins the build command (`npm run build`), publish directory (`.next`), and Node version (22). Netlify installs its Next.js runtime automatically — no adapter package needed. Assignment data remains in the Netlify Blobs `secret-santa` store. Card submissions and immutable shortlists use Netlify Database through Drizzle; migrations in `netlify/database/migrations/` are applied automatically during deploy.

**Runtime environment variables** (set in the Netlify UI, not `netlify.toml` — variables declared there are not visible to functions, and values are frozen per deploy, so redeploy after changing one):

| Variable | Scope | Needed for |
| --- | --- | --- |
| `NETLIFY_DB_URL` | Functions, Runtime | The `signups`, `card_selections`, `secret_card_sets` and `deck_builds` tables |
| `DISCORD_WEBHOOK_URL` | Functions | The scheduled nudge and the console's "Post a nudge" button. Optional — without it the nudge reports that it has nowhere to post rather than failing |

Blobs credentials are injected automatically by the Netlify runtime and need no variable of their own. `NETLIFY_SITE_ID` / `NETLIFY_AUTH_TOKEN` are for **local operator scripts only** — never set them on the deployed site.

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

- **Atomic Writes & Backups:** `writeEvent` snapshots the current state to a timestamped backup before writing changes (via atomic temp-file rename on local disk or timestamped key in Blobs). There is no rotation and no cleanup — which is deliberate as a safety net, and is exactly why `deleteEventData` exists: every snapshot is a complete copy of the roster, so erasing `event.json` alone would erase nothing. See *Erasing Personal Data*.
- **Other keys in the same store:** `nudge.json` holds the last Discord nudge's fingerprint. It is written only after a successful post, and it is deleted by the full wipe along with everything else, because its digest lists participants by name.
