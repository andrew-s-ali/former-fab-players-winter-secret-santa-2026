import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RevealDetails } from "./RevealDetails";

const recipient = {
  id: "p2",
  name: "Ada Lovelace",
  recipientId: "p3",
  token: "secret",
  colorVeto: "R" as const,
  themeVeto: "mill",
  themeWish: "something with elves",
};

describe("RevealDetails", () => {
  it("names the recipient", () => {
    render(<RevealDetails recipient={recipient} />);

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("shows both vetoes and the wish", () => {
    render(<RevealDetails recipient={recipient} />);

    expect(screen.getByText(/red/i)).toBeInTheDocument();
    expect(screen.getByText(/mill/)).toBeInTheDocument();
    expect(screen.getByText(/something with elves/)).toBeInTheDocument();
  });

  it("says so when a veto was left blank", () => {
    render(
      <RevealDetails
        recipient={{ ...recipient, colorVeto: null, themeVeto: null, themeWish: null }}
      />
    );

    expect(screen.getAllByText(/no preference/i).length).toBeGreaterThan(0);
  });

  it("shows set and unset fields side by side", () => {
    render(
      <RevealDetails
        recipient={{ ...recipient, colorVeto: "R", themeVeto: null, themeWish: "elves" }}
      />
    );

    expect(screen.getByText("Red")).toBeInTheDocument();
    expect(screen.getByText("elves")).toBeInTheDocument();
    expect(screen.getAllByText(/no preference/i)).toHaveLength(1);
  });

  it("names every colour it can be given", () => {
    for (const [code, name] of [
      ["W", "White"],
      ["U", "Blue"],
      ["B", "Black"],
      ["R", "Red"],
      ["G", "Green"],
    ] as const) {
      const { unmount } = render(
        <RevealDetails recipient={{ ...recipient, colorVeto: code }} />
      );

      expect(screen.getByText(name)).toBeInTheDocument();
      unmount();
    }
  });
});
