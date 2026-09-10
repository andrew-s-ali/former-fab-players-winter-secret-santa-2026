import { describe, expect, it } from "vitest";
import {
  createFlake,
  createParticle,
  createTerrain,
  deposit,
  heightAt,
  MAX_SLOPE,
  particleOpacity,
  preSettle,
  relax,
  resizeTerrain,
  stepFlake,
  stepParticle,
  takeFrom,
  type Terrain,
} from "./snow";

/** A deterministic stand-in for Math.random, so a failure is reproducible. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

const total = (terrain: Terrain) =>
  [...terrain.heights].reduce((sum, height) => sum + height, 0);

describe("the snow terrain", () => {
  it("piles where the snow actually lands", () => {
    const terrain = createTerrain(600, 90);

    for (let i = 0; i < 50; i += 1) {
      deposit(terrain, 120, 2);
    }

    // Deep under the spot it fell on, untouched at the far end. This is the
    // whole difference from the CSS version, which grew a fixed shape whatever
    // the snow did.
    expect(heightAt(terrain, 120)).toBeGreaterThan(20);
    expect(heightAt(terrain, 500)).toBe(0);
  });

  it("spreads one flake over three columns rather than into a slot", () => {
    const terrain = createTerrain(600, 90);

    deposit(terrain, 120, 4);

    expect(heightAt(terrain, 114)).toBeGreaterThan(0);
    expect(heightAt(terrain, 126)).toBeGreaterThan(0);
  });

  it("never piles past the cap, so the snow cannot eat the page", () => {
    const terrain = createTerrain(600, 20);

    for (let i = 0; i < 500; i += 1) {
      deposit(terrain, 300, 5);
    }

    expect(Math.max(...terrain.heights)).toBeLessThanOrEqual(20);
  });

  it("slumps a spike into a slope, keeping the snow it had", () => {
    const terrain = createTerrain(600, 200);
    for (let i = 0; i < 60; i += 1) {
      deposit(terrain, 300, 3);
    }
    const before = total(terrain);
    const peak = Math.max(...terrain.heights);

    for (let i = 0; i < 200; i += 1) {
      relax(terrain);
    }

    // Snow moves sideways; none of it disappears.
    expect(total(terrain)).toBeCloseTo(before, 1);
    expect(Math.max(...terrain.heights)).toBeLessThan(peak);
    // Approaches the angle of repose rather than snapping to it: each pass
    // sheds a quarter of the excess, so a long-settled slope sits just above
    // the limit and creeps down from there.
    for (let i = 0; i < terrain.heights.length - 1; i += 1) {
      expect(Math.abs(terrain.heights[i] - terrain.heights[i + 1])).toBeLessThan(
        MAX_SLOPE * 1.05
      );
    }
  });

  it("hands back exactly the snow a gust takes", () => {
    const terrain = createTerrain(600, 90);
    for (let i = 0; i < 40; i += 1) {
      deposit(terrain, 200, 3);
    }
    const before = total(terrain);

    let lifted = 0;
    for (let i = 0; i < terrain.heights.length; i += 1) {
      lifted += takeFrom(terrain, i, 0.85);
    }

    // What leaves the ground is what the caller turns into particles, so the
    // air shows the drift that was actually there.
    expect(lifted).toBeCloseTo(before - total(terrain), 5);
    expect(total(terrain)).toBeCloseTo(before * 0.15, 1);
  });

  it("ignores a column that is not there", () => {
    const terrain = createTerrain(60, 90);

    expect(takeFrom(terrain, -1, 1)).toBe(0);
    expect(takeFrom(terrain, 999, 1)).toBe(0);
  });

  it("carries the bank across a resize instead of dropping it", () => {
    const terrain = createTerrain(600, 90);
    for (let i = 0; i < 40; i += 1) {
      deposit(terrain, 150, 3);
    }

    const wider = resizeTerrain(terrain, 1_200, 90);

    expect(wider.heights.length).toBeGreaterThan(terrain.heights.length);
    // The profile is stretched, so the pile is proportionally where it was.
    expect(heightAt(wider, 300)).toBeGreaterThan(10);
    expect(heightAt(wider, 1_000)).toBe(0);
  });

  it("clamps a carried-over bank to the new cap", () => {
    const terrain = createTerrain(600, 90);
    for (let i = 0; i < 200; i += 1) {
      deposit(terrain, 300, 5);
    }

    // A short window cannot hold a tall window's drift.
    expect(Math.max(...resizeTerrain(terrain, 600, 20).heights)).toBeLessThanOrEqual(20);
  });

  it("settles a plausible bank without waiting for one", () => {
    const terrain = createTerrain(600, 60);

    preSettle(terrain, 420, seeded(7));

    // For prefers-reduced-motion: depth, drawn once, with no two columns the
    // same — a flat bar would read as a border rather than as snow.
    expect(Math.min(...terrain.heights)).toBeGreaterThan(0);
    expect(new Set(terrain.heights).size).toBeGreaterThan(10);
    expect(Math.max(...terrain.heights)).toBeLessThanOrEqual(60);
  });
});

describe("falling snow", () => {
  it("drifts sideways as it falls, and turns", () => {
    const flake = createFlake(800, 600, seeded(3));
    const { x, y, angle } = flake;

    stepFlake(flake, 0.5, 0);

    expect(flake.y).toBeGreaterThan(y);
    expect(flake.x).not.toBe(x);
    expect(flake.angle).not.toBe(angle);
  });

  it("takes up the wind rather than matching it instantly", () => {
    const still = createFlake(800, 600, seeded(3));
    const blown = createFlake(800, 600, seeded(3));

    stepFlake(still, 0.2, 0);
    stepFlake(blown, 0.2, 400);

    // Downwind of the one in still air, but nowhere near the 80px the wind
    // itself covered in that fifth of a second: the flake is still catching up.
    expect(blown.x).toBeGreaterThan(still.x);
    expect(blown.x - still.x).toBeLessThan(80 * 0.6);
  });

  it("keeps drifting after the wind drops, and coasts to a stop", () => {
    const blown = createFlake(800, 600, seeded(3));
    const still = createFlake(800, 600, seeded(3));

    // A second of gust, then nothing but calm air for both of them.
    for (let i = 0; i < 60; i += 1) {
      stepFlake(blown, 1 / 60, 400);
      stepFlake(still, 1 / 60, 0);
    }
    const blownAtCutoff = blown.x;
    const stillAtCutoff = still.x;

    // Both flakes came from the same seed and have taken the same number of
    // steps, so their sway is identical and the gap between them is drift and
    // nothing else.
    for (let i = 0; i < 15; i += 1) {
      stepFlake(blown, 1 / 60, 0);
      stepFlake(still, 1 / 60, 0);
    }
    const carried = blown.x - blownAtCutoff - (still.x - stillAtCutoff);

    // The frame the wind stops is not the frame the flake stops. This is the
    // whole point: applied straight to position, the sideways motion vanished
    // between one frame and the next.
    expect(carried).toBeGreaterThan(20);

    // And it does run out — a flake that kept its drift for ever would sail
    // off sideways and never come down where snow comes down.
    for (let i = 0; i < 60 * 6; i += 1) {
      stepFlake(blown, 1 / 60, 0);
    }
    expect(Math.abs(blown.drift)).toBeLessThan(1);
  });

  it("gives a bigger flake more inertia than a small one", () => {
    // So a gust pulls the field apart rather than sliding it as a sheet: the
    // small ones are moving first and settle first.
    const flakes = Array.from({ length: 40 }, (_, i) => createFlake(800, 600, seeded(i + 1)));
    const smallest = flakes.reduce((a, b) => (a.size < b.size ? a : b));
    const largest = flakes.reduce((a, b) => (a.size > b.size ? a : b));

    expect(largest.inertia).toBeGreaterThan(smallest.inertia);
  });

  it("starts a new flake above the window but an opening one anywhere", () => {
    // Entering from the top is right for a replacement; doing it on the first
    // fill would leave the sky empty for the first ten seconds of every load.
    expect(createFlake(800, 600, seeded(11), true).y).toBeLessThan(0);
    expect(createFlake(800, 600, seeded(11), false).y).toBeGreaterThan(0);
  });
});

describe("blown snow", () => {
  it("leaves the drift travelling downwind and upward", () => {
    const particle = createParticle(100, 500, 6, seeded(5));

    expect(particle.vx).toBeGreaterThan(0);
    expect(particle.vy).toBeLessThan(0);
  });

  it("slows and fades rather than arcing over", () => {
    const particle = createParticle(100, 500, 6, seeded(5));
    const launch = particle.vx;

    for (let i = 0; i < 30; i += 1) {
      stepParticle(particle, 1 / 60);
    }

    expect(particle.x).toBeGreaterThan(100);
    expect(particle.vx).toBeLessThan(launch);
    expect(particleOpacity(particle)).toBeLessThan(1);
  });

  it("reports no opacity once it is spent", () => {
    const particle = createParticle(100, 500, 6, seeded(5));

    for (let i = 0; i < 200; i += 1) {
      stepParticle(particle, 1 / 60);
    }

    expect(particle.life).toBeLessThanOrEqual(0);
    expect(particleOpacity(particle)).toBe(0);
  });
});
