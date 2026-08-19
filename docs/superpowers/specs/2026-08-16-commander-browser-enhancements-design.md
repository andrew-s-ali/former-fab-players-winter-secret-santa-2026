# Commander Browser Enhancements & Reveal Day Polish Design

**Date:** 2026-08-16
**Goal:** Deliver 4 quality-of-life enhancements for deckbuilders, participants, and organisers:
1. **External Deckbuilding Links & Price Tag** in the Commander Detail panel (Scryfall, EDHREC, Moxfield, Scryfall USD market price).
2. **Interactive Theme Prompts** that prefill and filter the Commander Browser grid upon click.
3. **Private Notes Scratchpad** on the secret reveal pages (`/s/[token]` and `/demo/s/[token]`) backed by browser `localStorage`.
4. **Reveal Day Celebration & Discord Summary Export** on `/reveal` and `/demo/reveal` with festive CSS confetti burst and 1-click spoiler markdown copying.

---

## 1. Deckbuilding Links & Market Price in Commander Detail

### Requirements
- **Price Data**: Extract `prices.usd` (fallback to `prices.usd_foil`) from Scryfall card payloads into the `Commander` interface as `priceUsd: string | null`.
- **Detail Panel**:
  - Beside the uncommon set printing badge, render a price tag: `~$<price>` (e.g. `~$0.45`), or omit if null.
  - Render external link buttons opening in new tabs (`target="_blank"`, `rel="noopener noreferrer"`):
    - **Scryfall**: links to `card.scryfallUri`.
    - **EDHREC**: `https://edhrec.com/commanders/${slug}` where `slug` is a cleaned lowercase hyphenated string of `card.name` (stripping punctuation, handling split/partner names).
    - **Moxfield**: `https://www.moxfield.com/decks/public/advanced?format=commander&commander=${encodeURIComponent(card.name)}`.
- **Accessibility**: Include `aria-label` specifying that links open externally in a new window.

---

## 2. Interactive Theme Prompts

### Requirements
- **Structured Prompts**: Update `src/lib/prompts.ts` to export structured prompt items:
  ```ts
  export interface ThemePromptItem {
    text: string;
    keyword?: string;
  }
  ```
- **Click Interaction**:
  - `ThemePrompt` component renders a "Search this theme" / click action.
  - When rendered above a `CommanderBrowser` (on `/commanders`, `/s/[token]`, `/demo/s/[token]`), selecting a prompt invokes `onSelectPrompt`, setting the browser's search input to `prompt.keyword` and executing the filtered sample query.
- **Accessibility**: Standard button keyboard navigation (`Enter` / `Space`) and screen reader feedback on applied search filter.

---

## 3. Private Notes Scratchpad

### Requirements
- **Component**: Create `src/components/SecretScratchpad.tsx` (`"use client"`).
- **Storage**:
  - Uses `localStorage` keyed by `secret-santa-scratchpad-${token}`.
  - Protects against SSR hydration mismatch by loading stored text on mount.
  - Automatically persists user changes as they type.
- **Privacy Notice**: Display a clear helper note assuring the participant that their notes remain strictly in their local browser and are never transmitted to the server or other players.
- **Placement**: Placed on `/s/[token]` and `/demo/s/[token]` beside the recipient's wish & veto details.

---

## 4. Reveal Day Celebration & Discord Summary Export

### Requirements
- **Celebration Particle Burst**:
  - Create `src/components/Confetti.tsx`: A CSS-only particle celebration burst mounted when `RevealRing` reaches full cycle completion (`taken >= ring.steps.length`).
  - `aria-hidden="true"`, `pointer-events-none`.
  - `@media (prefers-reduced-motion: reduce)` disables animations.
- **Discord Summary Export**:
  - Render a "Copy Discord Summary" button when the ring loop closes.
  - Copies formatted spoiler markdown to clipboard via `navigator.clipboard.writeText`:
    ```markdown
    🎄 **Winter Secret Santa 2026 — Reveal Day Pairings** 🎁
    ||Alice ➜ Bob||
    ||Bob ➜ Cleo||
    ||Cleo ➜ Alice||
    ```
  - Displays a temporary "Copied to clipboard! ✓" feedback badge and `aria-live="polite"` status.

---

## 5. Security & Architectural Integrity
- **No Store Leaks**: Demo routes and `SecretScratchpad` maintain complete isolation from `src/lib/store.ts`.
- **Client/Server Boundaries**: `SecretScratchpad`, `ThemePrompt`, `CommanderBrowser`, and `RevealRing` maintain clean React client component contracts with zero effect-based state recursion (`set-state-in-effect` rule compliance).
- **Test Coverage**: All new functions, components, and interactions covered by Vitest and Playwright E2E suites.
