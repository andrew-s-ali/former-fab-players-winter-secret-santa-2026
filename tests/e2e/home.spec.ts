import { expect, test } from "@playwright/test";
import { SIGNUPS_OPEN_AT } from "../../src/lib/event";
import { registrationOpen } from "../../src/lib/launch";
import { E2E_NOW } from "./clock";

/**
 * Which home page the site serves is a function of the date, so the suite
 * derives it from the same constant the site does. Setting SIGNUPS_OPEN_AT to
 * launch the event swaps which of these two runs — neither has to be edited.
 */
const open = registrationOpen(new Date(E2E_NOW), SIGNUPS_OPEN_AT);

test("the home page is a splash page until registration opens", async ({ page }) => {
  test.skip(open, "registration is open — the full home page is live");

  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: /Winter Secret Santa 2026/ })
  ).toBeVisible();
  await expect(page.getByText(/sign-ups open/i)).toBeVisible();

  // The whole point of the splash: it introduces the event and nothing more.
  await expect(page.getByRole("link", { name: /sign up/i })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /^Rules$/ })).toHaveCount(0);
  await expect(page.getByText("$75")).toHaveCount(0);
  await expect(page.getByText("Tatyova, Benthic Druid")).toHaveCount(0);
  await expect(page.locator("main a")).toHaveCount(0);
});

test("the home page shows the rules and the ban list once registration opens", async ({
  page,
}) => {
  test.skip(!open, "registration has not opened — the home page is the splash");

  await page.goto("/");

  await expect(page.getByText("$75")).toBeVisible();
  await expect(page.getByText("Tatyova, Benthic Druid")).toBeVisible();
  await expect(page.getByText(/Malcolm.*Kediss/)).toBeVisible();
});
