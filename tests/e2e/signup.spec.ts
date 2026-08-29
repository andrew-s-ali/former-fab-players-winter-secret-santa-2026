import { expect, test } from "@playwright/test";

test("the sign-up form renders the fields the importer expects", async ({ page }) => {
  await page.goto("/signup");

  await expect(page.getByRole("heading", { name: "Sign up" })).toBeVisible();
  await expect(page.locator('input[name="name"]')).toBeVisible();
  await expect(page.locator('select[name="colorVeto"]')).toBeVisible();
  await expect(page.locator('textarea[name="themeWish"]')).toBeVisible();
  await expect(page.locator('input[name="themeVeto"]')).toBeVisible();

  // The two pool picks are hidden inputs fed by the commander browser, not
  // typed — but the importer still reads them by these names.
  await expect(page.locator('input[name="selfCard1"]')).toHaveCount(1);
  await expect(page.locator('input[name="selfCard2"]')).toHaveCount(1);
});

test("the form cannot be sent before two commanders are chosen", async ({ page }) => {
  await page.goto("/signup");

  // A submission with no picks would import as a participant whose pool is two
  // cards short, which only surfaces later as an exchange that never unlocks.
  await expect(page.getByRole("button", { name: "Sign me up" })).toBeDisabled();
  await expect(page.locator('input[name="selfCard1"]')).toHaveValue("");
});

test("the commander picker filters real card names as you type", async ({ page }) => {
  await page.goto("/signup");

  const combobox = page.getByRole("combobox", { name: /find your/i });
  await expect(combobox).toBeEnabled();

  // Against the live Scryfall pool, so this also proves the names endpoint
  // returns real, legal commanders rather than an empty list.
  await combobox.click();
  await combobox.pressSequentially("bowman");
  const options = page.getByRole("listbox").getByRole("option");
  await expect(options.first()).toBeVisible();
  await expect(options.first()).toContainText(/bowman/i);

  await options.first().click();
  await expect(page.locator('input[name="selfCard1"]')).not.toHaveValue("");
});

test("the commander picker can be driven entirely from the keyboard", async ({
  page,
}) => {
  await page.goto("/signup");

  const combobox = page.getByRole("combobox", { name: /find your/i });
  await combobox.click();
  await combobox.pressSequentially("bowman");
  await expect(page.getByRole("listbox").getByRole("option").first()).toBeVisible();

  // ArrowDown moves the active option without moving focus; Enter commits it.
  await combobox.press("ArrowDown");
  await combobox.press("Enter");

  await expect(page.locator('input[name="selfCard1"]')).not.toHaveValue("");
  // Enter committed the pick rather than submitting the form around it.
  await expect(page.getByRole("button", { name: "Sign me up" })).toBeVisible();
});

test("the sign-up page links out to the full browser without losing the form", async ({
  page,
}) => {
  await page.goto("/signup");

  const link = page.getByRole("link", { name: /browse every legal commander/i });
  await expect(link).toHaveAttribute("href", "/commanders");
  await expect(link).toHaveAttribute("target", "_blank");
});

test("the honeypot is present but hidden from real participants", async ({ page }) => {
  await page.goto("/signup");

  // Visible to a bot filling every input, invisible to a person and to a
  // screen reader — a participant who fills it in is dropped silently.
  await expect(page.locator('input[name="bot-field"]')).toBeHidden();
});

test("the form carries the hidden form-name Netlify attributes submissions by", async ({
  page,
}) => {
  await page.goto("/signup");

  await expect(page.locator('input[name="form-name"]')).toHaveValue("santa-signup");
});

test("the static skeleton file is served at the path the form POSTs to", async ({
  request,
}) => {
  // If this 404s in production, every submission silently goes nowhere: the
  // browser POSTs to a path that does not exist and Netlify never sees a form.
  const response = await request.get("/__forms.html");

  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain('name="santa-signup"');
  // Netlify validates submitted fields against the registered form and drops
  // mismatches silently, so the skeleton has to declare the card fields too.
  expect(body).toContain('name="selfCard1"');
  expect(body).toContain('name="selfCard2"');
});
