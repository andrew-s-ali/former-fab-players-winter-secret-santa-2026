import { describe, expect, it, vi } from "vitest";
import { parseNow } from "./remind";

describe("parseNow", () => {
  it("is undefined when the flag is absent, so the real clock is used", () => {
    expect(parseNow([])).toBeUndefined();
    expect(parseNow(["--dry-run", "--force"])).toBeUndefined();
  });

  it("reads an ISO instant", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    expect(parseNow(["--now=2026-09-01T12:00:00Z"])?.toISOString()).toBe(
      "2026-09-01T12:00:00.000Z"
    );
  });

  it("throws on a value that is not a date, rather than silently using now", () => {
    // Falling back to the real clock here would post a live message at a time
    // the operator did not intend, which is the opposite of what --now is for.
    expect(() => parseNow(["--now=tomorrow"])).toThrow(/--now=2026-09-01/);
    expect(() => parseNow(["--now="])).toThrow();
  });
});
