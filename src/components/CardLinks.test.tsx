import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CardLinks } from "./CardLinks";

const card = {
  name: "Anara, Wolvid Familiar",
  scryfallUrl: "https://scryfall.com/card/cmr/anara",
  priceUsd: "1.42",
  priceIsFoil: false,
};

describe("CardLinks", () => {
  it("prices the card, because the budget is for the whole deck", () => {
    render(<CardLinks card={card} />);

    expect(screen.getByText("~$1.42")).toBeInTheDocument();
  });

  it("marks a price that is only available in foil", () => {
    render(<CardLinks card={{ ...card, priceIsFoil: true }} />);

    expect(screen.getByText(/~\$1\.42 \(foil\)/)).toBeInTheDocument();
  });

  it("says a price is missing rather than leaving a blank", () => {
    // A blank reads as free; this reads as "Scryfall does not know".
    render(<CardLinks card={{ ...card, priceUsd: null }} />);

    expect(screen.getByText(/no price on Scryfall/i)).toBeInTheDocument();
  });

  it("links out to the three places a builder actually researches", () => {
    render(<CardLinks card={card} />);

    expect(screen.getByRole("link", { name: /Scryfall/i })).toHaveAttribute(
      "href",
      card.scryfallUrl
    );
    expect(screen.getByRole("link", { name: /EDHREC/i })).toHaveAttribute(
      "href",
      "https://edhrec.com/commanders/anara-wolvid-familiar"
    );
    expect(screen.getByRole("link", { name: /Moxfield/i })).toHaveAttribute(
      "href",
      expect.stringContaining("commander=Anara%2C%20Wolvid%20Familiar")
    );
  });

  it("names the card in each link, since three cards carry three sets", () => {
    // "Scryfall" three times over tells a screen reader nothing about which
    // of the shortlist it would open.
    render(<CardLinks card={card} />);

    for (const site of ["Scryfall", "EDHREC", "Moxfield"]) {
      expect(
        screen.getByRole("link", { name: new RegExp(`${site}.*${card.name}|${card.name}.*${site}`) })
      ).toBeInTheDocument();
    }
  });

  it("opens them away from the page somebody is working on", () => {
    render(<CardLinks card={card} />);

    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });
});
