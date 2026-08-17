import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("renders the event title as the page heading", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: /secret santa 2026/i })
    ).toBeInTheDocument();
  });

  it("renders the countdown", () => {
    render(<Home />);

    expect(
      screen.getByText(/until sign-ups close|sign-ups are closed|until the exchange/i)
    ).toBeInTheDocument();
  });

  it("links to the commander browser", () => {
    render(<Home />);

    expect(screen.getByRole("link", { name: /commanders/i })).toHaveAttribute(
      "href",
      "/commanders"
    );
  });
});
