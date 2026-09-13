import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SecretCardChoices } from "./SecretCardChoices";
import { cashInCardAction, chooseBuiltCardAction } from "@/app/s/actions";
import type { Commander } from "@/lib/scryfall/types";
import { soloPick } from "@/lib/pairing";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/app/s/actions", () => ({
  cashInCardAction: vi.fn(),
  chooseBuiltCardAction: vi.fn(),
}));

function card(id: string): Commander {
  return {
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
  };
}

describe("SecretCardChoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cashInCardAction).mockResolvedValue({ ok: true, message: "done" });
  });

  it("requires confirmation before spending the one-time cash-in", async () => {
    render(
      <SecretCardChoices
        cards={[soloPick(card("one")), soloPick(card("two")), soloPick(card("three"))]}
        cashInUsed={false}
        token="private-token"
      />
    );

    expect(screen.getByText(/fourth choice stays completely hidden/i)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: /trade this card/i })[1]);
    expect(cashInCardAction).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /use my one cash-in/i }));
    expect(cashInCardAction).toHaveBeenCalledWith("private-token", 1);
    expect(refresh).toHaveBeenCalled();
  });

  it("removes every trade control after the cash-in is used", () => {
    render(
      <SecretCardChoices
        cards={[soloPick(card("one")), soloPick(card("two")), soloPick(card("four"))]}
        cashInUsed
        token="private-token"
      />
    );
    expect(screen.queryByRole("button", { name: /trade this card/i })).not.toBeInTheDocument();
    expect(screen.getByText(/final three choices/i)).toBeInTheDocument();
  });
});

describe("saying which one is being built", () => {
  const cards = [soloPick(card("a")), soloPick(card("b")), soloPick(card("c"))];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Asked here because nothing can recover it later: the shortlist is stored,
  // the choice made from it is not, and reveal day wants to show both.
  it("records the choice against the card's own id", async () => {
    vi.mocked(chooseBuiltCardAction).mockResolvedValue({ ok: true, message: "Noted" });
    render(<SecretCardChoices cards={cards} cashInUsed={false} token="tok" />);

    await userEvent.click(
      screen.getAllByRole("button", { name: /building this one/i })[1]
    );

    expect(chooseBuiltCardAction).toHaveBeenCalledWith("tok", "b");
  });

  it("marks the chosen card and offers no second choice on it", () => {
    render(
      <SecretCardChoices builtPickId="b" cards={cards} cashInUsed={false} token="tok" />
    );

    expect(screen.getByText(/You are building this one/i)).toBeInTheDocument();
    // Two cards still offer the choice; the third shows it as made.
    expect(screen.getAllByRole("button", { name: /building this one/i })).toHaveLength(2);
  });

  it("lets a builder go back to undecided", async () => {
    vi.mocked(chooseBuiltCardAction).mockResolvedValue({ ok: true, message: "Cleared" });
    render(
      <SecretCardChoices builtPickId="b" cards={cards} cashInUsed={false} token="tok" />
    );

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(chooseBuiltCardAction).toHaveBeenCalledWith("tok", null);
  });

  it("surfaces a refusal rather than appearing to have saved", async () => {
    vi.mocked(chooseBuiltCardAction).mockResolvedValue({
      ok: false,
      error: "That card is not one of the three on your shortlist.",
    });
    render(<SecretCardChoices cards={cards} cashInUsed={false} token="tok" />);

    await userEvent.click(
      screen.getAllByRole("button", { name: /building this one/i })[0]
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/not one of the three/i);
  });

  it("still asks after the cash-in is spent", () => {
    // The trade controls go, but the question does not: most builders decide
    // what to build long after they have spent the trade.
    render(<SecretCardChoices cards={cards} cashInUsed token="tok" />);

    expect(screen.getAllByRole("button", { name: /building this one/i })).toHaveLength(3);
  });
});

describe("researching the three", () => {
  const priced = (id: string) => ({
    ...card(id),
    priceUsd: "2.50",
    scryfallUrl: `https://scryfall.com/card/${id}`,
  });

  it("prices and links every card on the shortlist", () => {
    // The browser has carried these all along; this is the screen where the
    // one decision of the event gets made, and it had a picture and a name.
    render(
      <SecretCardChoices
        cards={[soloPick(priced("one")), soloPick(priced("two")), soloPick(priced("three"))]}
        cashInUsed={false}
        token="tok"
      />
    );

    expect(screen.getAllByText("~$2.50")).toHaveLength(3);
    expect(screen.getAllByRole("link", { name: /Scryfall/i })).toHaveLength(3);
    expect(screen.getAllByRole("link", { name: /EDHREC/i })).toHaveLength(3);
  });

  it("prices both halves of a pair, which are two cards to buy", () => {
    render(
      <SecretCardChoices
        cards={[{ commander: priced("front"), partner: priced("back") }]}
        cashInUsed
        token="tok"
      />
    );

    expect(screen.getAllByText("~$2.50")).toHaveLength(2);
    // Named, so it is clear which price and links belong to which half.
    expect(screen.getByText("Commander front")).toBeInTheDocument();
    expect(screen.getByText("Commander back")).toBeInTheDocument();
  });
});
