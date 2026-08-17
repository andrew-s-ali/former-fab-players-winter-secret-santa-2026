# Handover — Commander Browser and Reveal Day

**Written:** 2026-08-16
**For:** the next agent continuing this build
**Repo:** `/Users/andrewali/Projects/former-fab-players-winter-secret-santa-2026`
**Branch:** `commander-browser` (15 commits ahead of `origin/main`)

---

## 1. Read these first

| Document | Why |
| --- | --- |
| [Site spec](specs/2026-08-16-secret-santa-site-design.md) | The original product design |
| [Round-2 spec](specs/2026-08-16-commander-browser-and-reveal-day-design.md) | The design you are implementing |
| [Round-2 plan](plans/2026-08-16-commander-browser-and-reveal-day.md) | **The task list — full code in every step** |
| `README.md` | Operator runbook, deploy notes, development gotchas |

The plan is authoritative. It has 19 tasks; **T1–T8 are done**. Every task carries
complete code, exact commands, and expected output.

---

## 2. What this project is

A Next.js 16 (App Router) site for a Magic: The Gathering "Secret Santa" deck
exchange among friends, deployed on Netlify. It does two things:

1. **Suggests legal commanders** — legendary cards printed *in paper at uncommon*
   (deck cards may be any rarity), minus a ban list, browsable in a filterable grid.
2. **Serves secret reveal pages** at `/s/<token>` — who you drew, their colour
   veto, theme veto and free-text wish.

The organiser collects preferences via Google Forms, exports CSV, and runs
`npm run draw` locally. **The deployed site has no write path.**

House rules: commanders must be legendaries printed in paper at uncommon;
$75 budget (honour system, deliberately not enforced); partnered commanders must
both be uncommon; seven banned commanders, one of which (Malcolm + Kediss) is
banned only *as a pair*.

---

## 3. FIRST ACTION: commit the uncommitted Task 8

The working tree is **not clean**. Task 8 finished but its commit was
interrupted. The changes are complete and the full gate passes with them.

```
M  scripts/draw.ts            revealedAt: null on a fresh draw
M  src/lib/participants.ts    EventData.revealedAt + isRevealed()
M  src/lib/store.ts           EMPTY + withDefaults() so older data still reads
M  src/lib/store.test.ts      expectations updated for the new field
?? src/lib/participants.test.ts   3 new tests
```

Verify, then commit:

```bash
cd ~/Projects/former-fab-players-winter-secret-santa-2026
npm run lint && npm run typecheck && npm test    # expect 102 tests passing
git add scripts/draw.ts src/lib/participants.ts src/lib/participants.test.ts src/lib/store.ts src/lib/store.test.ts
git commit -m "feat: add revealedAt to the event data"
```

Then mark T8 done and start at **T9 (the ring builder)**.

---

## 4. State of play

### Done (T1–T8)

The **entire commander-browser half** plus the `revealedAt` data change:

- `Commander` carries `setName`, `rarity`, `canPair`.
- `fetchCommanderPool()` runs two cached Scryfall queries — the pool, and the
  `otag:pair-commander` subset — and flags `canPair`.
- `src/lib/commanders.ts`: colour-subset filtering, name search, `pairsOnly`,
  `sampleCommanders`. `pickCommander` is **deleted**.
- `GET /api/commanders/sample` replaces the deleted `/api/commanders/random`.
- `CommanderBrowser` (grid, colour pips, search, "Can pair" toggle, locked pip)
  and `CommanderDetail`. `CommanderSuggester` is **deleted**.
- Theme prompts: `src/lib/prompts.ts` + `ThemePrompt`.
- Rules copy corrected from "legendary creatures" to wording covering all
  legendaries (see §6).
- `EventData.revealedAt` + `isRevealed()` (uncommitted — see §3).

Current gate: **lint clean, typecheck clean, 102 unit tests, build compiles.**

### Remaining (T9–T18)

