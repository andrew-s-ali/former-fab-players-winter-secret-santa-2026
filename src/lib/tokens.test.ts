import { describe, expect, it } from "vitest";
import { mintToken } from "./tokens";

describe("mintToken", () => {
  it("is URL-safe base64 with no padding", () => {
    expect(mintToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("carries at least 128 bits of entropy", () => {
    // 16 bytes base64url-encodes to 22 characters.
    expect(mintToken().length).toBeGreaterThanOrEqual(22);
  });

  it("does not repeat across many mints", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => mintToken()));

    expect(tokens.size).toBe(1000);
  });
});
