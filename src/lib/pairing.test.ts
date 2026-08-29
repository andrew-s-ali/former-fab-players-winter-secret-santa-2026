import { describe, expect, it } from "vitest";
import {
  canBePrimary,
  canPairWith,
  canTakePartner,
  describeIllegalPick,
  isBannedPair,
  isLegalPick,
  pairingRoleOf,
  partnersFor,
  pickColorIdentity,
  pickId,
  pickName,
  soloPick,
} from "./pairing";
import { testCommander } from "@/test-support/cards";
import type { PairingRole } from "./scryfall/types";

function card(
  name: string,
  role: PairingRole | null,
  colorIdentity: string[] = []
) {
  return testCommander(name.toLowerCase().replace(/\W+/g, "-"), {
    name,
    pairingRole: role,
    colorIdentity,
  });
}

describe("pairingRoleOf", () => {
  it("reads a Background off the type line", () => {
    expect(
      pairingRoleOf({ typeLine: "Legendary Enchantment — Background", oracleText: "" })
    ).toBe("background");
  });

  it("reads 'Choose a Background' off the rules text", () => {
    expect(
      pairingRoleOf({
        typeLine: "Legendary Creature — Human",
        oracleText: "Choose a Background (You can have a Background as a second commander.)",
        keywords: [],
      })
    ).toBe("choose-background");
  });

  it("reads plain Partner off the keywords", () => {
    expect(
      pairingRoleOf({
        typeLine: "Legendary Creature — Elf",
        oracleText: "Partner (You can have two commanders if both have partner.)",
        keywords: ["Partner"],
      })
    ).toBe("partner");
  });

  // "Partner with <name>" pairs with exactly one card. Treating it as generic
  // would offer 29 illegal partners, so it is refused until handled properly.
  it("refuses to treat 'Partner with <name>' as a plain Partner", () => {
    expect(
      pairingRoleOf({
        typeLine: "Legendary Creature — Human",
        oracleText: "Partner with Kydele, Chosen of Kruphix",
        keywords: ["Partner", "Partner with"],
      })
    ).toBeNull();
  });

  it("returns null for an ordinary commander", () => {
    expect(
      pairingRoleOf({ typeLine: "Legendary Creature — Goblin", oracleText: "Haste.", keywords: [] })
    ).toBeNull();
  });
});

describe("what can lead a deck", () => {
  it("refuses a Background as a commander in its own right", () => {
    expect(canBePrimary(card("Street Urchin", "background"))).toBe(false);
  });

  it("allows everything else", () => {
    expect(canBePrimary(card("Alena", "partner"))).toBe(true);
    expect(canBePrimary(card("Abdel", "choose-background"))).toBe(true);
    expect(canBePrimary(card("Plain Legend", null))).toBe(true);
  });

  it("knows which commanders can take a partner at all", () => {
    expect(canTakePartner(card("Alena", "partner"))).toBe(true);
    expect(canTakePartner(card("Abdel", "choose-background"))).toBe(true);
    expect(canTakePartner(card("Plain Legend", null))).toBe(false);
  });
});

describe("canPairWith", () => {
  const alena = card("Alena", "partner");
  const halana = card("Halana", "partner");
  const abdel = card("Abdel", "choose-background");
  const urchin = card("Street Urchin", "background");
  const plain = card("Plain Legend", null);

  it("pairs plain Partner with plain Partner", () => {
    expect(canPairWith(alena, halana)).toBe(true);
  });

  it("pairs a Background chooser with a Background", () => {
    expect(canPairWith(abdel, urchin)).toBe(true);
  });

  it("refuses to cross the two systems", () => {
    expect(canPairWith(alena, urchin)).toBe(false);
    expect(canPairWith(abdel, halana)).toBe(false);
  });

  it("refuses two Backgrounds", () => {
    expect(canPairWith(urchin, card("Other Background", "background"))).toBe(false);
  });

  it("refuses anything with a commander that cannot pair", () => {
    expect(canPairWith(plain, halana)).toBe(false);
  });

  it("refuses a card partnered with itself", () => {
    expect(canPairWith(alena, alena)).toBe(false);
  });
});

describe("the event's banned pairings", () => {
  const malcolm = card("Malcolm, Keen-Eyed Navigator", "partner");
  const kediss = card("Kediss, Emberclaw Familiar", "partner");

  it("refuses the banned combination in either order", () => {
    expect(isBannedPair(malcolm, kediss)).toBe(true);
    expect(isBannedPair(kediss, malcolm)).toBe(true);
    expect(canPairWith(malcolm, kediss)).toBe(false);
  });

  it("leaves each half legal with somebody else", () => {
    const other = card("Alena", "partner");
    expect(canPairWith(malcolm, other)).toBe(true);
    expect(canPairWith(kediss, other)).toBe(true);
  });

  it("keeps a banned pairing out of the offered partners", () => {
    const pool = [malcolm, kediss, card("Alena", "partner")];
    expect(partnersFor(malcolm, pool).map((c) => c.name)).toEqual(["Alena"]);
  });
});

describe("a pick", () => {
  const alena = card("Alena", "partner", ["R", "G"]);
  const halana = card("Halana", "partner", ["G"]);
  const blue = card("Blue Partner", "partner", ["U"]);

  it("is identified the same however the halves were ordered", () => {
    expect(pickId({ commander: alena, partner: halana })).toBe(
      pickId({ commander: halana, partner: alena })
    );
  });

  it("is named with both halves", () => {
    expect(pickName({ commander: alena, partner: halana })).toBe("Alena + Halana");
    expect(pickName(soloPick(alena))).toBe("Alena");
  });

  // A veto has to be checked against the pair, not either half: a partner can
  // bring in a colour the commander does not have.
  it("combines the colour identity of both halves", () => {
    expect(pickColorIdentity({ commander: alena, partner: blue }).sort()).toEqual([
      "G",
      "R",
      "U",
    ]);
  });

  it("is legal when the pairing is legal", () => {
    expect(isLegalPick({ commander: alena, partner: halana })).toBe(true);
    expect(isLegalPick(soloPick(alena))).toBe(true);
  });

  it("explains a Background submitted on its own", () => {
    expect(describeIllegalPick(soloPick(card("Street Urchin", "background")))).toMatch(
      /can only be the second half/
    );
  });

  it("explains an illegal partner", () => {
    expect(
      describeIllegalPick({
        commander: alena,
        partner: card("Street Urchin", "background"),
      })
    ).toMatch(/not a legal partner/);
  });

  it("explains a banned combination in its own words", () => {
    expect(
      describeIllegalPick({
        commander: card("Malcolm, Keen-Eyed Navigator", "partner"),
        partner: card("Kediss, Emberclaw Familiar", "partner"),
      })
    ).toMatch(/banned as a pair/);
  });
});