| Task | What |
| --- | --- |
| T9 | `src/lib/ring.ts` — assignments → ordered names + edges; **throws** if not a single cycle |
| T10 | `RevealRing` — pre-allocated positions, one name+arrow per click |
| T11 | `/reveal` — public, 404 while locked, names and arrows only |
| T12 | `scripts/reveal.ts` — flip `revealedAt`, `--undo` to relock |
| T13 | Two-phase countdown (sign-ups close 17 Sep 2026; exchange TBC) |
| T14 | Winter palette + CSS-only snow, reduced-motion safe |
| T15 | `scripts/seed-demo.ts` + `src/lib/demo.ts` (isolated from the real store) |
| T16 | `/demo`, `/demo/s/[token]`, `/demo/reveal` with a DEMO badge |
| T17 | E2E: rebuild the fixture as a valid ring, add browser/reveal/demo specs |
| T18 | README and plan reconciliation |

**The E2E suite is currently expected to fail** — `tests/e2e/commanders.spec.ts`
still targets the deleted suggester's markup, and the fixture's deliberately
dangling participant is incompatible with a valid ring. T17 fixes both. Do not
"repair" E2E before T17; do not run it as a gate until then.

---

## 5. The workflow in use

Subagent-driven development (`superpowers:subagent-driven-development`), per task:

1. Dispatch a **fresh implementer** with the task's full text pasted in — never
   make it read the plan file.
2. **Spec-compliance review** by a second agent (does it match, nothing missing
   or extra).
3. **Code-quality review** by a third — only after spec passes.
4. Feed back only the findings you judge correct, with reasoning; reject the rest
   explicitly so the implementer does not silently apply them.
5. Mark the task done; move on without pausing for the human.

Reviews have repeatedly earned their cost here — they caught a Netlify credential
bug that would have crashed the real draw, three silent CSV-corruption paths, and
a request race. **Do not skip the quality stage.**

Give implementers the domain context, not just the code: *why* a rule exists is
what stops them "simplifying" it away.

---

## 6. Hard-won knowledge — read before writing code

### Scryfall

- **Both `User-Agent` and `Accept` headers are required.** Omitting `Accept`
  returns HTTP 400. Confirmed by an actual failure.
- **A no-match search returns HTTP 404**, not an empty list. `fetchAllPages` has
  `emptyOn404` for the pair query for exactly this reason; the main pool query
  deliberately still throws.
- Pool query: `f:edh is:commander r:u game:paper` → **704 cards**. `game:paper`
  is load-bearing: without it, 20 cards whose only uncommon printing is digital
  (MTGO reprints) leak in.
- `r:u` returns the **uncommon printing itself**, so `set_name` is already the
  printing that makes a card legal. No extra request needed.
