import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ThemePrompt } from "./ThemePrompt";

// A fixed re-roll target, so "did the click change the prompt?" is a real
// question with a deterministic answer rather than a 1-in-24 coin flip.
vi.mock("@/lib/prompts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/prompts")>()),
  pickPrompt: () => ({ text: "Landfall", keyword: "land" }),
}));

describe("ThemePrompt", () => {
  it("shows the prompt chosen on the server", () => {
    render(
      <ThemePrompt
        initialPrompt={{ text: "Go wide with tokens", keyword: "token" }}
      />
    );

    expect(screen.getByText("Go wide with tokens")).toBeInTheDocument();
  });

  it("replaces the prompt when re-rolled", async () => {
    render(
      <ThemePrompt
        initialPrompt={{ text: "Go wide with tokens", keyword: "token" }}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /another/i }));

    expect(screen.getByText("Landfall")).toBeInTheDocument();
    expect(screen.queryByText("Go wide with tokens")).not.toBeInTheDocument();
  });

  it("calls onSelectPrompt when 'Search this theme' is clicked", async () => {
    const onSelect = vi.fn();
    render(
      <ThemePrompt
        initialPrompt={{ text: "Artifact deck", keyword: "artifact" }}
        onSelectPrompt={onSelect}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /search this theme/i }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ keyword: "artifact" }));
  });
});
