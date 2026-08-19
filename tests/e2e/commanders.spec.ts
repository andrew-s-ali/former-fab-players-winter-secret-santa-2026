import { expect, test } from "@playwright/test";

// Hits the live Scryfall API, so allow more than the 30s default budget.
test.setTimeout(60_000);

test("the browser loads a grid of real commanders", async ({ page }) => {
  await page.goto("/commanders");

  const tiles = page.locator("ul li button");
  await expect(tiles.first()).toBeVisible({ timeout: 30_000 });
  expect(await tiles.count()).toBeGreaterThan(1);
});

test("choosing a card opens its detail panel with external deckbuilding links", async ({
  page,
}) => {
  await page.goto("/commanders");

  const first = page.locator("ul li button").first();
  await expect(first).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /roll nine more/i })).toBeEnabled();
  await first.click();

  // The panel is a labelled region, not a dialog: it has no focus trap or
  // modality, so claiming role="dialog" would mislead screen readers.
  await expect(page.getByRole("region")).toBeVisible();
  await expect(page.getByRole("button", { name: /close/i })).toBeVisible();

  // Detail panel contains working external deckbuilding and Scryfall links
  const edhrecLink = page.getByRole("link", { name: /view on edhrec/i });
  await expect(edhrecLink).toBeVisible();
  await expect(edhrecLink).toHaveAttribute("href", /https:\/\/edhrec\.com\/commanders\//);
  await expect(edhrecLink).toHaveAttribute("target", "_blank");

  const moxfieldLink = page.getByRole("link", { name: /search moxfield/i });
  await expect(moxfieldLink).toBeVisible();
  await expect(moxfieldLink).toHaveAttribute(
    "href",
    /https:\/\/www\.moxfield\.com\/decks\/public\/advanced/
  );
  await expect(moxfieldLink).toHaveAttribute("target", "_blank");

  const scryfallLink = page.getByRole("link", { name: /view on scryfall/i });
  await expect(scryfallLink).toBeVisible();
  await expect(scryfallLink).toHaveAttribute("href", /https:\/\/scryfall\.com/);
  await expect(scryfallLink).toHaveAttribute("target", "_blank");
});

test("searching a theme returns real commanders matching it", async ({ page }) => {
  await page.goto("/commanders");

  // Wait for the first sample so the click lands on a settled grid.
  await expect(page.locator("ul li button").first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /search this theme/i }).click();

  await expect(page.getByText(/rules text mentions/i)).toBeVisible();

  // The assertion that matters. Theme keywords are mechanics ("token",
  // "sacrifice"), which match almost no commander *names* — routing them to
  // the name box instead left the grid empty for 16 of the 22 prompts, and
  // the old test passed anyway because it only checked the box was non-empty.
  await expect(page.getByText(/no commanders match/i)).toHaveCount(0);
  await expect(page.locator("ul li button").first()).toBeVisible({ timeout: 30_000 });

  // The name box stays empty: the theme is a separate filter.
  await expect(page.getByPlaceholder("Search by name…")).toHaveValue("");
});

