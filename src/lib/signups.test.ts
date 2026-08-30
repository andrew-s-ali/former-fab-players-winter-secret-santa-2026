import { describe, expect, it } from "vitest";
import { signupContentId } from "./signups";
import type { ParticipantInput } from "./signup";
import { testCommander, testPairPick } from "@/test-support/cards";
import { soloPick, type CommanderPick } from "./pairing";

const cards: [CommanderPick, CommanderPick] = [
  soloPick(testCommander("one")),
  soloPick(testCommander("two")),
];

function input(overrides: Partial<ParticipantInput> = {}): ParticipantInput {
  return {
    name: "Ada",
    email: "ada@example.com",
    colorVeto: "R",
    themeVeto: "mill",
    themeWish: "elves",
    selfCards: [
      { commander: "Card one", partner: null },
      { commander: "Card two", partner: null },
    ],
    exchangeRanking: null,
    ...overrides,
  };
}

describe("signupContentId", () => {
  // Netlify's form event carries no submission id and retries an errored
  // invocation, so the answers themselves are the idempotency key.
  it("is stable for the same answers", () => {
    expect(signupContentId(input(), cards)).toBe(signupContentId(input(), cards));
  });

  it("ignores how the picked card names were capitalised", () => {
    expect(
      signupContentId(
        input({
          selfCards: [
            { commander: "CARD ONE", partner: null },
            { commander: "card two", partner: null },
          ],
          exchangeRanking: null,
        }),
        cards
      )
    ).toBe(signupContentId(input(), cards));
  });

  // Changing only the partner is a different submission, not a retry.
  it("changes when a partner is added", () => {
    expect(
      signupContentId(input(), [testPairPick("one", "extra"), cards[1]])
    ).not.toBe(signupContentId(input(), cards));
  });

  it("changes when a card changes", () => {
    expect(
      signupContentId(input(), [
        soloPick(testCommander("one")),
        soloPick(testCommander("three")),
      ])
    ).not.toBe(signupContentId(input(), cards));
  });

  it.each(["colorVeto", "themeVeto", "themeWish", "name", "email"] as const)(
    "changes when %s changes",
    (field) => {
      const changed =
        field === "colorVeto"
          ? "G"
          : field === "email"
            ? "moved@example.com"
            : "something else";
      expect(signupContentId(input({ [field]: changed }), cards)).not.toBe(
        signupContentId(input(), cards)
      );
    }
  );

  it("is a short hex string, not the payload itself", () => {
    expect(signupContentId(input(), cards)).toMatch(/^[0-9a-f]{32}$/);
  });
});
