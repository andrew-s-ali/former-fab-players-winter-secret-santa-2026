import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CommanderDetail, edhrecSlug } from "./CommanderDetail";

describe("edhrecSlug", () => {
  it("converts simple names to lowercase hyphenated slugs", () => {
    expect(edhrecSlug("Anara, Wolvid Familiar")).toBe("anara-wolvid-familiar");
  });

  it("handles double-faced card slash separators", () => {
    expect(edhrecSlug("Exdeath, Void Warlock // Neo Exdeath, Dimension's End")).toBe(
      "exdeath-void-warlock-neo-exdeath-dimensions-end"
    );
  });

  it("strips accents and special punctuation", () => {
    expect(edhrecSlug("Séance, Master of Spirits' & Demons")).toBe(
      "seance-master-of-spirits-demons"
    );
  });
});

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
  priceUsd: null,
  priceIsFoil: false,
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

  it("omits the image when the card has none", () => {
    render(<CommanderDetail card={{ ...card, imageUrl: null }} onClose={() => {}} />);

    expect(screen.queryByAltText(card.name)).not.toBeInTheDocument();
  });

  it("names a non-uncommon rarity as-is", () => {
    render(<CommanderDetail card={{ ...card, rarity: "rare" }} onClose={() => {}} />);

    expect(screen.getByText(/rare in Commander Legends/i)).toBeInTheDocument();
  });

  it("renders external EDHREC, Moxfield, and Scryfall links", () => {
    render(<CommanderDetail card={card} onClose={vi.fn()} />);
    const edhrecLink = screen.getByRole("link", { name: /view on edhrec/i });
    expect(edhrecLink).toHaveAttribute(
      "href",
      "https://edhrec.com/commanders/anara-wolvid-familiar"
    );
    expect(edhrecLink).toHaveAttribute("target", "_blank");
    expect(edhrecLink).toHaveAttribute("rel", "noopener noreferrer");

    const moxfieldLink = screen.getByRole("link", { name: /search moxfield/i });
    expect(moxfieldLink).toHaveAttribute(
      "href",
      "https://www.moxfield.com/decks/public/advanced?format=commander&commander=Anara%2C%20Wolvid%20Familiar"
    );
    expect(moxfieldLink).toHaveAttribute("target", "_blank");
    expect(moxfieldLink).toHaveAttribute("rel", "noopener noreferrer");

    const scryfallLink = screen.getByRole("link", { name: /view on scryfall/i });
    expect(scryfallLink).toHaveAttribute("href", card.scryfallUrl);
    expect(scryfallLink).toHaveAttribute("target", "_blank");
    expect(scryfallLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders the price tag if priceUsd is present", () => {
    render(
      <CommanderDetail
        card={{ ...card, priceUsd: "0.75" }}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("~$0.75")).toBeInTheDocument();
  });

  it("omits the price tag if priceUsd is null", () => {
    render(<CommanderDetail card={{ ...card, priceUsd: null }} onClose={vi.fn()} />);
    expect(screen.queryByText(/~\$/)).not.toBeInTheDocument();
  });
});
