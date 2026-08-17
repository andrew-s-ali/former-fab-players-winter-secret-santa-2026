import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CommanderDetail } from "./CommanderDetail";

const card = {
  id: "a",
  name: "Anara, Wolvid Familiar",
  manaCost: "{3}{G}",
  typeLine: "Legendary Creature — Wolf",
  oracleText: "Partner. Commander creatures you own have hexproof.",
  colorIdentity: ["G"],
  imageUrl: "https://cards.scryfall.io/normal/anara.jpg",
  scryfallUrl: "https://scryfall.com/anara",
  hasPartner: true,
  canPair: true,
  setName: "Commander Legends",
  rarity: "uncommon",
};

describe("CommanderDetail", () => {
  it("names the printing that makes it legal", () => {
    render(<CommanderDetail card={card} onClose={() => {}} />);

    expect(screen.getByText(/uncommon in Commander Legends/i)).toBeInTheDocument();
  });

  it("shows the oracle text and type line", () => {
    render(<CommanderDetail card={card} onClose={() => {}} />);

    expect(screen.getByText(/hexproof/)).toBeInTheDocument();
    expect(screen.getByText("Legendary Creature — Wolf")).toBeInTheDocument();
  });

  it("marks a commander that can be paired", () => {
    render(<CommanderDetail card={card} onClose={() => {}} />);

    expect(screen.getByText(/can pair/i)).toBeInTheDocument();
  });

  it("omits the pair badge for a card that cannot pair", () => {
    render(<CommanderDetail card={{ ...card, canPair: false }} onClose={() => {}} />);

    expect(screen.queryByText(/can pair/i)).not.toBeInTheDocument();
  });

  it("closes when the close button is used", async () => {
    const onClose = vi.fn();
    render(<CommanderDetail card={card} onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(onClose).toHaveBeenCalled();
  });
});