- `otag:pair-commander` → **65** cards in the pool; the bare `Partner` keyword
  only 30. The tag is a strict superset (Backgrounds, "Partner with", "Choose a
  Background"). `canPair` uses the tag.
- Four pool cards are `transform` layout with **no top-level `image_uris`** —
  the image is on `card_faces[0]`. `normalizeCard` handles it; don't undo that.
- Colour-identity exclusion is `-id>=r`, **not** `-id:r` (which leaves red
  multicolour cards in).

### This repo's lint rules will bite you

- **`react-hooks/set-state-in-effect`** (React Compiler rules via
  `eslint-config-next`) rejects `setState` called synchronously inside a
  `useEffect`, **and** rejects `async`/`await` effects whose call graph reaches a
  `setState`. Two live workarounds:
  - `CommanderBrowser` uses a `.then()/.catch()/.finally()` chain, not
    `async`/`await`.
  - `ThemePrompt` takes `initialPrompt` **as a prop chosen on the server**, so
    there is no effect at all. `/commanders` is `force-dynamic` so it varies.
  Do not reach for a lazy `useState` initialiser to dodge this — that
  reintroduces a hydration mismatch, which is what the prop pattern avoids.
- `.netlify/**` is in ESLint's ignore list. Running `netlify build` locally
  creates thousands of lintable generated files; without the ignore, `npm run
  lint` reports ~1876 problems and buries real ones.

### Node subpath imports

`package.json` has `"imports": { "#lib/*": "./src/lib/*.ts", "#scripts/*":
"./scripts/*.ts" }`. Scripts run under `node --experimental-strip-types`, which
will not extension-guess relative imports, while `tsc` rejects `.ts` suffixes.
The map satisfies both. **Scripts must import via `#lib/...`.** Do not
"simplify" these to relative paths.

### The draw is always a single cycle

`drawAssignments` shuffles then points each person at the next, wrapping. So the
assignment graph is one closed loop: nobody draws themselves, no mutual pairs, no
sub-groups. This is deliberate and was confirmed with the organiser. It is why
`buildRing` (T9) **throws** on anything else — a partial ring on reveal day would
quietly misrepresent who gave to whom.

### Security posture

- A reveal token is the *only* access control: 16 crypto-random bytes, base64url.
- Unknown and malformed tokens must 404 **identically** — no probing.
- The colour veto is enforced **server-side** in `/api/commanders/sample`. The
  struck-through pip is a courtesy, not the boundary.
- Participant data must never reach a client component. `CommanderBrowser`
  receives only a single colour letter.
- The repo is **public**: `/data` is gitignored, and no participant data may ever
  be committed. Demo data (T15) is safe only because the people are invented.
- `CommanderDetail` is `role="region"`, deliberately **not** `role="dialog"` —
  there is no focus trap, and claiming modality would mislead screen readers.

### The rules copy was wrong, and is now right

It said "legendary **creatures**". The organiser's rule is *legendaries*, and the
pool contains 18 non-creature legendaries (Backgrounds; the Vehicle *Adrestia*).
Both `RulesSummary.tsx` and the `/commanders` intro now say "legendary cards that
can be a commander". Don't regress this.

---

## 7. Netlify facts

- **The Next.js runtime must be declared explicitly.** `netlify.toml` has
  `[[plugins]] package = "@netlify/plugin-nextjs"`. Auto-detection does *not*
  fire for this site (it was created from Netlify's Express MCP template), and
  without the plugin the cloud build published the raw `.next` directory as
  static files — every route 404'd while the build reported success.
- `src/lib/store.ts` picks its target from the environment: explicit
  `NETLIFY_SITE_ID` + `NETLIFY_AUTH_TOKEN` (local scripts) → Blobs with those
  credentials; `NETLIFY_BLOBS_CONTEXT` (deployed runtime) → Blobs automatically;
  neither → local JSON file. **Only one of the two credentials set throws** —
  silent fallback to a local file would look like success.
- `getStore(name)` with a bare string does **not** read `NETLIFY_SITE_ID`.
  Explicit credentials must be passed as `{ name, siteID, token }`.
- `writeEvent` snapshots the previous event to a timestamped backup key before
  overwriting.

### Two open items outside the code

1. **Team protection is ON.** The site returns 401 to anyone not signed in to the
   owner's Netlify team, so participants cannot open reveal links. It must be
   turned off (Site configuration → Access & security → Visitor access) before
   the event. This also means **automated HTTP checks against the live site
   cannot see past the gate.**
2. **The site's saved publish directory is still `public`**, left over from the
   template. `netlify.toml` overrides it so nothing is broken today, but it is a
   trap for anyone editing build settings in the dashboard.

---

## 8. Still-unknown inputs

- **Google Form column names.** `COLUMN_MAP` in `scripts/csv.ts` is a guess; the
  form does not exist yet. The script fails loudly and prints the real headers,
  so it is a one-line fix once the export exists.
- **The exchange date.** One of 5, 12 or 19 December 2026 — undecided. The site
  shows "5, 12 or 19 December — date TBC" and counts down to sign-ups closing
  (17 September 2026). Setting `EXCHANGE_AT` in `src/lib/event.ts` switches it to
  a real countdown. Do not invent a date.

---

## 9. Verification

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Expect: clean, clean, **102 tests** (before T9), compiles. `npm run test:e2e`
will fail until T17 — that is expected, see §4.

---

## 10. Process pitfalls hit during this session

- **Do not poll the filesystem to decide an agent has finished.** Doing so once
  started the next task while the previous agent was still writing, and two
  agents ended up in the same working directory. Nothing was lost, but only
  because the second agent noticed HEAD had moved and refused to rewrite a commit
  it did not own. Wait for the completion notification.
- **Do not amend commits once other work has landed on the branch.** Later fixes
  in this session were made as new commits on top, deliberately.
- If a wait loop requires a clean tree, remember *your own* uncommitted edits
  (e.g. plan-document updates) will block it.
- Implementers that escalate rather than guess have been right every time here —
  the `set-state-in-effect` block and the Blobs credential bug both surfaced that
  way. Reward it: answer the question, don't just tell them to proceed.
