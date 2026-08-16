import { expect, test } from "@playwright/test";

test("home page shows the rules and the ban list", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("$75")).toBeVisible();
  await expect(page.getByText("Tatyova, Benthic Druid")).toBeVisible();
  await expect(page.getByText(/Malcolm.*Kediss/)).toBeVisible();
});
