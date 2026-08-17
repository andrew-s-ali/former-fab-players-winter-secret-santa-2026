import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ThemePrompt } from "./ThemePrompt";

// A fixed re-roll target, so "did the click change the prompt?" is a real
// question with a deterministic answer rather than a 1-in-24 coin flip.
vi.mock("@/lib/prompts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/prompts")>()),
  pickPrompt: () => "Landfall",
}));

describe("ThemePrompt", () => {
  it("shows the prompt chosen on the server", () => {
    render(<ThemePrompt initialPrompt="Go wide with tokens" />);

    expect(screen.getByText("Go wide with tokens")).toBeInTheDocument();
  });

  it("replaces the prompt when re-rolled", async () => {
    render(<ThemePrompt initialPrompt="Go wide with tokens" />);

    await userEvent.click(screen.getByRole("button", { name: /another/i }));

    expect(screen.getByText("Landfall")).toBeInTheDocument();
    expect(screen.queryByText("Go wide with tokens")).not.toBeInTheDocument();
  });
});
