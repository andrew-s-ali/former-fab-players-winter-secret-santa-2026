import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
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
});
