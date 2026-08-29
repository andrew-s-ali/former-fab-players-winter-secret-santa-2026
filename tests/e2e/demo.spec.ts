import { expect, test } from "@playwright/test";

test("the demo index lists participants and is badged", async ({ page }) => {
  await page.goto("/demo");

  await expect(page.getByText(/demo — invented people/i)).toBeVisible();
  await expect(page.getByText("Ada Lovelace")).toBeVisible();
  // Each person has both stages of their private link.
  await expect(page.getByRole("link", { name: "workshop" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "assignment" }).first()).toBeVisible();
});

test("the workshop stage is reachable and asks for picks for other people", async ({
  page,
}) => {
  await page.goto("/demo");
  await Promise.all([
    page.waitForURL(/\/demo\/s\/.*phase=workshop/),
    page.getByRole("link", { name: "workshop" }).first().click(),
  ]);

  await expect(
    page.getByRole("heading", { name: /a card for everyone else/i })
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: /choose a participant/i })
  ).toBeVisible();
});

test("a demo link reveals that participant's recipient", async ({ page }) => {
  await page.goto("/demo");
  const adaLink = page.getByRole("link", { name: "assignment" }).first();
  await expect(adaLink).toBeVisible();
  await Promise.all([
    page.waitForURL(/\/demo\/s\//),
    adaLink.click(),
  ]);

  await expect(page.getByRole("heading", { name: /Hi Ada Lovelace/ })).toBeVisible();
  await expect(page.getByText(/demo — invented people/i)).toBeVisible();
});
