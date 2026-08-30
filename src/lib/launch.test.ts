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

describe("opening at an exact instant, not just a UTC day", () => {
  // The group is US Eastern and wanted local midnight on 1 September. In
  // September that is EDT (UTC-4), so the moment is 04:00Z.
  const MIDNIGHT_EASTERN = "2026-09-01T04:00:00Z";

  it("stays shut until the instant arrives", () => {
    expect(
      registrationOpen(new Date("2026-09-01T03:59:59Z"), MIDNIGHT_EASTERN)
    ).toBe(false);
    expect(
      registrationOpen(new Date("2026-09-01T04:00:00Z"), MIDNIGHT_EASTERN)
    ).toBe(true);
  });

  it("does NOT open on the evening of the day before", () => {
    // The bug this form exists to avoid: a bare "2026-09-01" is midnight UTC,
    // which is 8pm Eastern on 31 August — the site would have gone live while
    // the organiser was having dinner the night before.
    const eveningBefore = new Date("2026-09-01T00:00:00Z");

    expect(registrationOpen(eveningBefore, "2026-09-01")).toBe(true);
    expect(registrationOpen(eveningBefore, MIDNIGHT_EASTERN)).toBe(false);
  });

  it("still treats a bare date as the start of that UTC day", () => {
    expect(registrationOpen(new Date("2026-08-31T23:59:59Z"), "2026-09-01")).toBe(false);
    expect(registrationOpen(new Date("2026-09-01T00:00:00Z"), "2026-09-01")).toBe(true);
  });

  it("counts down to the instant", () => {
    expect(daysUntilOpen(new Date("2026-08-30T04:00:00Z"), MIDNIGHT_EASTERN)).toBe(2);
    // Same UTC day as the switch, but before it: "opens today", not "opens now".
    expect(daysUntilOpen(new Date("2026-09-01T03:00:00Z"), MIDNIGHT_EASTERN)).toBe(1);
    expect(daysUntilOpen(new Date("2026-09-01T04:00:00Z"), MIDNIGHT_EASTERN)).toBe(0);
  });

  it("shows the date the group would call it, not the UTC instant", () => {
    expect(formatEventDate(MIDNIGHT_EASTERN)).toBe("1 September 2026");
    expect(formatEventDate("2026-09-17")).toBe("17 September 2026");
  });
});
