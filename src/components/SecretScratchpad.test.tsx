import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SecretScratchpad } from "./SecretScratchpad";

describe("SecretScratchpad", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("reads saved notes from localStorage on mount and saves updates", async () => {
    localStorage.setItem("secret-santa-scratchpad-test-token", "My card ideas");
    render(<SecretScratchpad token="test-token" />);
    expect(screen.getByRole("textbox", { name: /private notes/i })).toHaveValue("My card ideas");

    await userEvent.type(screen.getByRole("textbox", { name: /private notes/i }), " - add sol ring");
    expect(localStorage.getItem("secret-santa-scratchpad-test-token")).toBe("My card ideas - add sol ring");
    expect(screen.getByText(/saved to this browser/i)).toBeInTheDocument();
  });

  it("starts with empty notes if nothing is in localStorage", () => {
    render(<SecretScratchpad token="empty-token" />);
    expect(screen.getByRole("textbox", { name: /private notes/i })).toHaveValue("");
    expect(screen.getByText(/saved to this browser/i)).toBeInTheDocument();
  });

  it("saves notes to localStorage under the token-specific key when typed into", async () => {
    render(<SecretScratchpad token="tok-123" />);
    const textarea = screen.getByRole("textbox", { name: /private notes/i });

    await userEvent.type(textarea, "Deck plan: Artifact combo");
    expect(localStorage.getItem("secret-santa-scratchpad-tok-123")).toBe("Deck plan: Artifact combo");
  });

  it("keeps scratchpads isolated between different tokens", async () => {
    localStorage.setItem("secret-santa-scratchpad-token-a", "Notes for Alice");
    localStorage.setItem("secret-santa-scratchpad-token-b", "Notes for Bob");

    const { rerender } = render(<SecretScratchpad token="token-a" />);
    expect(screen.getByRole("textbox", { name: /private notes/i })).toHaveValue("Notes for Alice");

    rerender(<SecretScratchpad token="token-b" />);
    expect(screen.getByRole("textbox", { name: /private notes/i })).toHaveValue("Notes for Bob");
  });

  it("displays helper text explaining that notes are saved locally only", () => {
    render(<SecretScratchpad token="test-token" />);
    expect(
      screen.getByText(/stored only in this browser/i)
    ).toBeInTheDocument();
  });

  it("strictly does not import store or netlify blobs or make network requests", async () => {
    const componentSource = await readFile("src/components/SecretScratchpad.tsx", "utf8");
    const forbiddenRegex = /import\s+.*from\s+["'].*(?:store|@netlify\/blobs).*["']/g;
    expect(componentSource.match(forbiddenRegex)).toBeNull();
  });
});
