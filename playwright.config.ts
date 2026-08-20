import { defineConfig, devices } from "@playwright/test";
import { E2E_NOW } from "./tests/e2e/clock";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Serial on purpose. With four workers against a cold cache, parallel
  // first-hits to each route contend on on-demand compilation and the initial
  // Scryfall pool fetch, and 3–4 tests time out; CI always starts cold, where
  // `retries` was quietly masking it. Serial costs about seven seconds on a
  // ~20s suite and makes cold runs deterministic.
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev -- --webpack",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      EVENT_DATA_PATH: "tests/e2e/fixture-event.json",
      // Pins the site's clock. Without it the /signup specs would start failing
      // on their own the day sign-ups close; the closed state is covered by
      // unit tests in src/lib/signup.test.ts. tests/e2e/home.spec.ts reads the
      // same constant to work out which home page it should be looking at.
      SIGNUPS_NOW: E2E_NOW,
    },
  },
});
