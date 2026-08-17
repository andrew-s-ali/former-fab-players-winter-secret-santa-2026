import { describe, expect, it } from "vitest";
import {
  EVENT,
  EXCHANGE_AT,
  EXCHANGE_CANDIDATES,
  SIGNUPS_CLOSE_AT,
  eventTitle,
} from "./event";

describe("eventTitle", () => {
  it("combines the event name and year", () => {
    expect(eventTitle()).toBe(`${EVENT.name} ${EVENT.year}`);
  });

  it("ends with the event year", () => {
    expect(eventTitle()).toMatch(/2026$/);
  });
});

describe("event schedule constants", () => {
  it("defines signups close date and candidates", () => {
    expect(SIGNUPS_CLOSE_AT).toBe("2026-09-17");
    expect(EXCHANGE_CANDIDATES).toEqual(["2026-12-05", "2026-12-12", "2026-12-19"]);
    expect(EXCHANGE_AT).toBeNull();
  });
});
