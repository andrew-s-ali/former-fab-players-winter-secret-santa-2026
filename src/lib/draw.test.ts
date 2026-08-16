import { describe, expect, it } from "vitest";
import { drawAssignments } from "./draw";

const people = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Player ${i}` }));

/** Deterministic, well-distributed rng so repeated runs explore many shuffles. */
function seededRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe("drawAssignments", () => {
  it("gives everyone exactly one recipient", () => {
    const result = drawAssignments(people(6), seededRng(1));

    expect(result.size).toBe(6);
    for (const person of people(6)) {
      expect(result.has(person.id)).toBe(true);
    }
  });

  it("makes everyone a recipient exactly once", () => {
    const result = drawAssignments(people(6), seededRng(2));
    const recipients = [...result.values()];

    expect(new Set(recipients).size).toBe(6);
  });

  it("never assigns anyone to themselves, across many seeds", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const result = drawAssignments(people(8), seededRng(seed));

      for (const [giver, recipient] of result) {
        expect(giver).not.toBe(recipient);
      }
    }
  });

  it("handles the smallest valid group of two", () => {
    const result = drawAssignments(people(2), seededRng(3));

    expect(result.get("p0")).toBe("p1");
    expect(result.get("p1")).toBe("p0");
  });

  it("rejects a group too small to derange", () => {
    expect(() => drawAssignments(people(1), seededRng(1))).toThrow(
      /at least 2 participants/
    );
  });

  it("rejects duplicate participant ids", () => {
    const dupes = [
      { id: "p0", name: "A" },
      { id: "p0", name: "B" },
    ];

    expect(() => drawAssignments(dupes, seededRng(1))).toThrow(/duplicate/i);
  });

  it("varies the pairing with the rng", () => {
    // The cycle construction yields a valid derangement for any ordering, so
    // these tests would all still pass if the shuffle were removed. This pins
    // that the shuffle is actually applied.
    const group = people(6);
    const shapes = new Set(
      Array.from({ length: 10 }, (_, seed) =>
        JSON.stringify([...drawAssignments(group, seededRng(seed + 1))].sort())
      )
    );

    expect(shapes.size).toBeGreaterThan(1);
  });
});
