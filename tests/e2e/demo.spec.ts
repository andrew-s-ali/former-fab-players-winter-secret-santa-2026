import { expect, test } from "@playwright/test";

test("the demo index lists participants and is badged", async ({ page }) => {
  await page.goto("/demo");

  await expect(page.getByText(/demo — invented people/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Ada Lovelace" })).toBeVisible();
});

test("a demo link reveals that participant's recipient", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("link", { name: "Ada Lovelace" }).click();

  await expect(page.getByRole("heading", { name: /Hi Ada Lovelace/ })).toBeVisible();
  await expect(page.getByText(/demo — invented people/i)).toBeVisible();
});
