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
  it("is the one name the site and the bot both use", () => {
    expect(eventTitle()).toBe("Winter Secret Santa 2026 Exchange");
  });

  it("carries the event year, which sits inside the name", () => {
    // Not a suffix any more, which is why the title is built by this function
    // rather than by appending EVENT.year to a prefix.
    expect(eventTitle()).toContain(String(EVENT.year));
  });
});

describe("event schedule constants", () => {
  it("defines signups close date and candidates", () => {
    // Instants, not bare dates: a bare date means midnight UTC, which is 8pm
    // Eastern the evening before — sign-ups would shut while the page still
    // said they were open.
    expect(SIGNUPS_CLOSE_AT).toBe("2026-09-11T04:00:00Z");
    // End of Friday the 25th, so the 25th is a full working day and building
    // starts on the 26th.
    expect(WORKSHOP_CLOSE_AT).toBe("2026-09-26T04:00:00Z");
    expect(EXCHANGE_CANDIDATES).toEqual(["2026-12-05", "2026-12-12", "2026-12-19"]);
    expect(EXCHANGE_AT).toBeNull();
  });
});
