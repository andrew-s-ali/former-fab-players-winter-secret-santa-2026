import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DemoCardTrade } from "./DemoCardTrade";
import * as actions from "@/app/s/actions";
import { soloPick, type CommanderPick } from "@/lib/pairing";
import { testCommander } from "@/test-support/cards";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/s/actions", () => ({ cashInCardAction: vi.fn() }));

const shortlist: [CommanderPick, CommanderPick, CommanderPick, CommanderPick] = [
  soloPick(testCommander("a", { name: "First" })),
  soloPick(testCommander("b", { name: "Second" })),
  soloPick(testCommander("c", { name: "Third" })),
  soloPick(testCommander("d", { name: "Hidden Fourth" })),
];

function visibleNames() {
  return screen
    .getAllByRole("heading", { level: 3 })
    .map((node) => node.textContent);
}

describe("DemoCardTrade", () => {
  it("shows three of the four, holding the fourth back", () => {
    render(<DemoCardTrade shortlist={shortlist} token="demo" />);

    expect(visibleNames()).toEqual(["First", "Second", "Third"]);
    expect(screen.queryByText("Hidden Fourth")).toBeNull();
  });

  it("trades the chosen card for the hidden one, which lands last", async () => {
    const user = userEvent.setup();
    render(<DemoCardTrade shortlist={shortlist} token="demo" />);

    await user.click(screen.getAllByRole("button", { name: /trade this/i })[1]);
    await user.click(screen.getByRole("button", { name: /use my one cash-in/i }));

    // "Second" is gone and the fourth is appended, matching visibleShortlist.
    await waitFor(() =>
      expect(visibleNames()).toEqual(["First", "Third", "Hidden Fourth"])
    );
  });

  // The whole point of a one-time trade is that it is one-time.
  it("removes every trade control once the cash-in is spent", async () => {
    const user = userEvent.setup();
    render(<DemoCardTrade shortlist={shortlist} token="demo" />);

    await user.click(screen.getAllByRole("button", { name: /trade this/i })[0]);
    await user.click(screen.getByRole("button", { name: /use my one cash-in/i }));

    await waitFor(() =>
      expect(screen.queryAllByRole("button", { name: /trade this/i })).toHaveLength(0)
    );
    expect(screen.getByText(/cash-in is spent/i)).toBeInTheDocument();
  });

  it("names what was traded, and can be reset to try again", async () => {
    const user = userEvent.setup();
    render(<DemoCardTrade shortlist={shortlist} token="demo" />);

    await user.click(screen.getAllByRole("button", { name: /trade this/i })[0]);
    await user.click(screen.getByRole("button", { name: /use my one cash-in/i }));
    expect(await screen.findByText(/You traded/)).toHaveTextContent("First");

    await user.click(screen.getByRole("button", { name: /reset the demo/i }));

    await waitFor(() =>
      expect(visibleNames()).toEqual(["First", "Second", "Third"])
    );
    expect(screen.getAllByRole("button", { name: /trade this/i })).toHaveLength(3);
  });

  // The demo routes must never reach the database, and the cash-in is the one
  // control on the page that writes.
  it("never calls the real cash-in action", async () => {
    const user = userEvent.setup();
    render(<DemoCardTrade shortlist={shortlist} token="demo" />);

    await user.click(screen.getAllByRole("button", { name: /trade this/i })[0]);
    await user.click(screen.getByRole("button", { name: /use my one cash-in/i }));

    await waitFor(() => expect(screen.getByText(/cash-in is spent/i)).toBeInTheDocument());
    expect(actions.cashInCardAction).not.toHaveBeenCalled();
  });
});
