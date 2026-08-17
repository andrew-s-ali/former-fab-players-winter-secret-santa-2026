import { describe, expect, it } from "vitest";
import { THEME_PROMPTS, pickPrompt, randomPrompt } from "./prompts";

describe("THEME_PROMPTS", () => {
  it("offers a decent spread of ideas", () => {
    expect(THEME_PROMPTS.length).toBeGreaterThanOrEqual(20);
  });

  it("has no duplicates", () => {
    const texts = THEME_PROMPTS.map((p) => p.text);
    expect(new Set(texts).size).toBe(THEME_PROMPTS.length);
  });

  it("has no blank entries", () => {
    expect(THEME_PROMPTS.every((p) => p.text.trim().length > 0)).toBe(true);
  });
});

describe("pickPrompt", () => {
  it("picks using the injected rng", () => {
    expect(pickPrompt(() => 0)).toEqual(THEME_PROMPTS[0]);
  });

  it("stays in bounds at the top of the rng range", () => {
    expect(pickPrompt(() => 1 - Number.EPSILON)).toEqual(
      THEME_PROMPTS[THEME_PROMPTS.length - 1]
    );
  });

  it("returns structured theme prompt objects with text and optional keyword", () => {
    const prompt = randomPrompt();
    expect(prompt).toHaveProperty("text");
    expect(typeof prompt.text).toBe("string");
  });
});
