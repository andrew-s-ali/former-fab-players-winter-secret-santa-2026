import { expect, test } from "@playwright/test";

// Hits the live Scryfall API, so allow more than the 30s default whole-test budget.
test.setTimeout(60_000);

test("suggester returns a real commander from Scryfall", async ({ page }) => {
  await page.goto("/commanders");
  await page.getByRole("button", { name: /random commander/i }).click();

  // The card name renders as a link to Scryfall.
  const card = page.locator("figcaption a").first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toHaveAttribute("href", /scryfall\.com/);
});
