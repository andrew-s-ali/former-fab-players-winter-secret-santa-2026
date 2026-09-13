import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `EXCHANGE_AT` is a module constant, so each case re-imports the component
 * with the constant stubbed. The null case is the live one today: the group
 * has not settled a December date.
 */
async function renderWith(exchangeAt: string | null, now = new Date("2026-11-01T12:00:00Z")) {
  vi.resetModules();
  vi.doMock("@/lib/event", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/event")>()),
    EXCHANGE_AT: exchangeAt,
  }));
  const { DeckDeadline } = await import("./DeckDeadline");
  render(<DeckDeadline now={now} />);
}

afterEach(() => {
  vi.doUnmock("@/lib/event");
  vi.resetModules();
});

describe("DeckDeadline", () => {
  it("names the day once the group has settled one", async () => {
    await renderWith("2026-12-12");

    expect(screen.getByText(/12 December 2026/)).toBeInTheDocument();
  });

  it("counts the days left, so the deadline is a distance and not a date", async () => {
    await renderWith("2026-12-12", new Date("2026-12-02T12:00:00Z"));

    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText(/days from now/)).toBeInTheDocument();
  });

  it("drops the countdown on the day itself rather than saying zero days", async () => {
    await renderWith("2026-12-12", new Date("2026-12-12T12:00:00Z"));

    expect(screen.getByText(/12 December 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/from now/)).not.toBeInTheDocument();
  });

  it("says the date is unsettled, and which days are in the running", async () => {
    // Today's state. Saying nothing would leave the one screen with a job on
    // it as the only one with no date attached, which is how it started.
    await renderWith(null);

    expect(screen.getByText(/5, 12 or 19 December/)).toBeInTheDocument();
    expect(screen.getByText(/has not settled which yet/i)).toBeInTheDocument();
  });
});
