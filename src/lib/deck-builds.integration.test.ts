import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#db/index", async () => await import("@/test-support/database"));

const { closeDatabase, freshDatabase } = await import("@/test-support/database");
const {
  clearDecklistUrl,
  readDeckBuild,
  saveDecklistUrl,
  saveNotes,
} = await import("./deck-builds");

beforeEach(async () => {
  await freshDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

describe("deck builds, against a real database", () => {
  it("reads as empty for a builder who has saved nothing", async () => {
    expect(await readDeckBuild("g1")).toEqual({ decklistUrl: null, notes: "" });
  });

  it("saves and reads back a decklist link", async () => {
    await saveDecklistUrl("g1", "https://moxfield.com/decks/abc");

    expect((await readDeckBuild("g1")).decklistUrl).toBe(
      "https://moxfield.com/decks/abc"
    );
  });

  it("normalises the link it stores, not just the one it validates", async () => {
    await saveDecklistUrl("g1", "  https://moxfield.com/decks/abc  ");

    expect((await readDeckBuild("g1")).decklistUrl).toBe(
      "https://moxfield.com/decks/abc"
    );
  });

  it("refuses a link that is not http(s), leaving nothing behind", async () => {
    await expect(saveDecklistUrl("g1", "javascript:alert(1)")).rejects.toThrow(/https/);

    expect(await readDeckBuild("g1")).toEqual({ decklistUrl: null, notes: "" });
  });

  it("replaces the link on a second save", async () => {
    await saveDecklistUrl("g1", "https://a.example/one");
    await saveDecklistUrl("g1", "https://b.example/two");

    expect((await readDeckBuild("g1")).decklistUrl).toBe("https://b.example/two");
  });

  // Both live in one row, and each is written on its own — saving one must not
  // blank the other, including from another tab.
  it("keeps notes and the link independent", async () => {
    await saveNotes("g1", "elves, maybe tokens");
    await saveDecklistUrl("g1", "https://moxfield.com/decks/abc");

    expect(await readDeckBuild("g1")).toEqual({
      decklistUrl: "https://moxfield.com/decks/abc",
      notes: "elves, maybe tokens",
    });
  });

  it("clears the link without touching the notes", async () => {
    await saveNotes("g1", "keep me");
    await saveDecklistUrl("g1", "https://moxfield.com/decks/abc");

    await clearDecklistUrl("g1");

    expect(await readDeckBuild("g1")).toEqual({ decklistUrl: null, notes: "keep me" });
  });

  it("stores notes for a builder who has no link at all", async () => {
    await saveNotes("g1", "just thinking out loud");

    expect(await readDeckBuild("g1")).toEqual({
      decklistUrl: null,
      notes: "just thinking out loud",
    });
  });

  it("keeps builders apart", async () => {
    await saveNotes("g1", "mine");
    await saveNotes("g2", "theirs");

    expect((await readDeckBuild("g1")).notes).toBe("mine");
    expect((await readDeckBuild("g2")).notes).toBe("theirs");
  });

  it("refuses notes past the length limit", async () => {
    await expect(saveNotes("g1", "x".repeat(20_001))).rejects.toThrow(/too long/);
  });
});
