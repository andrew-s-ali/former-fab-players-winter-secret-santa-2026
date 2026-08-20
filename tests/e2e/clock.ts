/**
 * The instant the E2E site runs at.
 *
 * Injected as SIGNUPS_NOW by playwright.config.ts and read back by the specs
 * that depend on which side of a date the site is on, so the two can never
 * disagree about what "today" is.
 */
export const E2E_NOW = "2026-08-19T00:00:00.000Z";
