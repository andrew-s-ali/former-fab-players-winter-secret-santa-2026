import { describe, expect, it } from "vitest";
import {
  EVENT,
  EXCHANGE_AT,
  EXCHANGE_CANDIDATES,
  SIGNUPS_CLOSE_AT,
  SIGNUPS_OPEN_AT,
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
  it("defines the sign-up window, the candidates and the exchange date", () => {
    expect(SIGNUPS_OPEN_AT).toBe("2026-09-04");
    expect(SIGNUPS_CLOSE_AT).toBe("2026-09-18");
    expect(EXCHANGE_CANDIDATES).toEqual(["2026-12-05", "2026-12-12", "2026-12-19"]);
    expect(EXCHANGE_AT).toBeNull();
  });

  it("opens before it closes", () => {
    expect(SIGNUPS_OPEN_AT! < SIGNUPS_CLOSE_AT).toBe(true);
  });
});
