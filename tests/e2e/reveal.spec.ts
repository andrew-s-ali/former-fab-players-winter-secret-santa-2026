import { expect, test } from "@playwright/test";

test("a valid token reveals the assignment", async ({ page }) => {
  await page.goto("/s/e2e-test-token-ada");

  await expect(page.getByRole("heading", { name: /Hi Ada/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Bob" })
  ).toBeVisible();

  // Bob has no stated preferences.
  await expect(page.locator('dt:has-text("Colour to avoid") + dd')).toHaveText(
    "No preference given"
  );
  await expect(page.locator('dt:has-text("Theme to avoid") + dd')).toHaveText(
    "No preference given"
  );
  await expect(
    page.locator('dt:has-text("What they\'d like") + dd')
  ).toHaveText("No preference given");
});

test("the reveal page shows the recipient's name and vetoes", async ({
  page,
}) => {
  await page.goto("/s/e2e-test-token-cleo");

  // Cleo draws Ada, who vetoed red and mill.
  await expect(
    page.getByRole("heading", { level: 2, name: "Ada" })
  ).toBeVisible();
  await expect(page.locator('dt:has-text("Colour to avoid") + dd')).toHaveText(
    "Red"
  );
  await expect(page.locator('dt:has-text("Theme to avoid") + dd')).toHaveText(
    "mill"
  );
  await expect(
    page.locator('dt:has-text("What they\'d like") + dd')
  ).toHaveText("elves and tokens");
});

test("an unknown token 404s", async ({ page }) => {
  const response = await page.goto("/s/not-a-real-token");

  expect(response?.status()).toBe(404);
});

test("the reveal page is not indexable", async ({ page }) => {
  await page.goto("/s/e2e-test-token-ada");

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/
  );
});

test("the browser on a reveal page excludes the recipient's vetoed colour", async ({
  page,
}) => {
  await page.goto("/s/e2e-test-token-cleo");

  const request = page.waitForRequest((r) =>
    r.url().includes("/api/commanders/sample")
  );
  await page.getByRole("button", { name: /roll again/i }).click();

  expect((await request).url()).toContain("exclude=R");
});

// Private notes now live in Postgres, and this suite runs with
// CARD_SELECTIONS_DISABLED=1 against a JSON fixture with no database behind
// it. So the invariant worth asserting here is the negative one: that branch
// must not offer a box whose contents it has nowhere to put. The saving
// behaviour itself is covered by src/components/SecretScratchpad.test.tsx and
// has to be exercised on a Deploy Preview.
test("the no-database branch does not offer private notes", async ({ page }) => {
  await page.goto("/s/e2e-test-token-ada");

  await expect(page.getByRole("heading", { name: /Hi Ada/ })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /private notes/i })).toHaveCount(0);
});

