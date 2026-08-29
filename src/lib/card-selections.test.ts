import { describe, expect, it } from "vitest";
import {
  pickSecretCards,
  requiredSelectionCount,
  selectionsAreReady,
  type SavedSelection,
} from "./card-selections";
import type { Participant } from "./participants";
import type { Commander } from "./scryfall/types";

const participants: Participant[] = ["a", "b", "c", "d"].map((id) => ({
  id,
  name: id.toUpperCase(),
  recipientId: id === "a" ? "b" : id === "b" ? "c" : id === "c" ? "d" : "a",
  token: `token-${id}`,
  colorVeto: null,
  themeVeto: null,
  themeWish: null,
}));

function card(id: string): Commander {
  return {
    id,
    name: `Card ${id}`,
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
  };
}

function completeRows(): SavedSelection[] {
  return participants.flatMap((selector) =>
    participants.flatMap((recipient) => {
      const first = {
        selectorId: selector.id,
        recipientId: recipient.id,
        slot: 1,
        card: card(`${selector.id}-${recipient.id}-1`),
      };
      return selector.id === recipient.id
        ? [first, { ...first, slot: 2, card: card(`${selector.id}-${recipient.id}-2`) }]
        : [first];
    })
  );
}

describe("card selection rules", () => {
  it("requires two self picks and one pick for every other participant", () => {
    expect(requiredSelectionCount(4)).toBe(20);
    expect(selectionsAreReady(completeRows(), participants)).toBe(true);
    expect(selectionsAreReady(completeRows().slice(1), participants)).toBe(false);
  });

  it("builds a recipient pool from their own picks and non-giver peer picks", () => {
    const rows = completeRows();
    const picked = pickSecretCards(rows, "a", "b", () => 0.5);

    expect(picked).toHaveLength(4);
    expect(picked?.every((choice) => !choice.id.startsWith("a-b"))).toBe(true);
    expect(picked?.some((choice) => choice.id.startsWith("b-b"))).toBe(true);
  });

  it("refuses a pool with fewer than four unique cards", () => {
    const duplicate = card("same-card");
    const rows = completeRows().map((row) =>
      row.recipientId === "b" ? { ...row, card: duplicate } : row
    );
    expect(pickSecretCards(rows, "a", "b", () => 0.5)).toBeNull();
    expect(selectionsAreReady(rows, participants)).toBe(false);
  });
});
