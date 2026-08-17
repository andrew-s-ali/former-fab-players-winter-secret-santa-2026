import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RevealRing } from "./RevealRing";

const ring = {
  names: ["Ada", "Bob", "Cleo"],
  steps: [
    { from: "Ada", to: "Bob" },
    { from: "Bob", to: "Cleo" },
    { from: "Cleo", to: "Ada" },
  ],
};

describe("RevealRing", () => {
  it("starts with no names shown", () => {
    render(<RevealRing ring={ring} />);

    expect(screen.queryByText("Ada")).not.toBeInTheDocument();
    expect(screen.queryByText("Cleo")).not.toBeInTheDocument();
  });

  it("reveals the first pair on the first step", async () => {
    render(<RevealRing ring={ring} />);

    await userEvent.click(screen.getByRole("button", { name: /reveal/i }));

    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.queryByText("Cleo")).not.toBeInTheDocument();
  });

  it("adds one name per subsequent step", async () => {
    render(<RevealRing ring={ring} />);
    const button = screen.getByRole("button", { name: /reveal/i });

    await userEvent.click(button);
    await userEvent.click(button);

    expect(screen.getByText("Cleo")).toBeInTheDocument();
  });

  it("finishes after one step per participant and stops offering more", async () => {
    render(<RevealRing ring={ring} />);
    const button = screen.getByRole("button", { name: /reveal/i });

    await userEvent.click(button);
    await userEvent.click(button);
    await userEvent.click(button);

    expect(screen.queryByRole("button", { name: /reveal/i })).not.toBeInTheDocument();
    expect(screen.getByText(/all the way round/i)).toBeInTheDocument();
  });

  it("describes progress for screen readers", async () => {
    render(<RevealRing ring={ring} />);

    await userEvent.click(screen.getByRole("button", { name: /reveal/i }));

    expect(screen.getByRole("status")).toHaveTextContent("Ada gave to Bob");
  });

  it("renders Copy Discord Summary button and confetti when cycle completes", async () => {
    const testRing = {
      names: ["Alice", "Bob", "Cleo"],
      steps: [
        { from: "Alice", to: "Bob" },
        { from: "Bob", to: "Cleo" },
        { from: "Cleo", to: "Alice" },
      ],
    };
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

    render(<RevealRing ring={testRing} />);
    // Reveal all steps
    const nextBtn = screen.getByRole("button", { name: /reveal the next one/i });
    for (let i = 0; i < testRing.steps.length; i++) {
      await userEvent.click(nextBtn);
    }

    expect(screen.getByTestId("confetti-burst")).toBeInTheDocument();
    const copyBtn = screen.getByRole("button", { name: /copy discord summary/i });
    expect(copyBtn).toBeInTheDocument();

    await userEvent.click(copyBtn);
    expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining("||Alice ➜ Bob||"));
    expect(screen.getByText(/copied to clipboard/i)).toBeInTheDocument();
  });

  it("formats the full discord summary with title and all steps", async () => {
    const testRing = {
      names: ["Alice", "Bob", "Cleo"],
      steps: [
        { from: "Alice", to: "Bob" },
        { from: "Bob", to: "Cleo" },
        { from: "Cleo", to: "Alice" },
      ],
    };
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

    render(<RevealRing ring={testRing} />);
    const nextBtn = screen.getByRole("button", { name: /reveal the next one/i });
    for (let i = 0; i < testRing.steps.length; i++) {
      await userEvent.click(nextBtn);
    }

    const copyBtn = screen.getByRole("button", { name: /copy discord summary/i });
    await userEvent.click(copyBtn);

    const expectedSummary = [
      "🎄 **Winter Secret Santa 2026 — Reveal Day Pairings** 🎁",
      "||Alice ➜ Bob||",
      "||Bob ➜ Cleo||",
      "||Cleo ➜ Alice||",
    ].join("\n");

    expect(writeTextMock).toHaveBeenCalledWith(expectedSummary);
  });

  it("handles clipboard writeText rejection gracefully", async () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error("Clipboard denied"));
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

    render(<RevealRing ring={ring} />);
    const nextBtn = screen.getByRole("button", { name: /reveal/i });
    for (let i = 0; i < ring.steps.length; i++) {
      await userEvent.click(nextBtn);
    }

    const copyBtn = screen.getByRole("button", { name: /copy discord summary/i });
    await userEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalled();
    expect(screen.queryByText(/copied to clipboard/i)).not.toBeInTheDocument();
  });
});


