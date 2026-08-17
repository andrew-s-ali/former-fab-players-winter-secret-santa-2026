import { describe, expect, it } from "vitest";
import { THEME_PROMPTS, pickPrompt } from "./prompts";

describe("THEME_PROMPTS", () => {
  it("offers a decent spread of ideas", () => {
    expect(THEME_PROMPTS.length).toBeGreaterThanOrEqual(20);
  });

  it("has no duplicates", () => {
    expect(new Set(THEME_PROMPTS).size).toBe(THEME_PROMPTS.length);
  });

  it("has no blank entries", () => {
    expect(THEME_PROMPTS.every((p) => p.trim().length > 0)).toBe(true);
  });
});

describe("pickPrompt", () => {
  it("picks using the injected rng", () => {
    expect(pickPrompt(() => 0)).toBe(THEME_PROMPTS[0]);
  });

  it("stays in bounds at the top of the rng range", () => {
    expect(pickPrompt(() => 1 - Number.EPSILON)).toBe(
      THEME_PROMPTS[THEME_PROMPTS.length - 1]
    );
  });
});
