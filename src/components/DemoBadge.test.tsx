import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DemoBadge } from "./DemoBadge";

describe("DemoBadge", () => {
  it("renders the demo badge text", () => {
    render(<DemoBadge />);
    expect(
      screen.getByText(/Demo — invented people, not the real draw/i)
    ).toBeInTheDocument();
  });

  it("has amber border and text styling", () => {
    const { container } = render(<DemoBadge />);
    const badge = container.querySelector("p");
    expect(badge).toBeInTheDocument();
    expect(badge?.className).toContain("border-amber-400");
    expect(badge?.className).toContain("text-amber-400");
  });
});
