import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { readDemoEvent } from "./demo";
import { findById, findByToken, isRevealed } from "./participants";
import { buildRing } from "./ring";

describe("demo data reader", () => {
  it("reads event data directly from isolated demo json", () => {
    const event = readDemoEvent();
    expect(event).toBeDefined();
    expect(Array.isArray(event.participants)).toBe(true);
    expect(event.participants.length).toBeGreaterThanOrEqual(6);
    expect(event.participants.length).toBe(8);
  });

  it("contains participants with valid fields, unique tokens, and no self-assignments", () => {
    const event = readDemoEvent();
    const ids = new Set(event.participants.map((p) => p.id));
    const tokens = new Set(event.participants.map((p) => p.token));

    expect(ids.size).toBe(event.participants.length);
    expect(tokens.size).toBe(event.participants.length);

    for (const p of event.participants) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(p.recipientId).toBeTruthy();
      expect(p.recipientId).not.toBe(p.id);
      expect(ids.has(p.recipientId)).toBe(true);
    }
  });

  it("includes diverse test cases (emoji, long name, long wish, all 5 color vetoes)", () => {
    const event = readDemoEvent();
    const names = event.participants.map((p) => p.name);
    expect(names.some((n) => n.includes("🎄"))).toBe(true);
    expect(names.some((n) => n.includes("Patel-Nakamura-Rodriguez"))).toBe(true);

    const colorVetoes = new Set(event.participants.map((p) => p.colorVeto));
    expect(colorVetoes.has("W")).toBe(true);
    expect(colorVetoes.has("U")).toBe(true);
    expect(colorVetoes.has("B")).toBe(true);
    expect(colorVetoes.has("R")).toBe(true);
    expect(colorVetoes.has("G")).toBe(true);
    expect(colorVetoes.has(null)).toBe(true);

    const wishes = event.participants.map((p) => p.themeWish).filter(Boolean) as string[];
    expect(wishes.some((w) => w.length > 50)).toBe(true);
  });

  it("forms a valid closed single-loop draw verifiable by buildRing", () => {
    const event = readDemoEvent();
    const ring = buildRing(event.participants);
    expect(ring.names.length).toBe(event.participants.length);
    expect(ring.steps.length).toBe(event.participants.length);
    expect(new Set(ring.names).size).toBe(event.participants.length);
  });

  it("has revealedAt populated when seeded for demo routes", () => {
    const event = readDemoEvent();
    expect(event.revealedAt).not.toBeNull();
    expect(isRevealed(event)).toBe(true);
    expect(new Date(event.revealedAt!).getTime()).not.toBeNaN();
  });

  it("supports participant lookups by token and by id", () => {
    const event = readDemoEvent();
    const first = event.participants[0];
    expect(findByToken(event, first.token)).toEqual(first);
    expect(findById(event, first.id)).toEqual(first);
    expect(findById(event, first.recipientId)).toBeDefined();
  });

  it("strictly enforces that demo modules do not import store or netlify blobs", async () => {
    const demoSource = await readFile("src/lib/demo.ts", "utf8");
    const seederSource = await readFile("scripts/seed-demo.ts", "utf8");

    // Match import statements importing from store or netlify blobs
    const storeImportRegex = /import\s+.*from\s+["'].*(?:store|@netlify\/blobs).*["']/g;
    expect(demoSource.match(storeImportRegex)).toBeNull();
    expect(seederSource.match(storeImportRegex)).toBeNull();
  });
});
