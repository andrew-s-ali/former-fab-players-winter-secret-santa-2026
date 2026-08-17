import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ThemePrompt } from "./ThemePrompt";
import { THEME_PROMPTS } from "@/lib/prompts";

describe("ThemePrompt", () => {
  it("shows the prompt chosen on the server", () => {
    render(<ThemePrompt initialPrompt="Landfall" />);

    expect(screen.getByText("Landfall")).toBeInTheDocument();
  });

  it("re-rolls to another prompt from the list", async () => {
    render(<ThemePrompt initialPrompt="Landfall" />);

    await userEvent.click(screen.getByRole("button", { name: /another/i }));

    // A re-roll can legitimately land on the same prompt, so assert only that
    // whatever is shown is a real prompt — not that it changed.
    const shown = THEME_PROMPTS.find((p) => screen.queryByText(p) !== null);
    expect(shown).toBeDefined();
  });
});
