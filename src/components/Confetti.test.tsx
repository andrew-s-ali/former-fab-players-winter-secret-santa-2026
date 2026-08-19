import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Confetti } from "./Confetti";

describe("Confetti", () => {
  it("renders a decorative container with aria-hidden and confetti-burst testid and class", () => {
    const { container } = render(<Confetti />);
    const confettiElement = container.querySelector(".confetti-burst");

    expect(confettiElement).toBeInTheDocument();
    expect(confettiElement).toHaveAttribute("aria-hidden", "true");
    expect(confettiElement).toHaveAttribute("data-testid", "confetti-burst");
  });

  it("renders confetti particle elements with inline styles for animation, color, and positioning", () => {
    const { container } = render(<Confetti />);
    const particles = container.querySelectorAll(".confetti-piece");

    expect(particles.length).toBeGreaterThanOrEqual(20);

    particles.forEach((particle) => {
      expect(particle).toHaveClass("confetti-piece");
      const style = particle.getAttribute("style");
      expect(style).toMatch(/left:\s*\d+%/);
      expect(style).toMatch(/background-color:/);
      expect(style).toMatch(/animation-delay:\s*[\d.]+s/);
      expect(style).toMatch(/animation-duration:\s*[\d.]+s/);
    });
  });

  it("contains no interactive elements or visible text", () => {
    const { container } = render(<Confetti />);
    expect(container.textContent).toBe("");
    expect(container.querySelectorAll("button, a, input, select, textarea")).toHaveLength(0);
  });
});
