import { describe, expect, it } from "vitest";
import {
  pickSecretCards,
  requiredSelectionCount,
  selectionsAreReady,
  type SavedSelection,
} from "./card-pool";
import { soloPick, type CommanderPick } from "./pairing";
import { MINIMUM_PARTICIPANTS, type Participant } from "./participants";
import type { Commander } from "./scryfall/types";

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
    pairingRole: null,
  };
}

const participants: Participant[] = ["a", "b", "c", "d"].map((id) => ({
  id,
  name: id.toUpperCase(),
  email: `${id}@example.com`,
  recipientId: id === "a" ? "b" : id === "b" ? "c" : id === "c" ? "d" : "a",
  token: `token-${id}`,
  colorVeto: null,
  themeVeto: null,
  themeWish: null,
  // Chosen at sign-up, so they live on the participant rather than in the
  // selection rows.
  selfCards: [soloPick(card(`${id}-self-1`)), soloPick(card(`${id}-self-2`))],
}));

function byId(id: string): Participant {
  return participants.find((participant) => participant.id === id)!;
}

/** One row per ordered pair of different participants — no self rows. */
function completeRows(): SavedSelection[] {
  return participants.flatMap((selector) =>
    participants
      .filter((recipient) => recipient.id !== selector.id)
      .map((recipient) => ({
        selectorId: selector.id,
        recipientId: recipient.id,
        card: soloPick(card(`${selector.id}-${recipient.id}`)),
      }))
  );
}

describe("card selection rules", () => {
  it("requires one pick from every participant for every other participant", () => {
    expect(requiredSelectionCount(4)).toBe(12);
    expect(selectionsAreReady(completeRows(), participants)).toBe(true);
    expect(selectionsAreReady(completeRows().slice(1), participants)).toBe(false);
  });

  it("builds a recipient pool from their sign-up picks and non-giver peer picks", () => {
    const picked = pickSecretCards(completeRows(), "a", byId("b"), () => 0.5);

    expect(picked).toHaveLength(4);
    // A's own recommendation for B must not come back to A.
    expect(picked?.every((choice) => choice.commander.id !== "a-b")).toBe(true);
    // B's two sign-up picks are in the pool.
    expect(
      picked?.some((choice) => choice.commander.id.startsWith("b-self"))
    ).toBe(true);
  });

  it("ignores a self row left in the table by an earlier version", () => {
    const rows = [
      ...completeRows(),
      { selectorId: "b", recipientId: "b", card: soloPick(card("stale")) },
    ];

    expect(selectionsAreReady(rows, participants)).toBe(true);
    expect(
      pickSecretCards(rows, "a", byId("b"), () => 0.5)?.some(
        (choice) => choice.commander.id === "stale"
      )
    ).toBe(false);
  });

  it("refuses a pool with fewer than four unique cards", () => {
    const duplicate = soloPick(card("same-card"));
    const rows = completeRows().map((row) =>
      row.recipientId === "b" ? { ...row, card: duplicate } : row
    );
    // B's pool is now: two sign-up picks plus one duplicated recommendation,
    // minus A's own — three unique.
    const flattened = participants.map((participant) =>
      participant.id === "b"
        ? {
            ...participant,
            selfCards: [duplicate, duplicate] as [CommanderPick, CommanderPick],
          }
        : participant
    );
    const b = flattened.find((participant) => participant.id === "b")!;

    expect(pickSecretCards(rows, "a", b, () => 0.5)).toBeNull();
    expect(selectionsAreReady(rows, flattened)).toBe(false);
  });

  it("cannot be satisfied below the minimum participant count", () => {
    // Three people leave three cards in each pool once the giver's own is
    // removed, which is why the draw refuses to run below this.
    expect(MINIMUM_PARTICIPANTS).toBe(4);

    const three = participants.slice(0, 3).map((participant, index, all) => ({
      ...participant,
      recipientId: all[(index + 1) % all.length].id,
    }));
    const rows = three.flatMap((selector) =>
      three
        .filter((recipient) => recipient.id !== selector.id)
        .map((recipient) => ({
          selectorId: selector.id,
          recipientId: recipient.id,
          card: soloPick(card(`${selector.id}-${recipient.id}`)),
        }))
    );

    expect(rows).toHaveLength(requiredSelectionCount(3));
    expect(selectionsAreReady(rows, three)).toBe(false);
  });
});
