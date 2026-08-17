export type CountdownConfig = {
  signupsCloseAt: string;
  exchangeCandidates: readonly string[];
  exchangeAt: string | null;
};

export type CountdownPhase =
  | { kind: "before-signups"; days: number }
  | { kind: "signups-closed" }
  | { kind: "before-exchange"; days: number }
  | { kind: "after-exchange" };

const DAY_MS = 86_400_000;

/** Whole days from `now` to `target`, rounded up. */
function daysUntil(now: Date, target: string): number {
  return Math.ceil((new Date(`${target}T00:00:00Z`).getTime() - now.getTime()) / DAY_MS);
}

/**
 * Works out which milestone to show.
 *
 * `now` is a parameter so every phase is testable without mocking the clock.
 */
export function countdownPhase(now: Date, config: CountdownConfig): CountdownPhase {
  const toSignups = daysUntil(now, config.signupsCloseAt);
  if (toSignups > 0) {
    return { kind: "before-signups", days: toSignups };
  }

  if (!config.exchangeAt) {
    return { kind: "signups-closed" };
  }

  const toExchange = daysUntil(now, config.exchangeAt);
  return toExchange > 0
    ? { kind: "before-exchange", days: toExchange }
    : { kind: "after-exchange" };
}

/** Renders candidate dates as "5, 12 or 19 December". */
export function formatCandidates(candidates: readonly string[]): string {
  const dates = candidates.map((d) => new Date(`${d}T00:00:00Z`));
  const days = dates.map((d) => d.getUTCDate());
  const month = dates[0].toLocaleString("en-GB", { month: "long", timeZone: "UTC" });

  return `${days.slice(0, -1).join(", ")} or ${days[days.length - 1]} ${month}`;
}
