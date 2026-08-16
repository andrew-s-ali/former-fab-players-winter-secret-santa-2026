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
  await page.goto("/s/e2e-test-token-bob");

  // Bob draws Ada, who vetoed red and mill.
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

test("unknown and dangling-recipient tokens 404 identically", async ({
  page,
}) => {
  const unknown = await page.goto("/s/not-a-real-token");
  const unknownTitle = await page.title();
  const unknownText = await page.locator("body").innerText();

  const dangling = await page.goto("/s/e2e-test-token-dangling");
  const danglingTitle = await page.title();
  const danglingText = await page.locator("body").innerText();

  expect(unknown?.status()).toBe(404);
  expect(dangling?.status()).toBe(404);
  // Compare what's actually rendered (title + visible text), not the raw
  // HTML response body: under `next dev` (Turbopack) the two code paths
  // embed different bundle line/column numbers for their distinct
  // `notFound()` call sites into an inline hydration <script>, and every
  // request — even two hits on the identical URL — carries its own random
  // `self.__next_r` nonce in another inline <script>. Neither is visible to
  // a user, and neither survives a production build: `next build && next
  // start` renders byte-identical bodies for both cases, differing only in
  // the requested path being echoed back into the hydration state (not new
  // information — the client already knows the URL it asked for). Verified
  // by hand against both `next dev` and a production build before writing
  // this comment.
  expect(danglingTitle).toBe(unknownTitle);
  expect(danglingText).toBe(unknownText);
});

test("the reveal page is not indexable", async ({ page }) => {
  await page.goto("/s/e2e-test-token-ada");

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/
  );
});

test("the suggester on a reveal page excludes the recipient's vetoed colour", async ({
  page,
}) => {
  await page.goto("/s/e2e-test-token-bob");

  const request = page.waitForRequest((r) =>
    r.url().includes("/api/commanders/random")
  );
  await page.getByRole("button", { name: /random commander/i }).click();

  expect((await request).url()).toContain("exclude=R");
});
