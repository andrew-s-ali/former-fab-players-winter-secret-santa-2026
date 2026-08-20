import { describe, expect, it } from "vitest";
import { daysUntilOpen, formatEventDate, registrationOpen } from "./launch";

describe("registrationOpen", () => {
  it("is closed before the opening day", () => {
    expect(registrationOpen(new Date("2026-08-31T23:59:59Z"), "2026-09-01")).toBe(false);
  });

  it("is open from the first moment of the opening day", () => {
    expect(registrationOpen(new Date("2026-09-01T00:00:00Z"), "2026-09-01")).toBe(true);
  });

  it("stays open afterwards", () => {
    expect(registrationOpen(new Date("2026-12-25T00:00:00Z"), "2026-09-01")).toBe(true);
  });

  it("is closed while no opening date has been announced", () => {
    // The splash page is the safe default: a public URL should not start
    // taking sign-ups just because nobody filled the date in.
    expect(registrationOpen(new Date("2030-01-01T00:00:00Z"), null)).toBe(false);
  });
});

describe("daysUntilOpen", () => {
  it("counts whole days, rounding up", () => {
    expect(daysUntilOpen(new Date("2026-08-25T12:00:00Z"), "2026-09-01")).toBe(7);
  });

  it("is zero on the opening day itself", () => {
    expect(daysUntilOpen(new Date("2026-09-01T09:00:00Z"), "2026-09-01")).toBe(0);
  });

  it("never goes negative once the day has passed", () => {
    expect(daysUntilOpen(new Date("2026-10-01T00:00:00Z"), "2026-09-01")).toBe(0);
  });

  it("is null when no date has been announced", () => {
    expect(daysUntilOpen(new Date("2026-08-25T00:00:00Z"), null)).toBeNull();
  });
});

describe("formatEventDate", () => {
  it("renders a UK-style long date", () => {
    expect(formatEventDate("2026-09-17")).toBe("17 September 2026");
  });

  it("does not drift a day either way near midnight", () => {
    // Dates are stored as bare days and must render as that day in every
    // timezone the site is read in, so they are parsed and formatted in UTC.
    expect(formatEventDate("2026-01-01")).toBe("1 January 2026");
  });
});
