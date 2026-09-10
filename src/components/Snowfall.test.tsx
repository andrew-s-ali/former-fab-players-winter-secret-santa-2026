import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Snowfall } from "./Snowfall";

/**
 * The canvas has no 2D context under jsdom, so the effect bails out and
 * nothing is simulated here. That is deliberate: what the snow *does* is
 * covered in `src/lib/snow.test.ts`, against the real functions and with no
 * rendering context to fake. What is left to check is the part jsdom can see —
 * that the decoration cannot be reached, and that the one control on it is
 * usable by somebody who cannot see the icon.
 */
describe("Snowfall", () => {
  it("renders a decorative canvas that is hidden from assistive tech", () => {
    const { container } = render(<Snowfall />);
    const canvas = container.querySelector("canvas.snowfall");

    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveAttribute("aria-hidden", "true");
  });

  it("survives a browser with no 2D context", () => {
    // jsdom is that browser. The component must not throw on the way past it,
    // or every page that renders the layout goes down with the decoration.
    expect(() => render(<Snowfall />)).not.toThrow();
  });

  it("carries no visible text, and nothing interactive but the sweep", () => {
    const { container } = render(<Snowfall />);

    expect(container.textContent).toBe("");
    expect(container.querySelectorAll("button")).toHaveLength(1);
    // The snow covers the whole viewport; anything focusable inside it would
    // sit on top of the card grid.
    expect(
      container.querySelectorAll(".snowfall :is(button, a, input, select, textarea)")
    ).toHaveLength(0);
  });

  it("names the sweep for anyone who cannot see the icon", () => {
    render(<Snowfall />);

    // Icon-only on purpose — but an unnamed icon button is unusable, and this
    // name is what a screen reader and a hover tooltip both read.
    const button = screen.getByRole("button", { name: "Sweep the snow away" });
    expect(button).toHaveAttribute("title", "Sweep the snow away");
    expect(button).toBeEnabled();
  });
});
