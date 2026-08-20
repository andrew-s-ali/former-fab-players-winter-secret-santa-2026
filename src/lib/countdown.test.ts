import { describe, expect, it } from "vitest";
import { countdownPhase, formatCandidates } from "./countdown";

const config = {
  signupsCloseAt: "2026-09-18",
  exchangeCandidates: ["2026-12-05", "2026-12-12", "2026-12-19"],
  exchangeAt: null as string | null,
};

describe("countdownPhase", () => {
  it("counts down to sign-ups closing", () => {
    const phase = countdownPhase(new Date("2026-09-10T00:00:00Z"), config);

    expect(phase).toEqual({ kind: "before-signups", days: 9 });
  });

  it("stays open all through the closing day, and shuts at the end of it", () => {
    // The closing date is a deadline people are told to act by, so it has to
    // be a day they can still act on. One second past midnight on the closing
    // day used to be too late.
    expect(countdownPhase(new Date("2026-09-18T00:00:01Z"), config)).toEqual({
      kind: "before-signups",
      days: 1,
    });
    expect(countdownPhase(new Date("2026-09-18T23:59:59Z"), config).kind).toBe(
      "before-signups"
    );
    expect(countdownPhase(new Date("2026-09-19T00:00:00Z"), config).kind).toBe(
      "signups-closed"
    );
  });

  it("reports sign-ups closed while the exchange date is undecided", () => {
    const phase = countdownPhase(new Date("2026-10-01T00:00:00Z"), config);

    expect(phase.kind).toBe("signups-closed");
  });

  it("counts down to the exchange once a date is chosen", () => {
    const phase = countdownPhase(new Date("2026-12-01T00:00:00Z"), {
      ...config,
      exchangeAt: "2026-12-05",
    });

    expect(phase).toEqual({ kind: "before-exchange", days: 4 });
  });

  it("closes out once the exchange has happened", () => {
    const phase = countdownPhase(new Date("2026-12-06T00:00:00Z"), {
      ...config,
      exchangeAt: "2026-12-05",
    });

    expect(phase.kind).toBe("after-exchange");
  });
});

describe("formatCandidates", () => {
  it("lists the candidate dates in prose", () => {
    expect(formatCandidates(config.exchangeCandidates)).toBe(
      "5, 12 or 19 December"
    );
  });
});
