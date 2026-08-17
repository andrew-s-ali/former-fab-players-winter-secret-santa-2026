import { expect, test } from "@playwright/test";

// Hits the live Scryfall API, so allow more than the 30s default budget.
test.setTimeout(60_000);

test("the browser loads a grid of real commanders", async ({ page }) => {
  await page.goto("/commanders");

  const tiles = page.locator("ul li button");
  await expect(tiles.first()).toBeVisible({ timeout: 30_000 });
  expect(await tiles.count()).toBeGreaterThan(1);
});

test("choosing a card opens its detail panel", async ({ page }) => {
  await page.goto("/commanders");

  const first = page.locator("ul li button").first();
  await expect(first).toBeVisible({ timeout: 30_000 });
  await first.click();

  // The panel is a labelled region, not a dialog: it has no focus trap or
  // modality, so claiming role="dialog" would mislead screen readers.
  await expect(page.getByText(/uncommon in /i)).toBeVisible();
});
