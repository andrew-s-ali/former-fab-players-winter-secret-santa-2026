import { expect, test } from "@playwright/test";

test("the ring reveals one step at a time", async ({ page }) => {
  await page.goto("/reveal");

  await expect(page.getByRole("status")).toHaveText(/nobody revealed yet/i);

  await page.getByRole("button", { name: /reveal/i }).click();
  await expect(page.getByRole("status")).toHaveText(/gave to/i);
});

test("stepping to the end closes the loop, shows confetti, and allows copying Discord summary", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/reveal");

  const button = page.getByRole("button", { name: /reveal/i });
  for (let i = 0; i < 3; i++) {
    await button.click();
  }

  await expect(page.getByText(/that's all the way round/i)).toBeVisible();
  await expect(page.locator('[data-testid="confetti-burst"]')).toBeVisible();

  const copyButton = page.getByRole("button", {
    name: /copy discord summary/i,
  });
  await expect(copyButton).toBeVisible();

  await copyButton.click();
  await expect(page.getByText(/copied to clipboard/i)).toBeVisible();

  const clipboardText = await page.evaluate(() =>
    navigator.clipboard.readText()
  );
  expect(clipboardText).toContain(
    "🎄 **Winter Secret Santa 2026 — Reveal Day Pairings** 🎁"
  );
  expect(clipboardText).toContain("||Ada ➜ Bob||");
  expect(clipboardText).toContain("||Bob ➜ Cleo||");
  expect(clipboardText).toContain("||Cleo ➜ Ada||");
});

