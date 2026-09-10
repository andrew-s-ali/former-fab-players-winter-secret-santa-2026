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
  discord: null,
  exchangeRanking: null,
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

  it("builds a recipient pool from their sign-up picks and every peer pick", () => {
    // Squeezed to exactly four candidates so the draw has no choice about what
    // comes back: B's two sign-up picks, one card C and D both chose, and A's
    // own recommendation. A's used to be filtered out for the giver A, which
    // would leave three here and return null.
    const shared = soloPick(card("c-and-d-agree"));
    const rows = completeRows().map((row) =>
      row.recipientId === "b" && row.selectorId !== "a"
        ? { ...row, card: shared }
        : row
    );

    const picked = pickSecretCards(rows, byId("b"), () => 0.5);

    expect(picked).toHaveLength(4);
    expect(picked?.some((choice) => choice.commander.id === "a-b")).toBe(true);
    expect(
      picked?.filter((choice) => choice.commander.id.startsWith("b-self"))
    ).toHaveLength(2);
  });

  it("ignores a self row left in the table by an earlier version", () => {
    const rows = [
      ...completeRows(),
      { selectorId: "b", recipientId: "b", card: soloPick(card("stale")) },
    ];

    expect(selectionsAreReady(rows, participants)).toBe(true);
    expect(
      pickSecretCards(rows, byId("b"), () => 0.5)?.some(
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

    expect(pickSecretCards(rows, b, () => 0.5)).toBeNull();
    expect(selectionsAreReady(rows, flattened)).toBe(false);
  });

  it("leaves three people no slack, which is why four is the floor", () => {
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
    // Two sign-up picks plus two recommendations: exactly the four needed, and
    // only while every one of them is different.
    expect(selectionsAreReady(rows, three)).toBe(true);

    // One duplicate anywhere and that pool can never reach four, however long
    // the group waits — there is no third recommendation to make up the gap.
    // At four participants the same slip still leaves a fillable pool.
    const [first] = three;
    let collapsed = false;
    const withDuplicate = rows.map((row) => {
      if (collapsed || row.recipientId !== first.id) {
        return row;
      }
      collapsed = true;
      return { ...row, card: first.selfCards[0] };
    });

    expect(selectionsAreReady(withDuplicate, three)).toBe(false);
  });
});
