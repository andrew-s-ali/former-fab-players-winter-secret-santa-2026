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
  await first.click();

  // The panel is a labelled region, not a dialog: it has no focus trap or
  // modality, so claiming role="dialog" would mislead screen readers.
  await expect(page.getByText(/uncommon in /i)).toBeVisible();

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

test("clicking theme prompt prefills commander search", async ({ page }) => {
  await page.goto("/commanders");

  const searchThemeBtn = page.getByRole("button", { name: /search this theme/i });
  await expect(searchThemeBtn).toBeVisible();

  const searchInput = page.getByPlaceholder("Search by name…");
  await expect(searchInput).toHaveValue("");

  await searchThemeBtn.click();

  await expect(searchInput).not.toHaveValue("");
});

