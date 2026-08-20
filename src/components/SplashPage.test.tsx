import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SplashPage } from "./SplashPage";

const now = new Date("2026-08-19T00:00:00Z");

describe("SplashPage", () => {
  it("counts down to the announced opening day", () => {
    render(<SplashPage now={now} opensAt="2026-09-01" />);

    expect(screen.getByText(/13 days/)).toBeInTheDocument();
    expect(screen.getByText(/until sign-ups open/i)).toBeInTheDocument();
    expect(screen.getByText("1 September 2026")).toBeInTheDocument();
  });

  it("says the day rather than the count on the last day before opening", () => {
    render(<SplashPage now={now} opensAt="2026-08-20" />);

    expect(screen.getByText(/1 day\b/)).toBeInTheDocument();
    expect(screen.queryByText(/1 days/)).not.toBeInTheDocument();
  });

  it("says soon, with no date, when none has been announced", () => {
    render(<SplashPage now={now} opensAt={null} />);

    expect(screen.getByText(/sign-ups open soon/i)).toBeInTheDocument();
    expect(screen.queryByText(/until sign-ups open/i)).not.toBeInTheDocument();
  });

  it("introduces the event and when it happens", () => {
    render(<SplashPage now={now} opensAt="2026-09-01" />);

    expect(
      screen.getByRole("heading", { level: 1, name: /secret santa 2026/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/secretly assigned someone else/i)).toBeInTheDocument();
    expect(screen.getByText(/exchange: 5, 12 or 19 december — date tbc/i)).toBeInTheDocument();
  });

  it("gives away neither the rules nor the sign-up form", () => {
    // The splash is an introduction, not a briefing: the budget, the ban list
    // and the form itself all wait for the real home page.
    render(<SplashPage now={now} opensAt="2026-09-01" />);

    expect(screen.queryByText(/\$75|budget|uncommon|banned/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /sign up/i })).not.toBeInTheDocument();
  });

  it("offers no way further into the site", () => {
    // Including the commander browser: the pool is defined by the rules, so
    // linking to it would publish them by another route.
    render(<SplashPage now={now} opensAt="2026-09-01" />);

    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("renders with default props without throwing", () => {
    render(<SplashPage />);

    expect(
      screen.getByText(/until sign-ups open|sign-ups open soon|sign-ups open today/i)
    ).toBeInTheDocument();
  });
});
