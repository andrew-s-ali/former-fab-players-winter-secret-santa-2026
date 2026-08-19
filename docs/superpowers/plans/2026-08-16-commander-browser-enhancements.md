# Commander Browser Enhancements & Reveal Day Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver 4 quality-of-life enhancements: deckbuilding links & USD price in `CommanderDetail`, interactive theme prompts in `CommanderBrowser`, private local notes scratchpad on secret reveal pages, and a festive confetti burst with Discord summary export on Reveal Day.

**Architecture:**
- Pure helpers for price extraction, slugification, and Discord spoiler formatting.
- `localStorage`-backed React client component for secret scratchpad with SSR safety.
- Event callbacks for theme prompt search prefilling.
- CSS-only particle celebration honoring `prefers-reduced-motion`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Vitest, Testing Library, Playwright.

## Global Constraints
- React 19 / `set-state-in-effect` compliance: No synchronous `setState` inside `useEffect`.
- Data Isolation: Scratchpad and demo routes must NEVER import `src/lib/store.ts` or read from Blobs.
- Accessibility: ARIA roles, external link labels, status regions for clipboard copy & prompt selection, reduced-motion overrides.
- Node Subpath imports: Scripts must import via `#lib/...`.

---

### Task 1: Deckbuilding External Links and Market Price

**Files:**
- Modify: `src/lib/scryfall/types.ts`
- Modify: `src/lib/scryfall/normalize.ts`
- Modify: `src/lib/scryfall/normalize.test.ts`
- Modify: `src/components/CommanderDetail.tsx`
- Modify: `src/components/CommanderDetail.test.tsx`

- [x] **Step 1: Write failing tests for price normalization and detail buttons**

In `src/lib/scryfall/normalize.test.ts`:
```ts
it("extracts USD market price when available", () => {
  const card = normalizeCard({
    ...normalCard,
    prices: { usd: "0.45", usd_foil: "0.99" },
  });
  expect(card.priceUsd).toBe("0.45");
});
```

In `src/components/CommanderDetail.test.tsx`:
```tsx
it("renders external EDHREC, Moxfield, and Scryfall links", () => {
  render(<CommanderDetail card={mockCommander} onClose={vi.fn()} />);
  expect(screen.getByRole("link", { name: /view on edhrec/i })).toHaveAttribute(
    "href",
    expect.stringContaining("edhrec.com/commanders/")
  );
  expect(screen.getByRole("link", { name: /search moxfield/i })).toHaveAttribute(
    "href",
    expect.stringContaining("moxfield.com/decks/public/advanced")
  );
});

it("renders the price tag if priceUsd is present", () => {
  render(
    <CommanderDetail
      card={{ ...mockCommander, priceUsd: "0.75" }}
      onClose={vi.fn()}
    />
  );
  expect(screen.getByText("~$0.75")).toBeInTheDocument();
});
```

