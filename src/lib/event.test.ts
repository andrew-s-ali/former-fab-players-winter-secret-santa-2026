import { describe, expect, it } from "vitest";
import {
  EVENT,
  EXCHANGE_AT,
  EXCHANGE_CANDIDATES,
  WORKSHOP_CLOSE_AT,
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
    // Instants, not bare dates: a bare date means midnight UTC, which is 8pm
    // Eastern the evening before — sign-ups would shut while the page still
    // said they were open.
    expect(SIGNUPS_CLOSE_AT).toBe("2026-09-08T04:00:00Z");
    // End of the 21st, so the 21st is a full working day and building starts
    // on the 22nd.
    expect(WORKSHOP_CLOSE_AT).toBe("2026-09-22T04:00:00Z");
    expect(EXCHANGE_CANDIDATES).toEqual(["2026-12-05", "2026-12-12", "2026-12-19"]);
    expect(EXCHANGE_AT).toBeNull();
  });
});
