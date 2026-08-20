import { afterEach, describe, expect, it } from "vitest";
import { siteNow } from "./clock";

const original = process.env.SIGNUPS_NOW;

afterEach(() => {
  if (original === undefined) {
    delete process.env.SIGNUPS_NOW;
  } else {
    process.env.SIGNUPS_NOW = original;
  }
});

describe("siteNow", () => {
  it("returns the real clock when no override is set", () => {
    delete process.env.SIGNUPS_NOW;

    expect(siteNow().getTime()).toBeCloseTo(Date.now(), -3);
  });

  it("returns the override when one is set", () => {
    process.env.SIGNUPS_NOW = "2026-08-19T00:00:00.000Z";

    expect(siteNow().toISOString()).toBe("2026-08-19T00:00:00.000Z");
  });

  it("falls back to the real clock on an unparseable override", () => {
    process.env.SIGNUPS_NOW = "not a date";

    expect(siteNow().getTime()).toBeCloseTo(Date.now(), -3);
  });
});
