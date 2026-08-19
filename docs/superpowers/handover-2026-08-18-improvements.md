# Handover — Post-Improvements State

**Written:** 2026-08-18
**For:** the next agent continuing this build
**Repo:** `/Users/andrewali/Projects/former-fab-players-winter-secret-santa-2026`
**Branch:** `commander-browser` — **fully pushed and already merged into `main`** via PR #2 (`7d03beb`). The only new work is **17 uncommitted files** in the working tree.
**Supersedes:** [handover-2026-08-16-commander-browser.md](handover-2026-08-16-commander-browser.md) (all 19 of its tasks are now done)

---

## 1. Read these first

| Document | Why |
| --- | --- |
| `README.md` | Operator runbook, deploy notes, and every non-obvious gotcha. Kept current. |
| [Site spec](specs/2026-08-16-secret-santa-site-design.md) | Original product design |
| [Round-2 spec](specs/2026-08-16-commander-browser-and-reveal-day-design.md) | Browser + reveal day design |
| [Enhancements spec](specs/2026-08-16-commander-browser-enhancements-design.md) | Prompts, scratchpad, confetti |
| [Round-2 plan](plans/2026-08-16-commander-browser-and-reveal-day.md) | 19 tasks, **all complete** |
| [Enhancements plan](plans/2026-08-16-commander-browser-enhancements.md) | **All complete** |

Both plans are finished. There is no task list left to execute — the work from
here is operational (see §6) or new scope (see §7).

---

## 2. What this project is

A Next.js 16 (App Router) site for a Magic: The Gathering "Secret Santa" deck
exchange among friends, deployed on Netlify. It does two things:

1. **Suggests legal commanders** — legendary cards printed *in paper at uncommon*
   (deck cards may be any rarity), minus a ban list, in a filterable grid.
2. **Serves secret reveal pages** at `/s/<token>` — who you drew, their colour
   veto, theme veto and free-text wish.

The organiser collects preferences via Google Forms, exports CSV, and runs
`npm run draw` locally. **The deployed site has no write path** — every mutation
is a local script writing to Netlify Blobs.

House rules: commanders must be legendaries (**not** "legendary creatures" — 18
non-creature legendaries are in the pool) printed in paper at uncommon; $75
budget on the honour system, deliberately **not** tracked by the site; partnered
commanders must both be uncommon; seven banned commanders, one of which
(Malcolm + Kediss) is banned only *as a pair*. This is **not** Pauper EDH — only
the commander is rarity-restricted.

---

## 3. Git state — read before you touch anything

```
commander-browser   5a57fec  == origin/commander-browser   (pushed, merged via PR #2)
origin/main         7d03beb  = the merge commit, 1 ahead of this branch
main (local)        13a3d8d  59 behind origin/main — STALE, do not build on it
fix/netlify-nextjs-runtime, foundation — old, already merged
```

Everything committed on `commander-browser` is **already on `origin/main`**.
Before starting anything new:

```bash
git fetch origin && git checkout main && git pull
```

The 17 uncommitted files are currently sitting on `commander-browser`. If they
are to be committed, decide with the user whether they go on a fresh branch off
the updated `main` or as a follow-up commit here.

---

## 4. FIRST ACTION: the working tree is dirty

17 files are modified and **uncommitted**. They are complete and verified — they
were finished but not committed, because this project's standing rule is that
nothing is committed without the user asking.

**Ask the user before committing.** Do not commit on your own initiative.

Verified state of these changes, run cold on 2026-08-18:

```
npm run lint        ✅ clean
npm run typecheck   ✅ clean
npm test            ✅ 195 passed (32 files)
npm run test:e2e    ✅ 15 passed in ~21s
npm run build       ✅ compiles
```

### What the 17 files contain

Six improvements the user approved with "I would like all of these changes please":

1. **The theme-search bug fix (the headline).** `ThemePrompt`'s "Search this
   theme" button used to write its keyword into the **name** search box. Prompt
   keywords are mechanics, so **16 of the 22 prompts matched zero commander
   names** and silently returned an empty grid. `commanders.ts` now has a
   separate `theme` filter matched against **rules text**, threaded through
   `/api/commanders/sample?theme=`. Proven against the live endpoint: `token`,
   `sacrifice`, `graveyard`, `artifact`, `attack` each went from **0** results
   via `q=` to **9** via `theme=`.
   *Kept deliberately separate from `query`* — folding it in would make a name
   search for "sel" also match every card whose rules text says "select".
2. **Active-theme chip.** The applied theme renders as a visible chip with a
   **Clear theme** button, so it is reversible rather than a mysterious filter.
3. **Foil prices are labelled.** `normalize.ts` sets `priceIsFoil` when it falls
   back to `usd_foil`; `CommanderDetail` renders `~$0.99 (foil)`. A foil is often
   several times the non-foil, so an unlabelled fallback misrepresents a card
   against the $75 budget.
