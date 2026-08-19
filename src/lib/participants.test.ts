import { describe, expect, it } from "vitest";
import { isRevealed } from "./participants";

describe("isRevealed", () => {
  it("is false before the organiser unlocks it", () => {
    expect(isRevealed({ participants: [], revealedAt: null })).toBe(false);
  });

  it("is false when the field is absent from older stored data", () => {
    expect(isRevealed({ participants: [] } as never)).toBe(false);
  });

  it("is true once a timestamp is set", () => {
    expect(
      isRevealed({ participants: [], revealedAt: "2026-12-05T18:00:00.000Z" })
    ).toBe(true);
  });
});
