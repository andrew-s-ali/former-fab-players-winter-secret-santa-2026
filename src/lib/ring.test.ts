import { describe, expect, it } from "vitest";
import { buildRing } from "./ring";
import type { Participant } from "./participants";

const person = (id: string, name: string, recipientId: string): Participant => ({
  id,
  name,
  recipientId,
  token: `token-${id}`,
  colorVeto: null,
  themeVeto: null,
  themeWish: null,
});

// A single cycle: p1 → p2 → p3 → p1
const cycle = [
  person("p1", "Ada", "p2"),
  person("p2", "Bob", "p3"),
  person("p3", "Cleo", "p1"),
];

describe("buildRing", () => {
  it("returns the names in cycle order", () => {
    expect(buildRing(cycle).names).toEqual(["Ada", "Bob", "Cleo"]);
  });

  it("returns one step per participant, closing the loop", () => {
    expect(buildRing(cycle).steps).toEqual([
      { from: "Ada", to: "Bob" },
      { from: "Bob", to: "Cleo" },
      { from: "Cleo", to: "Ada" },
    ]);
  });

  it("works with a 2-person cycle", () => {
    const pair = [person("p1", "Ada", "p2"), person("p2", "Bob", "p1")];
    const ring = buildRing(pair);
    expect(ring.names).toEqual(["Ada", "Bob"]);
    expect(ring.steps).toEqual([
      { from: "Ada", to: "Bob" },
      { from: "Bob", to: "Ada" },
    ]);
  });

  it("traverses cycle regardless of initial array ordering", () => {
    const unordered = [
      person("p3", "Cleo", "p1"),
      person("p1", "Ada", "p2"),
      person("p2", "Bob", "p3"),
    ];
    const ring = buildRing(unordered);
    expect(ring.names).toEqual(["Cleo", "p1" === "p1" ? "Ada" : "", "Bob"]);
    expect(ring.names).toEqual(["Cleo", "Ada", "Bob"]);
    expect(ring.steps).toEqual([
      { from: "Cleo", to: "Ada" },
      { from: "Ada", to: "Bob" },
      { from: "Bob", to: "Cleo" },
    ]);
  });

  it("throws when the data is not a single cycle", () => {
    const twoLoops = [
      person("p1", "Ada", "p2"),
      person("p2", "Bob", "p1"),
      person("p3", "Cleo", "p4"),
      person("p4", "Dev", "p3"),
    ];

    expect(() => buildRing(twoLoops)).toThrow(/single cycle/i);
  });

  it("throws when a recipient id does not resolve", () => {
    const dangling = [person("p1", "Ada", "nope"), person("p2", "Bob", "p1")];

    expect(() => buildRing(dangling)).toThrow(/nope/);
  });

  it("throws on fewer than two participants", () => {
    expect(() => buildRing([])).toThrow(/at least 2/);
    expect(() => buildRing([person("p1", "Ada", "p1")])).toThrow(/at least 2/);
  });
});
