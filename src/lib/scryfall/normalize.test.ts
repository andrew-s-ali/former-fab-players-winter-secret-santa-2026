import { describe, expect, it } from "vitest";
import { normalizeCard } from "./normalize";
import type { ScryfallCard } from "./types";

const normalCard: ScryfallCard = {
  id: "50a22ad6-d2a4-48a6-91c9-147c946a60a5",
  name: "Aang, A Lot to Learn",
  mana_cost: "{2}{G/W}",
  type_line: "Legendary Creature — Human Avatar Ally",
  oracle_text: "Aang has vigilance as long as there's a Lesson card in your graveyard.",
  color_identity: ["G", "W"],
  keywords: [],
  layout: "normal",
  scryfall_uri: "https://scryfall.com/card/tle/146/aang-a-lot-to-learn",
  image_uris: { normal: "https://cards.scryfall.io/normal/aang.jpg" },
  set_name: "Commander 2019",
  rarity: "uncommon",
};

const transformCard: ScryfallCard = {
  id: "b1f0c0de-0000-4000-8000-000000000001",
  name: "Exdeath, Void Warlock // Neo Exdeath, Dimension's End",
  type_line: "Legendary Creature — Human Warlock // Legendary Creature — Void Avatar",
  color_identity: ["B", "U"],
  keywords: [],
  layout: "transform",
  scryfall_uri: "https://scryfall.com/card/fin/95/exdeath-void-warlock",
  set_name: "Commander 2019",
  rarity: "uncommon",
  card_faces: [
    {
      name: "Exdeath, Void Warlock",
      mana_cost: "{2}{U}{B}",
      oracle_text: "Whenever you cast a spell, mill a card.",
      image_uris: { normal: "https://cards.scryfall.io/normal/exdeath-front.jpg" },
    },
    {
      name: "Neo Exdeath, Dimension's End",
      mana_cost: "",
      oracle_text: "Trample.",
      image_uris: { normal: "https://cards.scryfall.io/normal/exdeath-back.jpg" },
    },
  ],
};

const partnerCard: ScryfallCard = {
  id: "c2f0c0de-0000-4000-8000-000000000002",
  name: "Alena, Kessig Trapper",
  mana_cost: "{4}{R}",
  type_line: "Legendary Creature — Human Scout",
  oracle_text: "Partner (You can have two commanders if both have partner.)",
  color_identity: ["R"],
  keywords: ["First strike", "Partner"],
  layout: "normal",
  scryfall_uri: "https://scryfall.com/card/cma/104/alena-kessig-trapper",
  image_uris: { normal: "https://cards.scryfall.io/normal/alena.jpg" },
  set_name: "Commander 2019",
  rarity: "uncommon",
};

describe("normalizeCard", () => {
  it("maps a normal card's fields", () => {
    expect(normalizeCard(normalCard)).toEqual({
      id: "50a22ad6-d2a4-48a6-91c9-147c946a60a5",
      name: "Aang, A Lot to Learn",
      manaCost: "{2}{G/W}",
      typeLine: "Legendary Creature — Human Avatar Ally",
      oracleText:
        "Aang has vigilance as long as there's a Lesson card in your graveyard.",
      colorIdentity: ["G", "W"],
      imageUrl: "https://cards.scryfall.io/normal/aang.jpg",
      scryfallUrl: "https://scryfall.com/card/tle/146/aang-a-lot-to-learn",
      hasPartner: false,
      setName: "Commander 2019",
      rarity: "uncommon",
      canPair: false,
      priceUsd: null,
    });
  });

  it("extracts USD market price when available", () => {
    const card = normalizeCard({
      ...normalCard,
      prices: { usd: "0.45", usd_foil: "0.99" },
    });
    expect(card.priceUsd).toBe("0.45");
  });

  it("falls back to usd_foil if usd is null or missing", () => {
    const card = normalizeCard({
      ...normalCard,
      prices: { usd: null, usd_foil: "0.99" },
    });
    expect(card.priceUsd).toBe("0.99");
  });

  it("sets priceUsd to null when prices are missing or all null", () => {
    const card = normalizeCard(normalCard);
    expect(card.priceUsd).toBeNull();
  });

  it("carries the printing's set name and rarity", () => {
    const card = normalizeCard({ ...normalCard, set_name: "Foundations", rarity: "uncommon" });

    expect(card.setName).toBe("Foundations");
    expect(card.rarity).toBe("uncommon");
  });

  it("falls back to the first face's image for transform cards", () => {
    const result = normalizeCard(transformCard);

    expect(result.imageUrl).toBe(
      "https://cards.scryfall.io/normal/exdeath-front.jpg"
    );
    expect(result.manaCost).toBe("{2}{U}{B}");
    expect(result.oracleText).toContain("mill a card");
  });

  it("detects the Partner keyword", () => {
    expect(normalizeCard(partnerCard).hasPartner).toBe(true);
    expect(normalizeCard(normalCard).hasPartner).toBe(false);
  });

  it("returns null imageUrl when no face has an image", () => {
    const imageless: ScryfallCard = { ...normalCard, image_uris: undefined };
    expect(normalizeCard(imageless).imageUrl).toBeNull();
  });
});
