import { describe, expect, it } from "vitest";
import {
  currentExchangeReminder,
  shouldPostExchangeReminder,
  URGENT_THRESHOLDS,
} from "./exchange-reminder";

/** The settled date: local midnight on Saturday 12 December 2026. */
const EXCHANGE = "2026-12-12T05:00:00Z";

/** Noon US Eastern on the given day, which is when the schedule runs. */
const noon = (day: string) => new Date(`${day}T17:00:00Z`);

const at = (day: string) => currentExchangeReminder(noon(day), EXCHANGE);

describe("which exchange reminder is due", () => {
  it("says nothing without a date to count down to", () => {
    expect(currentExchangeReminder(noon("2026-10-05"), null)).toBeNull();
  });

  it("skips the Monday right after the announcement", () => {
    // The date was announced on the 13th. The cadence's parity put a routine
    // reminder on the 14th, which would have repeated it the next morning.
    expect(at("2026-09-14")).toBeNull();
  });

  it("picks the series up at the next slot, not the one after", () => {
    // Holding the first one back must not shift the rest: 28 September is
    // where the cadence always put it.
    expect(at("2026-09-28")?.kind).toBe("fortnight");
  });

  it("counts down on alternate Mondays while the day is far off", () => {
    // 12 October and 26 October are Mondays a fortnight apart; the 19th is the
    // Monday between them and stays quiet.
    expect(at("2026-10-12")?.kind).toBe("fortnight");
    expect(at("2026-10-19")).toBeNull();
    expect(at("2026-10-26")?.kind).toBe("fortnight");
  });

  it("stays quiet on the other days of a week it does speak in", () => {
    expect(at("2026-10-13")).toBeNull();
    expect(at("2026-10-15")).toBeNull();
    expect(at("2026-10-18")).toBeNull();
  });

  it("keys the fortnightly one by its own day, so a retry cannot double-post", () => {
    expect(at("2026-10-12")?.key).toBe("fortnight@2026-10-12");
    expect(at("2026-10-26")?.key).toBe("fortnight@2026-10-26");
  });

  it("switches to the two-week warning inside a fortnight", () => {
    // 28 November is a Saturday, fourteen days out.
    const reminder = at("2026-11-28");

    expect(reminder?.kind).toBe("two-weeks");
    expect(reminder?.daysLeft).toBe(14);
  });

  it("switches again to the one-week warning", () => {
    expect(at("2026-12-05")?.kind).toBe("one-week");
  });

  it("prefers the urgent message on a day that is also a Monday", () => {
    // 7 December is a Monday and six days out. Routine cadence must not
    // displace the week-out warning.
    expect(at("2026-12-07")?.kind).toBe("one-week");
  });

  it("says the eve message the day before", () => {
    const reminder = at("2026-12-11");

    expect(reminder?.kind).toBe("eve");
    expect(reminder?.daysLeft).toBe(1);
  });

  it("goes quiet once the day has come", () => {
    // Nothing to count down to, and a countdown posted after the exchange is
    // noise about something that already happened.
    expect(at("2026-12-12")).toBeNull();
    expect(at("2026-12-13")).toBeNull();
    expect(at("2027-01-04")).toBeNull();
  });

  it("still says a milestone it missed, rather than skipping it", () => {
    // A schedule that fails on the 5th must not swallow the week-out warning:
    // the thresholds are "within", not "exactly on".
    expect(at("2026-12-06")?.kind).toBe("one-week");
    expect(at("2026-11-30")?.kind).toBe("two-weeks");
    expect(URGENT_THRESHOLDS).toEqual([14, 7]);
  });

  it("only ever says each thing once", () => {
    const reminder = at("2026-12-11")!;

    expect(shouldPostExchangeReminder(reminder, null)).toBe(true);
    expect(shouldPostExchangeReminder(reminder, { postedKeys: [] })).toBe(true);
    expect(
      shouldPostExchangeReminder(reminder, { postedKeys: [reminder.key] })
    ).toBe(false);
  });

  it("keys the urgent ones by the date, so moving the day says them again", () => {
    // Same reasoning as the sign-up countdown: a moved date is real news, and
    // the countdown to the old one has already been said.
    expect(at("2026-12-05")?.key).toBe(`days-7@${EXCHANGE}`);
    expect(at("2026-12-11")?.key).toBe(`eve@${EXCHANGE}`);
  });
});
