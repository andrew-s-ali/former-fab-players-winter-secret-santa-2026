import { expect, test } from "@playwright/test";

test("home page renders the event name", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /secret santa/i })
  ).toBeVisible();
});
