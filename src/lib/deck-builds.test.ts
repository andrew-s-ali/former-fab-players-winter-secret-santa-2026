import { describe, expect, it } from "vitest";
import { normalizeDecklistUrl } from "./deck-builds";

describe("normalizeDecklistUrl", () => {
  it("accepts an ordinary deck-site link", () => {
    expect(normalizeDecklistUrl("  https://moxfield.com/decks/abc  ")).toBe(
      "https://moxfield.com/decks/abc"
    );
  });

  it("accepts http as well as https", () => {
    expect(normalizeDecklistUrl("http://example.com/d")).toBe("http://example.com/d");
  });

  // The saved value comes back out as an href on the builder's own page, so
  // the scheme is checked rather than assumed.
  it("refuses a javascript: url", () => {
    expect(() => normalizeDecklistUrl("javascript:alert(1)")).toThrow(/https/);
  });

  it("refuses a data: url", () => {
    expect(() => normalizeDecklistUrl("data:text/html,<script>")).toThrow(/https/);
  });

  it("refuses something that is not a url at all", () => {
    expect(() => normalizeDecklistUrl("my deck")).toThrow(/doesn't look like a link/);
  });

  it("points at Remove rather than saving a blank", () => {
    expect(() => normalizeDecklistUrl("   ")).toThrow(/Remove/);
  });

  it("refuses an absurdly long link", () => {
    expect(() => normalizeDecklistUrl(`https://x.com/${"a".repeat(3000)}`)).toThrow(
      /too long/
    );
  });
});