- [x] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/lib/scryfall/normalize.test.ts src/components/CommanderDetail.test.tsx`
Expected: FAIL due to missing `priceUsd` and links.

- [x] **Step 3: Implement price normalization and detail panel links**

In `src/lib/scryfall/types.ts`, add `priceUsd: string | null;` to `Commander`.
In `src/lib/scryfall/normalize.ts`, populate `priceUsd: raw.prices?.usd ?? raw.prices?.usd_foil ?? null`.

In `src/components/CommanderDetail.tsx`:
Add helper to slugify card names for EDHREC:
```ts
export function edhrecSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ \/\/ /g, "-")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}
```
Render price tag beside the legal set name, and render the action buttons with `target="_blank"` and `rel="noopener noreferrer"`.

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/scryfall/normalize.test.ts src/components/CommanderDetail.test.tsx`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/lib/scryfall/types.ts src/lib/scryfall/normalize.ts src/lib/scryfall/normalize.test.ts src/components/CommanderDetail.tsx src/components/CommanderDetail.test.tsx
git commit -m "feat: add deckbuilding links and market price to commander detail"
```

---

### Task 2: Interactive Theme Prompts in CommanderBrowser

**Files:**
- Modify: `src/lib/prompts.ts`
- Modify: `src/lib/prompts.test.ts`
- Modify: `src/components/ThemePrompt.tsx`
- Modify: `src/components/ThemePrompt.test.tsx`
- Modify: `src/components/CommanderBrowser.tsx`
- Modify: `src/components/CommanderBrowser.test.tsx`
- Modify: `src/app/commanders/page.tsx`
- Modify: `src/app/s/[token]/page.tsx`
- Modify: `src/app/demo/s/[token]/page.tsx`

- [x] **Step 1: Write failing tests for structured prompts and browser interaction**

In `src/lib/prompts.test.ts`:
```ts
it("returns structured theme prompt objects with text and optional keyword", () => {
  const prompt = randomPrompt();
  expect(prompt).toHaveProperty("text");
  expect(typeof prompt.text).toBe("string");
});
```

In `src/components/ThemePrompt.test.tsx`:
```tsx
it("calls onSelectPrompt when 'Search this theme' is clicked", async () => {
  const onSelect = vi.fn();
  render(
    <ThemePrompt
      initialPrompt={{ text: "Artifact deck", keyword: "artifact" }}
      onSelectPrompt={onSelect}
    />
  );
  await userEvent.click(screen.getByRole("button", { name: /search this theme/i }));
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ keyword: "artifact" }));
});
```

In `src/components/CommanderBrowser.test.tsx`:
```tsx
it("sets search query and triggers fetch when a theme prompt is selected", async () => {
  // Test interaction between theme prompt and browser search state
});
```

- [x] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/lib/prompts.test.ts src/components/ThemePrompt.test.tsx`
Expected: FAIL

- [x] **Step 3: Implement structured prompts and callback wiring**

Update `src/lib/prompts.ts` to export `ThemePromptItem` and structured prompts with search keywords.
Update `src/components/ThemePrompt.tsx` to accept `onSelectPrompt?: (prompt: ThemePromptItem) => void`.
Update `src/components/CommanderBrowser.tsx` to provide a slot or callback so users clicking the prompt populate the search box and trigger sampling.

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/prompts.test.ts src/components/ThemePrompt.test.tsx src/components/CommanderBrowser.test.tsx`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/lib/prompts.ts src/lib/prompts.test.ts src/components/ThemePrompt.tsx src/components/ThemePrompt.test.tsx src/components/CommanderBrowser.tsx src/components/CommanderBrowser.test.tsx src/app/commanders/page.tsx src/app/s/[token]/page.tsx src/app/demo/s/[token]/page.tsx
git commit -m "feat: make theme prompts interactive with commander browser search"
```

---

### Task 3: Private Notes Scratchpad on Secret Reveal Pages

**Files:**
- Create: `src/components/SecretScratchpad.tsx`
- Create: `src/components/SecretScratchpad.test.tsx`
- Modify: `src/app/s/[token]/page.tsx`
- Modify: `src/app/demo/s/[token]/page.tsx`
- Modify: `src/app/s/[token]/page.test.tsx`
- Modify: `src/app/demo/s/[token]/page.test.tsx`

- [x] **Step 1: Write failing tests for SecretScratchpad**

In `src/components/SecretScratchpad.test.tsx`:
```tsx
it("reads saved notes from localStorage on mount and saves updates", async () => {
  localStorage.setItem("secret-santa-scratchpad-test-token", "My card ideas");
  render(<SecretScratchpad token="test-token" />);
  expect(screen.getByRole("textbox", { name: /private notes/i })).toHaveValue("My card ideas");

  await userEvent.type(screen.getByRole("textbox", { name: /private notes/i }), " - add sol ring");
  expect(localStorage.getItem("secret-santa-scratchpad-test-token")).toBe("My card ideas - add sol ring");
  expect(screen.getByText(/saved to this browser/i)).toBeInTheDocument();
});
```

- [x] **Step 2: Run test to verify failure**

Run: `npx vitest run src/components/SecretScratchpad.test.tsx`
Expected: FAIL (file missing)

- [x] **Step 3: Implement SecretScratchpad**

Create `src/components/SecretScratchpad.tsx`:
- Client component (`"use client"`).
- Safe `localStorage` hydration handling (load in effect/sync store).
- Textarea with placeholder and auto-save on change.
- Status indicator "Saved to this browser".
- Clear helper text explaining local-only storage guarantee.

