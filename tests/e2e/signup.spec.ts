import { expect, test } from "@playwright/test";

test("the sign-up form renders the fields the importer expects", async ({ page }) => {
  await page.goto("/signup");

  await expect(page.getByRole("heading", { name: "Sign up" })).toBeVisible();
  await expect(page.locator('input[name="name"]')).toBeVisible();
  await expect(page.locator('select[name="colorVeto"]')).toBeVisible();
  await expect(page.locator('textarea[name="themeWish"]')).toBeVisible();
  await expect(page.locator('input[name="themeVeto"]')).toBeVisible();
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
  expect(await response.text()).toContain('name="santa-signup"');
});
