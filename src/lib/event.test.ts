import { describe, expect, it } from "vitest";
import { EVENT, eventTitle } from "./event";

describe("eventTitle", () => {
  it("combines the event name and year", () => {
    expect(eventTitle()).toBe(`${EVENT.name} ${EVENT.year}`);
  });

  it("ends with the event year", () => {
    expect(eventTitle()).toMatch(/2026$/);
  });
});
