import { expect, test } from "@playwright/test";

test("the ring reveals one step at a time", async ({ page }) => {
  await page.goto("/reveal");

  await expect(page.getByRole("status")).toHaveText(/nobody revealed yet/i);

  await page.getByRole("button", { name: /reveal/i }).click();
  await expect(page.getByRole("status")).toHaveText(/gave to/i);
});

test("stepping to the end closes the loop", async ({ page }) => {
  await page.goto("/reveal");

  const button = page.getByRole("button", { name: /reveal/i });
  for (let i = 0; i < 3; i++) {
    await button.click();
  }

  await expect(page.getByText(/that's all the way round/i)).toBeVisible();
});