Integrate `<SecretScratchpad token={token} />` on `/s/[token]` and `/demo/s/[token]`.

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/SecretScratchpad.test.tsx src/app/s/[token]/page.test.tsx src/app/demo/s/[token]/page.test.tsx`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/components/SecretScratchpad.tsx src/components/SecretScratchpad.test.tsx src/app/s/[token]/page.tsx src/app/demo/s/[token]/page.tsx src/app/s/[token]/page.test.tsx src/app/demo/s/[token]/page.test.tsx
git commit -m "feat: add private local notes scratchpad on secret reveal pages"
```

---

### Task 4: Reveal Day Confetti Celebration & Discord Summary Export

**Files:**
- Create: `src/components/Confetti.tsx`
- Create: `src/components/Confetti.test.tsx`
- Modify: `src/components/RevealRing.tsx`
- Modify: `src/components/RevealRing.test.tsx`
- Modify: `src/app/globals.css`

- [x] **Step 1: Write failing tests for confetti and Discord copy**

In `src/components/RevealRing.test.tsx`:
```tsx
it("renders Copy Discord Summary button and confetti when cycle completes", async () => {
  const writeTextMock = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

  render(<RevealRing ring={testRing} />);
  // Reveal all steps
  const nextBtn = screen.getByRole("button", { name: /reveal the next one/i });
  for (let i = 0; i < testRing.steps.length; i++) {
    await userEvent.click(nextBtn);
  }

  expect(screen.getByTestId("confetti-burst")).toBeInTheDocument();
  const copyBtn = screen.getByRole("button", { name: /copy discord summary/i });
  expect(copyBtn).toBeInTheDocument();

  await userEvent.click(copyBtn);
  expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining("||Alice ➜ Bob||"));
  expect(screen.getByText(/copied to clipboard/i)).toBeInTheDocument();
});
```

- [x] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/components/RevealRing.test.tsx`
Expected: FAIL

- [x] **Step 3: Implement Confetti and Discord Summary Export**

Create `src/components/Confetti.tsx` with lightweight CSS particles and `@media (prefers-reduced-motion: reduce)` override.
In `src/components/RevealRing.tsx`:
- When `taken >= ring.steps.length`, render `<Confetti />` and "Copy Discord Summary" button.
- Format pairs into spoiler markdown (`||Giver ➜ Recipient||`).
- Handle clipboard write and copied state timeout.

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/Confetti.test.tsx src/components/RevealRing.test.tsx`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/components/Confetti.tsx src/components/Confetti.test.tsx src/components/RevealRing.tsx src/components/RevealRing.test.tsx src/app/globals.css
git commit -m "feat: add reveal day confetti celebration and discord summary export"
```

---

### Task 5: End-to-End Test Suite Update & Documentation Reconciliation

**Files:**
- Modify: `tests/e2e/commanders.spec.ts`
- Modify: `tests/e2e/reveal.spec.ts`
- Modify: `tests/e2e/reveal-day.spec.ts`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-16-commander-browser-enhancements.md`

- [x] **Step 1: Add E2E tests for new features**

In `tests/e2e/commanders.spec.ts`:
- Test clicking EDHREC and Moxfield external buttons in detail modal.
- Test clicking theme prompt to prefill commander search.

In `tests/e2e/reveal.spec.ts`:
- Test typing in local scratchpad, reloading page, and asserting notes persist.

In `tests/e2e/reveal-day.spec.ts`:
- Test copying Discord summary on full ring reveal.

- [x] **Step 2: Run full verification suite**

Run: `npm run lint && npm run typecheck && npm test && npm run test:e2e`
Expected: All clean, 100% passing.

- [x] **Step 3: Update documentation and mark plan completed**

Update `README.md` with notes on the new external links, theme search interaction, local scratchpad privacy, and Discord summary format.

- [x] **Step 4: Commit**

```bash
git add tests/e2e/ README.md docs/superpowers/plans/2026-08-16-commander-browser-enhancements.md
git commit -m "docs & test: verify enhancements end-to-end and update runbooks"
```
