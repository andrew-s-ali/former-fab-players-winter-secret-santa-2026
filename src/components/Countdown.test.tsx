import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Countdown } from "./Countdown";

describe("Countdown", () => {
  it("renders countdown to sign-ups closing when before signups close date", () => {
    render(<Countdown now={new Date("2026-09-03T00:00:00Z")} />);

    // Sign-ups close at midnight Eastern on the 11th (04:00Z), so from
    // midnight UTC on the 3rd there are 8 days and 4 hours left, rounded up.
    expect(screen.getByText(/9 days/i)).toBeInTheDocument();
    expect(screen.getByText(/until sign-ups close/i)).toBeInTheDocument();
  });

  it("names the settled exchange date rather than the candidates", () => {
    // The second line used to say "date TBC" whatever was configured, so the
    // page would have gone on offering three dates after one was announced.
    render(<Countdown now={new Date("2026-09-03T00:00:00Z")} />);

    expect(screen.getByText(/exchange: 12 december 2026/i)).toBeInTheDocument();
    expect(screen.queryByText(/date tbc/i)).not.toBeInTheDocument();
  });

  it("counts down to the exchange once sign-ups have closed, and says the day", () => {
    render(<Countdown now={new Date("2026-10-01T00:00:00Z")} />);

    expect(screen.getByText(/until the exchange/i)).toBeInTheDocument();
    expect(screen.getByText(/12 december 2026/i)).toBeInTheDocument();
  });

  it("renders with default now prop without throwing", () => {
    render(<Countdown />);

    expect(
      screen.getByText(/until sign-ups close|sign-ups are closed|until the exchange/i)
    ).toBeInTheDocument();
  });
});
