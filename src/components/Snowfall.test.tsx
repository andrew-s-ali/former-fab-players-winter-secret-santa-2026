import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Snowfall } from "./Snowfall";

describe("Snowfall", () => {
  it("renders a decorative container with aria-hidden and snowfall class", () => {
    const { container } = render(<Snowfall />);
    const snowfallElement = container.querySelector(".snowfall");

    expect(snowfallElement).toBeInTheDocument();
    expect(snowfallElement).toHaveAttribute("aria-hidden", "true");
  });

  it("renders 24 snowflake elements with inline styles for animation and positioning", () => {
    const { container } = render(<Snowfall />);
    const snowflakes = container.querySelectorAll(".snowflake");

    expect(snowflakes).toHaveLength(24);

    snowflakes.forEach((flake) => {
      expect(flake).toHaveClass("snowflake");
      const style = flake.getAttribute("style");
      expect(style).toMatch(/left:\s*\d+%/);
      expect(style).toMatch(/width:\s*\d+px/);
      expect(style).toMatch(/height:\s*\d+px/);
      expect(style).toMatch(/animation-delay:\s*[\d.]+s/);
      expect(style).toMatch(/animation-duration:\s*\d+s/);
    });
  });

  it("contains no interactive elements or visible text", () => {
    const { container } = render(<Snowfall />);
    expect(container.textContent).toBe("");
    expect(container.querySelectorAll("button, a, input, select, textarea")).toHaveLength(0);
  });
});
