/**
 * The snow simulation: falling flakes, the bank they build where they land,
 * and the gust that strips it off again.
 *
 * No canvas here, and no DOM. `Snowfall.tsx` owns the drawing and the frame
 * loop; this owns what is true between frames, so the parts worth getting
 * right — that a pile grows where snow actually falls, that it slumps instead
 * of growing spikes, that a gust removes exactly the mass it throws into the
 * air — can be tested without pretending to have a rendering context.
 */

/** Width of one terrain column, in CSS pixels. */
export const COLUMN_WIDTH = 6;

/**
 * Steepest slope the snow holds between neighbouring columns, in pixels.
 *
 * Real snow has an angle of repose; without one, every flake that lands in the
 * same column builds a spike, and a few minutes of snow looks like a comb.
 */
export const MAX_SLOPE = 1.5;

export type Terrain = {
  /** Depth in pixels at each column, left to right. */
  heights: Float32Array;
  columnWidth: number;
  /** Nothing piles higher than this, so the snow can never eat the page. */
  maxHeight: number;
};

export function createTerrain(
  width: number,
  maxHeight: number,
  columnWidth: number = COLUMN_WIDTH
): Terrain {
  return {
    heights: new Float32Array(Math.max(1, Math.ceil(width / columnWidth))),
    columnWidth,
    maxHeight,
  };
}

/**
 * Carries the existing bank onto a new width.
 *
 * Proportional rather than pinned to pixels: on a resize the snow should still
 * look like the snow that was there, and stretching the profile does that
 * without leaving a bare strip at one edge.
 */
export function resizeTerrain(terrain: Terrain, width: number, maxHeight: number): Terrain {
  const next = createTerrain(width, maxHeight, terrain.columnWidth);
  const from = terrain.heights;
  if (from.length === 0) {
    return next;
  }
  for (let i = 0; i < next.heights.length; i += 1) {
    const source = (i / Math.max(1, next.heights.length - 1)) * (from.length - 1);
    const low = Math.floor(source);
    const high = Math.min(from.length - 1, low + 1);
    const blend = source - low;
    next.heights[i] = Math.min(
      maxHeight,
      from[low] * (1 - blend) + from[high] * blend
    );
  }
  return next;
}

export function columnIndex(terrain: Terrain, x: number): number {
  const index = Math.floor(x / terrain.columnWidth);
  return Math.min(terrain.heights.length - 1, Math.max(0, index));
}

/**
 * Depth under a given x, interpolated between column centres.
 *
 * Interpolated because this is what a falling flake is tested against, and
 * stepping between columns makes flakes land on invisible ledges a pixel away
 * from where the snow is drawn.
 */
export function heightAt(terrain: Terrain, x: number): number {
  const { heights, columnWidth } = terrain;
  const position = x / columnWidth - 0.5;
  const low = Math.min(heights.length - 1, Math.max(0, Math.floor(position)));
  const high = Math.min(heights.length - 1, low + 1);
  const blend = Math.min(1, Math.max(0, position - low));
  return heights[low] * (1 - blend) + heights[high] * blend;
}

/**
 * Adds one flake's worth of snow, spread over three columns.
 *
 * A single column would be a needle. The 1-2-1 kernel is the cheapest thing
 * that reads as a flake settling onto a slope rather than into a slot.
 */
export function deposit(terrain: Terrain, x: number, amount: number): void {
  const { heights, maxHeight } = terrain;
  const centre = columnIndex(terrain, x);
  const spread: Array<[number, number]> = [
    [centre - 1, 0.25],
    [centre, 0.5],
    [centre + 1, 0.25],
  ];
  for (const [index, share] of spread) {
    if (index < 0 || index >= heights.length) {
      continue;
    }
    heights[index] = Math.min(maxHeight, heights[index] + amount * share);
  }
}

/**
 * One slump pass: anything steeper than `MAX_SLOPE` sheds sideways.
 *
 * Cheap enough to run every frame — a few hundred floats — and running it
 * every frame is what makes a fresh pile visibly settle rather than snap.
 */
export function relax(terrain: Terrain, maxSlope: number = MAX_SLOPE): void {
  const { heights } = terrain;
  for (let i = 0; i < heights.length - 1; i += 1) {
    const difference = heights[i] - heights[i + 1];
    if (difference > maxSlope) {
      const move = (difference - maxSlope) * 0.25;
      heights[i] -= move;
      heights[i + 1] += move;
    } else if (difference < -maxSlope) {
      const move = (-difference - maxSlope) * 0.25;
      heights[i] += move;
      heights[i + 1] -= move;
    }
  }
}

/**
 * Takes a share of one column's depth and hands it back.
 *
 * Returned rather than discarded so the caller can turn exactly that much snow
 * into particles: what leaves the ground is what appears in the air.
 */
export function takeFrom(terrain: Terrain, index: number, fraction: number): number {
  const { heights } = terrain;
  if (index < 0 || index >= heights.length) {
    return 0;
  }
  const taken = heights[index] * Math.min(1, Math.max(0, fraction));
  heights[index] -= taken;
  return taken;
}