4. **`ThemePrompt`'s prop type narrowed** from `ThemePromptItem | string` to
   `ThemePromptItem`.
5. **`playwright.config.ts` pinned to `workers: 1`.** With 4 workers on a cold
   cache, parallel first-hits contend on on-demand compilation and the initial
   Scryfall fetch, and 3–4 tests time out. CI always starts cold, where
   `retries: 2` was quietly masking it. Serial costs ~7s on a ~23s suite.
6. **E2E assertions hardened** — a conditional `if (isVisible())` that could pass
   vacuously became an unconditional `expect(...).toBeVisible()`, and both
   `waitForTimeout(1000)` calls became real conditions.

`README.md` is updated for all of the above.

---

## 5. Answered last session: the stale Netlify publish dir

The user asked whether the dashboard's stale publish-dir setting was safe to fix.
The answer, for the record:

| | Value |
| --- | --- |
| Dashboard publish dir | `public` (leftover from the Express MCP template) |
| Dashboard build command | *None* |
| `netlify.toml` publish | `.next` |
| `public/` in the repo | **does not exist** (0 tracked files) |
| Current deploy | healthy, with `___netlify-server-handler` |

**Nothing is broken.** `netlify.toml` takes precedence over dashboard settings,
so the setting is inert. The problems are that the dashboard *lies* to anyone
debugging, and that it is a landmine: if the toml ever stops applying (renamed,
or a base directory set so Netlify looks elsewhere), Netlify would publish a
directory that does not exist — build succeeds, every route 404s. That is the
exact failure this site already hit once.

Fixing it (set publish to `.next`, command to `npm run build`) is
**behaviour-neutral and safe**, and does not trigger a deploy. Caveat: because
the toml overrides it, a typo would be masked exactly as the wrong value is now —
re-read the field after saving.

**Not yet done.** It changes the user's Netlify site settings, so it needs their
explicit go-ahead. Offer; do not act unilaterally.

Site: `silly-nasturtium-902023` · `https://silly-nasturtium-902023.netlify.app`
· project id `5c96238f-cba7-4c8b-93b7-23812c606d49`

---

## 6. Operational items — the user's to do, not yours

These block the event, not the code:

- **Netlify Team protection is ON.** Participants **cannot open their reveal
  links** until it is disabled: Site configuration → Access & security →
  Visitor access. This is the single hard blocker for launch.
- **Google Form column names are unconfirmed.** `scripts/csv.ts` `COLUMN_MAP`
  expects exactly `Your name`, `Colour to avoid`, `Theme to avoid`,
  `Theme you'd like`. The form does not exist yet. When it does, either match
  these headers or update the map — the parser fails loudly on a mismatch, and
  strips a UTF-8 BOM so a mismatch never *looks* identical.
- **`EXCHANGE_AT` is still `null`** in `src/lib/event.ts`, so the second
  countdown phase is off. Candidates are 2026-12-05 / 12-12 / 12-19; the group
  has not chosen. Sign-ups close 2026-09-17; announcement was 2026-09-10.

---

## 7. Deferred scope

- **Anonymous questions** — approved in principle by the user, deferred to its
  own spec because it needs a **write path**, which the site currently does not
  have by design. Nothing has been written for it.

---

## 8. Standing constraints — do not violate these

- **Never commit or push unless the user explicitly asks.**
- **The GitHub repo is public.** Participant data must never be committed;
  `/data` and `event.backup-*.json` are gitignored. Keep it that way.
- **Reveal links are bearer secrets.** Anyone with the URL sees that
  participant's assignment. They must be sent privately, one per person.
- **Changing Netlify account or site settings needs the user's permission.**
- **No deck price tracking.** The user trusts people with the $75 budget. The
  per-card price in the detail panel is a convenience, not enforcement — do not
  build a deck-total feature.
- **Receipts of the plan:** if you do work a plan in `docs/superpowers/plans/`
  describes, update that plan in the same change.

---

## 9. Commands

```bash
cd ~/Projects/former-fab-players-winter-secret-santa-2026
npm run dev                  # Next dev server
npm run lint                 # eslint
npm run typecheck            # next typegen && tsc --noEmit
npm test                     # vitest run — 195 tests
npm run test:e2e             # playwright — 15 tests, serial, ~21s
npm run build                # production build
npm run seed:demo            # populate the /demo routes
npm run draw                 # run the assignment draw from a CSV export
npm run reveal               # unlock the public reveal ring
```

E2E runs against committed fake data (`tests/e2e/fixture-event.json`, via
`EVENT_DATA_PATH`) so it needs no Netlify credentials. Locally, scripts without
Netlify env vars operate on `data/event.local.json`.

**Gotcha:** Netlify Blobs' `getStore("name")` ignores `NETLIFY_SITE_ID` /
`NETLIFY_AUTH_TOKEN`; the store is constructed with an explicit
`{ name, siteID, token }` and throws loudly on partial credentials. Do not
"simplify" it back.
