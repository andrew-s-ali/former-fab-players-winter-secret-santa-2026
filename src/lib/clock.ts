/**
 * "Now", overridable for tests only.
 *
 * Several things about this site turn over on a fixed date — the splash page
 * gives way to the real home page, the sign-up form closes — so without a
 * lever the E2E suite would start failing of its own accord on those days.
 * Read from a server-only env var that is set by playwright.config.ts and
 * never in production; an unparseable value falls back to the real clock
 * rather than silently freezing the site at some arbitrary moment.
 */
export function siteNow(): Date {
  const override = process.env.SIGNUPS_NOW;
  if (!override) {
    return new Date();
  }
  const parsed = new Date(override);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
