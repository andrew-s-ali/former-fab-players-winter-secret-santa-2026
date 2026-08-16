import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("renders the event title as the page heading", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: /secret santa 2026/i })
    ).toBeInTheDocument();
  });
});