export type Flake = {
  x: number;
  y: number;
  /** Fall speed in px/s. */
  fall: number;
  /** Drawn size in px. */
  size: number;
  angle: number;
  /** Turn rate in rad/s; negative for the ones that turn the other way. */
  spin: number;
  swayPhase: number;
  swaySpeed: number;
  /** Sideways speed at the extremes of the sway, in px/s. */
  swayAmp: number;
  /**
   * Sideways speed carried from the wind, in px/s.
   *
   * Separate from the sway because it is momentum rather than shape: it chases
   * the wind while there is one and bleeds off when there is not.
   */
  drift: number;
  /**
   * Seconds to close most of the gap between `drift` and the wind.
   *
   * A flake's whole relationship with the air, in one number. Bigger flakes get
   * a longer one: they are slower to be taken up and slower to let go, so a
   * gust pulls the field apart instead of moving it as a sheet.
   */
  inertia: number;
};

/**
 * How much depth one flake adds when it lands, as a multiple of its size.
 *
 * Measured rather than picked. At a fifth of a flake's size the bank grew
 * about four pixels a minute, which is a smudge along the bottom edge after
 * the time anybody spends on a page — technically accumulating, not visibly
 * so. This puts it near fifteen a minute: noticeable inside a minute, a proper
 * drift after three or four, and still capped well short of the content.
 */
export const DEPOSIT_PER_SIZE = 0.55;

export function createFlake(
  width: number,
  height: number,
  random: () => number = Math.random,
  fromTop = false
): Flake {
  const size = 7 + random() * 13;
  return {
    x: random() * width,
    // Spread through the column on the first fill, so the sky is not empty
    // for the first ten seconds of every page load.
    y: fromTop ? -size - random() * 40 : random() * height,
    // Bigger flakes fall faster, which is most of what sells the depth.
    fall: 18 + size * 1.6 + random() * 10,
    size,
    angle: random() * Math.PI * 2,
    spin: (random() - 0.5) * 0.8,
    swayPhase: random() * Math.PI * 2,
    swaySpeed: 0.5 + random() * 0.9,
    swayAmp: 6 + random() * 14,
    drift: 0,
    inertia: 0.3 + ((size - 7) / 13) * 0.6 + random() * 0.35,
  };
}

/**
 * Moves a flake for one frame, through air that may be moving.
 *
 * The wind is a force on the flake, not a term in its position. Added straight
 * to `x` — which is what this did first — a flake matches the gust exactly on
 * the frame it starts and stops dead on the frame it ends, which is the one
 * thing snow never does: the field went sideways in lockstep and then snapped
 * back to falling vertically, all at once.
 *
 * So `drift` chases the wind and decays back toward nothing when there is
 * none, closing the gap exponentially rather than linearly — that makes the
 * result independent of how long the frame happened to be, which matters here
 * because `dt` swings with the refresh rate and with whatever else the page is
 * doing.
 */
export function stepFlake(flake: Flake, dt: number, wind: number): void {
  flake.drift += (wind - flake.drift) * (1 - Math.exp(-dt / flake.inertia));

  flake.swayPhase += flake.swaySpeed * dt;
  flake.x += (Math.sin(flake.swayPhase) * flake.swayAmp + flake.drift) * dt;
  flake.y += flake.fall * dt;
  // Snow tumbles faster in moving air. Cheap, and it stops a blown flake from
  // looking like a sprite being slid across the screen.
  flake.angle += (flake.spin + flake.drift * 0.004) * dt;
}

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  angle: number;
  spin: number;
  /** Seconds remaining. */
  life: number;
  maxLife: number;
};

export function createParticle(
  x: number,
  y: number,
  size: number,
  random: () => number = Math.random
): Particle {
  return {
    x,
    y,
    /*
     * Downwind and, mostly, upward. Measured against the first attempt, which
     * had a third of this lift and twice the drag: the snow came off the drift
     * and stayed within about forty pixels of it, which looked like the bank
     * being scuffed rather than blown. It has to get into the air to read as
     * snow at all.
     */
    vx: 300 + random() * 420,
    vy: -150 - random() * 260,
    size,
    angle: random() * Math.PI * 2,
    spin: (random() - 0.5) * 6,
    life: 1.4 + random() * 1.2,
    maxLife: 2.6,
  };
}

export function stepParticle(particle: Particle, dt: number): void {
  // Mostly drag. Blown snow is light enough that it slows and hangs rather
  // than arcing over like something thrown — but it does come down eventually,
  // and a plume that never falls looks like smoke.
  const drag = Math.max(0, 1 - dt * 0.55);
  particle.vx *= drag;
  particle.vy = particle.vy * drag + 55 * dt;
  particle.x += particle.vx * dt;
  particle.y += particle.vy * dt;
  particle.angle += particle.spin * dt;
  particle.life -= dt;
}

export function particleOpacity(particle: Particle): number {
  return Math.max(0, Math.min(1, particle.life / particle.maxLife));
}

/**
 * A plausible bank, built without waiting for it.
 *
 * Only used under `prefers-reduced-motion`, where the depth is drawn once and
 * nothing moves: those readers should still get the winter scenery, they just
 * should not have to watch it arrive.
 */
export function preSettle(terrain: Terrain, flakes: number, random: () => number): void {
  const width = terrain.heights.length * terrain.columnWidth;
  for (let i = 0; i < flakes; i += 1) {
    deposit(terrain, random() * width, terrain.maxHeight * 0.08);
  }
  for (let i = 0; i < 40; i += 1) {
    relax(terrain);
  }
}
