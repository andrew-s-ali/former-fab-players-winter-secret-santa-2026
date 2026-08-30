import { expect, test } from "@playwright/test";

/**
 * Partner entry on the sign-up form, against the live Scryfall pool.
 *
 * Uses a real "Choose a Background" commander so the Background half is
 * exercised too — that is the pairing the site would most easily get wrong,
 * since a Background is not a legal commander on its own.
 */
test("a commander that can take a partner offers one, and a pair fills one slot", async ({
  page,
}) => {
  await page.goto("/signup");

  const combobox = page.getByRole("combobox", { name: /find your/i });
  await combobox.click();
  await combobox.pressSequentially("Abdel Adrian");
  await page.getByRole("listbox").getByRole("option").first().click();

  // The partner step appears instead of committing the choice straight away.
  await expect(page.getByText(/can take a Background/i)).toBeVisible();
  await expect(page.locator('input[name="selfCard1"]')).toHaveValue("");

  const partnerBox = page.getByRole("combobox", { name: /find a Background/i });
  await partnerBox.click();
  await partnerBox.pressSequentially("a");
  const partner = page.getByRole("listbox").getByRole("option").first();
  const partnerName = (await partner.textContent())!.trim();
  await partner.click();

  // One slot filled by the pair, and the second slot still wanted.
  await expect(page.locator('input[name="selfCard1"]')).toHaveValue(/Abdel Adrian/);
  await expect(page.locator('input[name="selfCard1Partner"]')).toHaveValue(partnerName);
  await expect(page.locator('input[name="selfCard2"]')).toHaveValue("");
  await expect(page.getByText(/1 of 2 chosen/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign me up" })).toBeDisabled();
});

test("a commander that cannot pair is saved without asking about a partner", async ({
  page,
}) => {
  await page.goto("/signup");

  const combobox = page.getByRole("combobox", { name: /find your/i });
  await combobox.click();
  await combobox.pressSequentially("Bard the Bowman");
  await page.getByRole("listbox").getByRole("option").first().click();

  await expect(page.locator('input[name="selfCard1"]')).toHaveValue("Bard the Bowman");
  await expect(page.getByText(/can take a/i)).toHaveCount(0);
});

// A Background cannot lead a deck, so it must not be offered as a commander.
test("Backgrounds are not offered as standalone commanders", async ({ page }) => {
  await page.goto("/signup");

  const combobox = page.getByRole("combobox", { name: /find your/i });
  await combobox.click();
  await combobox.pressSequentially("Street Urchin");

  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
  await expect(listbox.getByRole("option", { name: "Street Urchin" })).toHaveCount(0);
});

// One response feeds both the commander list and the partner list. Filtering
// Backgrounds out of it leaves "Choose a Background" commanders unpairable —
// which is exactly what happened once.
test("the name list keeps Backgrounds so partners can be offered", async ({ request }) => {
  const response = await request.get("/api/commanders/names");
  expect(response.status()).toBe(200);

  const { commanders } = (await response.json()) as {
    commanders: { pairingRole: string | null }[];
  };
  const roles = commanders.map((c) => c.pairingRole);

  expect(roles).toContain("background");
  expect(roles).toContain("choose-background");
  expect(roles).toContain("partner");
});
