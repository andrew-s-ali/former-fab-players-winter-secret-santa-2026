import { expect, test } from "@playwright/test";
import fs from "fs";
import path from "path";

const SCREENSHOT_DIR =
  process.env.SCREENSHOT_DIR ??
  path.join(process.cwd(), "test-results", "screenshots");

test.setTimeout(90_000);

test("browser visual walkthrough of all pages and features", async ({ page }) => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  // 1. Home Page
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /Winter Secret Santa 2026/ })).toBeVisible();
  await expect(page.getByText(/sign-ups/i)).toBeVisible();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01_home_page.png"), fullPage: true });

  // 2. Commander Browser Page
  await page.goto("/commanders");
  const firstTile = page.locator("ul li button").first();
  await expect(firstTile).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /roll nine more/i })).toBeEnabled();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02_commander_browser_grid.png"), fullPage: true });

  // 2b. Theme Prompt Interaction
  // Asserted unconditionally: wrapping this in `if (await themeBtn.isVisible())`
  // meant the walkthrough silently skipped the step — and still passed — if the
  // button ever disappeared.
  const themeBtn = page.getByRole("button", { name: /search this theme/i });
  await expect(themeBtn).toBeVisible();
  await themeBtn.click();
  await expect(page.getByText(/rules text mentions/i)).toBeVisible();
  await expect(page.locator("ul li button").first()).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02b_theme_prompt_applied.png"), fullPage: true });

  // 2c. Commander Detail Modal with External Deckbuilding Links
  await page.getByRole("button", { name: /clear theme/i }).click();
  await page.getByRole("button", { name: /roll nine more/i }).click();
  // Wait for the roll to settle rather than sleeping a fixed second: the
  // button re-enables only once the request has resolved.
  await expect(page.getByRole("button", { name: /roll nine more/i })).toBeEnabled();
  await expect(page.locator("ul li button").first()).toBeVisible({ timeout: 30_000 });
  await page.locator("ul li button").first().click();
  await expect(page.getByRole("region")).toBeVisible();
  await expect(page.getByRole("link", { name: /view on edhrec/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /search moxfield/i })).toBeVisible();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03_commander_detail_modal.png"), fullPage: true });

  // 3. Demo Index
  await page.goto("/demo");
  await expect(page.getByText(/demo — invented people/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Ada Lovelace" })).toBeVisible();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04_demo_index.png"), fullPage: true });

  // 4. Demo Secret Page (/demo/s/[token])
  const adaLink = page.getByRole("link", { name: "Ada Lovelace" });
  await Promise.all([
    page.waitForURL(/\/demo\/s\//),
    adaLink.click(),
  ]);
  await expect(page.getByRole("heading", { name: /Hi Ada Lovelace/ })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /private notes/i })).toBeVisible();

  // Test typing in Scratchpad
  const scratchpad = page.getByRole("textbox", { name: /private notes/i });
  await scratchpad.fill("Notes for Bob Ross:\n- Looking into Simic landfall commanders\n- Check Tatyova & Imoti");
  await expect(page.getByText(/saved to this browser/i)).toBeVisible();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05_demo_secret_page_scratchpad.png"), fullPage: true });

  // 5. Demo Reveal Day Page (/demo/reveal)
  await page.goto("/demo/reveal");
  await expect(page.getByRole("heading", { name: "Who had who" })).toBeVisible();
  await expect(page.getByRole("button", { name: /reveal the next one/i })).toBeVisible();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06_demo_reveal_initial_ring.png"), fullPage: true });

  // Step through the entire ring until completed
  const nextBtn = page.getByRole("button", { name: /reveal the next one/i });
  while (await nextBtn.isVisible()) {
    await nextBtn.click();
    await page.waitForTimeout(200);
  }

  // Expect confetti and Copy Discord Summary button
  await expect(page.getByTestId("confetti-burst")).toBeVisible();
  await expect(page.getByRole("button", { name: /copy discord summary/i })).toBeVisible();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "07_demo_reveal_completed_loop.png"), fullPage: true });
});
