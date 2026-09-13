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

    await userEvent.click(screen.getByRole("button", { name: /reveal the next/i }));

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
      "🎄 **Winter Secret Santa 2026 Exchange — Reveal Day Pairings** 🎁",
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

describe("the shortlist under the ring", () => {
  const commander = (id: string) => ({
    id,
    name: `Commander ${id}`,
    manaCost: "",
    typeLine: "Legendary Creature",
    oracleText: "",
    colorIdentity: [],
    imageUrl: null,
    scryfallUrl: `https://example.com/${id}`,
    hasPartner: false,
    canPair: false,
    setName: "Test",
    rarity: "uncommon",
    priceUsd: null,
    priceIsFoil: false,
    pairingRole: null,
  });
  const pick = (id: string) => ({ commander: commander(id), partner: null });

  const builds = [
    {
      cards: [pick("ada-1"), pick("ada-2"), pick("ada-3")],
      builtPickId: "ada-2",
      decklistUrl: "https://moxfield.com/decks/ada",
    },
    { cards: [pick("bob-1"), pick("bob-2"), pick("bob-3")], builtPickId: null, decklistUrl: null },
    null,
  ];

  it("shows nothing before the first reveal", () => {
    render(<RevealRing builds={builds} ring={ring} />);

    expect(screen.queryByText(/had to choose from/i)).not.toBeInTheDocument();
  });

  it("shows only the pair just revealed", async () => {
    render(<RevealRing builds={builds} ring={ring} />);

    await userEvent.click(screen.getByRole("button", { name: /reveal the next/i }));

    // The cards are a recipient's pool; three of them beside a name would give
    // away a pairing that has not been revealed yet.
    expect(screen.getByText(/What Ada had to choose from for Bob/i)).toBeInTheDocument();
    expect(screen.getByText("Commander ada-1")).toBeInTheDocument();
    expect(screen.queryByText("Commander bob-1")).not.toBeInTheDocument();
  });

  it("moves on with the ring", async () => {
    render(<RevealRing builds={builds} ring={ring} />);

    await userEvent.click(screen.getByRole("button", { name: /reveal the next/i }));
    await userEvent.click(screen.getByRole("button", { name: /reveal the next/i }));

    expect(screen.getByText("Commander bob-1")).toBeInTheDocument();
    expect(screen.queryByText("Commander ada-1")).not.toBeInTheDocument();
  });

  it("keeps the answer back until asked", async () => {
    // The shortlist is the question. Showing the built card beside it throws
    // away the moment the whole page is built around.
    render(<RevealRing builds={builds} ring={ring} />);

    await userEvent.click(screen.getByRole("button", { name: /reveal the next/i }));

    expect(screen.getByText(/Which one did they build\?/i)).toBeInTheDocument();
    expect(screen.queryByText(/Built this one/i)).not.toBeInTheDocument();
    // The decklist goes with it: those URLs are named after the deck.
    expect(screen.queryByRole("link", { name: /decklist/i })).not.toBeInTheDocument();
  });

  it("marks the built card and links the decklist once asked", async () => {
    render(<RevealRing builds={builds} ring={ring} />);

    await userEvent.click(screen.getByRole("button", { name: /reveal the next/i }));
    await userEvent.click(screen.getByRole("button", { name: /reveal what Ada built/i }));

    expect(screen.getByText(/Built this one/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ada.s decklist/i })).toHaveAttribute(
      "href",
      "https://moxfield.com/decks/ada"
    );
  });

  it("starts the next builder's answer hidden again", async () => {
    // Without a remount per step, one reveal would leave every later builder's
    // deck already showing.
    const twice = [
      { cards: [pick("ada-1"), pick("ada-2")], builtPickId: "ada-2", decklistUrl: null },
      { cards: [pick("bob-1"), pick("bob-2")], builtPickId: "bob-2", decklistUrl: null },
      null,
    ];
    render(<RevealRing builds={twice} ring={ring} />);

    await userEvent.click(screen.getByRole("button", { name: /reveal the next/i }));
    await userEvent.click(screen.getByRole("button", { name: /reveal what Ada built/i }));
    await userEvent.click(screen.getByRole("button", { name: /reveal the next/i }));

    expect(screen.queryByText(/Built this one/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reveal what Bob built/i })
    ).toBeInTheDocument();
  });

  it("offers nothing to reveal for a builder who never decided", async () => {
    render(<RevealRing builds={builds} ring={ring} />);

    await userEvent.click(screen.getByRole("button", { name: /reveal the next/i }));
    await userEvent.click(screen.getByRole("button", { name: /reveal the next/i }));

    expect(screen.getByText(/What Bob had to choose from/i)).toBeInTheDocument();
    // No deck and no decklist, so there is no button promising one.
    expect(screen.queryByRole("button", { name: /reveal what Bob built/i })).toBeNull();
    expect(screen.queryByText(/Which one did they build\?/i)).toBeNull();
  });

  it("still reveals a pairing whose shortlist is missing", async () => {
    // A builder who never opened their link has no stored set, and reveal day
    // must carry on rather than fail on them.
    render(<RevealRing builds={builds} ring={ring} />);

    for (let i = 0; i < 3; i += 1) {
      const button = screen.queryByRole("button", { name: /reveal the next/i });
      if (button) await userEvent.click(button);
    }

    expect(screen.getByText(/Cleo gave to Ada/i)).toBeInTheDocument();
    expect(screen.queryByText(/had to choose from/i)).not.toBeInTheDocument();
  });

  it("renders the ring alone when no shortlists are passed at all", async () => {
    render(<RevealRing ring={ring} />);

    await userEvent.click(screen.getByRole("button", { name: /reveal/i }));

    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.queryByText(/had to choose from/i)).not.toBeInTheDocument();
  });
});
