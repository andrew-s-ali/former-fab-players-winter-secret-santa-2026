"use client";

import { useEffect, useRef, useState } from "react";
import {
  createFlake,
  createParticle,
  createTerrain,
  deposit,
  DEPOSIT_PER_SIZE,
  heightAt,
  particleOpacity,
  preSettle,
  relax,
  resizeTerrain,
  stepFlake,
  stepParticle,
  takeFrom,
  type Flake,
  type Particle,
  type Terrain,
} from "@/lib/snow";

/** How long the wind front takes to cross the window, in seconds. */
const GUST_CROSSING = 1.1;

/** Longest a frame is allowed to count for, however long the tab was away. */
const MAX_STEP = 0.05;

/** How much of a column a passing gust lifts. The rest is scoured remnant. */
const GUST_BITE = 0.85;

/**
 * Draws one snowflake into its own canvas, once, to be stamped by every flake.
 *
 * Six arms with barbs is about twenty strokes; at a hundred flakes a frame
 * that is two thousand path operations sixty times a second. Drawn once and
 * blitted, it is one `drawImage` each. The sprite is deliberately oversized
 * and scaled down, so the biggest flake is still sharp.
 */
function drawFlakeSprite(color: string): HTMLCanvasElement {
  const size = 64;
  const sprite = document.createElement("canvas");
  sprite.width = size;
  sprite.height = size;
  const context = sprite.getContext("2d");
  if (!context) {
    return sprite;
  }

  context.translate(size / 2, size / 2);
  context.strokeStyle = color;
  context.lineCap = "round";
  context.lineWidth = size * 0.055;

  for (let arm = 0; arm < 6; arm += 1) {
    context.rotate(Math.PI / 3);
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(0, -size * 0.42);
    context.moveTo(0, -size * 0.24);
    context.lineTo(-size * 0.13, -size * 0.37);
    context.moveTo(0, -size * 0.24);
    context.lineTo(size * 0.13, -size * 0.37);
    context.stroke();
  }
  return sprite;
}

/** Reads the palette's snow colour, so the canvas follows the theme. */
function snowColor(): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--snow")
    .trim();
  return value === "" ? "#ffffff" : value;
}

function flakeCount(width: number, height: number): number {
  return Math.round(Math.min(180, Math.max(50, (width * height) / 11_000)));
}

function bankDepth(height: number): number {
  return Math.min(90, height * 0.18);
}

/**
 * Decorative snow, simulated rather than animated.
 *
 * Flakes fall, and where one reaches the surface it is removed and its mass
 * added to the bank **at that x** — so the drift grows unevenly, deeper where
 * more snow happened to fall, and slumps sideways when a pile gets too steep.
 * The button sends a gust across the window: it strips the bank column by
 * column and throws exactly the snow it removes into the air as particles.
 *
 * This was CSS, which could do everything here except the one thing that
 * matters. CSS can animate a shape that resembles a growing drift, but it
 * cannot land a flake — so nothing about where the snow piled had anything to
 * do with where the snow fell, and blowing it away moved a dome rather than
 * any snow.
 *
 * Everything worth reasoning about lives in `@/lib/snow`; what is left here is
 * the canvas, the frame loop, and the things only a browser knows — pixel
 * ratio, resizes, whether the tab is visible, and whether the reader wants
 * motion at all. Under `prefers-reduced-motion` a settled bank is drawn once,
 * no loop runs, and the button — whose entire output is an animation — is
 * hidden by the stylesheet.
 */
export function Snowfall() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startGustRef = useRef<(() => void) | null>(null);
  const [blowing, setBlowing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    // No 2D context under jsdom, and no reason to care: there is nothing to
    // draw, and what is worth testing lives in `@/lib/snow`.
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }
    // Bound to fresh consts so the narrowing survives into the closures below;
    // the frame loop and the painter are all defined after this point.
    const ctx = context;
    const surface = canvas;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const theme = window.matchMedia("(prefers-color-scheme: dark)");

    let color = snowColor();
    let sprite = drawFlakeSprite(color);
    let width = 0;
    let height = 0;
    let terrain: Terrain = createTerrain(1, 1);
    let flakes: Flake[] = [];
    let particles: Particle[] = [];
    /** Where the wind front has reached, or null when there is no gust. */
    let front: number | null = null;
    /** Rightmost column the front has already stripped. */
    let scraped = -1;
    let frame = 0;
    let last = 0;

    function resize() {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const nextWidth = window.innerWidth;
      const nextHeight = window.innerHeight;

      surface.width = Math.round(nextWidth * ratio);
      surface.height = Math.round(nextHeight * ratio);
      surface.style.width = `${nextWidth}px`;
      surface.style.height = `${nextHeight}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      const depth = bankDepth(nextHeight);
      terrain =
        width === 0
          ? createTerrain(nextWidth, depth)
          : resizeTerrain(terrain, nextWidth, depth);

      const wanted = flakeCount(nextWidth, nextHeight);
      const fromTop = width !== 0;
      while (flakes.length > wanted) {
        flakes.pop();
      }
      while (flakes.length < wanted) {
        flakes.push(createFlake(nextWidth, nextHeight, Math.random, fromTop));
      }

      width = nextWidth;
      height = nextHeight;
    }

    function stamp(x: number, y: number, angle: number, size: number) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
      ctx.restore();
    }

    function paint() {
      ctx.clearRect(0, 0, width, height);

      ctx.globalAlpha = 0.55;
      for (const flake of flakes) {
        stamp(flake.x, flake.y, flake.angle, flake.size);
      }

      for (const particle of particles) {
        ctx.globalAlpha = 0.55 * particleOpacity(particle);
        stamp(particle.x, particle.y, particle.angle, particle.size);
      }

      // The bank. Light enough to read through: it sits behind the page, so
      // text at the bottom of a long one ends up over it.
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, height);
      const { heights, columnWidth } = terrain;
      for (let i = 0; i < heights.length; i += 1) {
        ctx.lineTo(i * columnWidth + columnWidth / 2, height - heights[i]);
      }
      ctx.lineTo(width, height - heights[heights.length - 1]);
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    /** Strips every column the front has newly passed, into the air. */
    function scour() {
      if (front === null) {
        return;
      }
      const reached = Math.min(
        terrain.heights.length - 1,
        Math.floor(front / terrain.columnWidth)
      );
      for (let i = scraped + 1; i <= reached; i += 1) {
        const crest = height - terrain.heights[i];
        const removed = takeFrom(terrain, i, GUST_BITE);
        if (removed < 0.4) {
          continue;
        }
        // One particle per few pixels lifted, so a deep drift throws up more
        // than a dusting does — the air shows how much snow there was.
        const spawn = Math.min(6, 1 + Math.floor(removed / 2));
        for (let n = 0; n < spawn; n += 1) {
          particles.push(
            createParticle(
              i * terrain.columnWidth + Math.random() * terrain.columnWidth,
              crest + Math.random() * removed,
              4 + Math.random() * 7
            )
          );
        }
      }
      scraped = Math.max(scraped, reached);
    }

    function step(dt: number) {
      // A gust pushes the falling snow along with the bank.
      const gusting = front !== null;
      const wind = gusting ? 420 : 0;

      for (const flake of flakes) {
        stepFlake(flake, dt, wind);

        if (flake.x < -flake.size) {
          flake.x += width + flake.size * 2;
        } else if (flake.x > width + flake.size) {
          flake.x -= width + flake.size * 2;
        }

        const landed = flake.y + flake.size * 0.35 >= height - heightAt(terrain, flake.x);
        if (landed || flake.y > height + flake.size) {
          // Its mass becomes part of the bank, right where it came down —
          // except mid-gust, when the wind is taking snow off, not adding it.
          if (landed && !gusting) {
            deposit(terrain, flake.x, flake.size * DEPOSIT_PER_SIZE);
          }
          Object.assign(flake, createFlake(width, height, Math.random, true));
        }
      }

      relax(terrain);

      if (front !== null) {
        front += (width / GUST_CROSSING) * dt;
        scour();
        if (front > width) {
          front = null;
          scraped = -1;
          setBlowing(false);
        }
      }

      for (const particle of particles) {
        stepParticle(particle, dt);
      }
      particles = particles.filter(
        (particle) => particle.life > 0 && particle.x < width + 80
      );
    }

    function loop(now: number) {
      const dt = Math.min(MAX_STEP, (now - last) / 1_000);
      last = now;
      if (dt > 0) {
        step(dt);
      }
      paint();
      frame = requestAnimationFrame(loop);
    }

    function start() {
      if (frame !== 0) {
        return;
      }
      last = performance.now();
      frame = requestAnimationFrame(loop);
    }

    function stop() {
      if (frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    }

    function applyMotionPreference() {
      stop();
      if (!motion.matches) {
        start();
        return;
      }
      // Scenery, not movement: the bank a while of snow would have made,
      // drawn once and then left alone.
      terrain = createTerrain(width, bankDepth(height));
      preSettle(terrain, Math.round(width * 0.7), Math.random);
      flakes = [];
      particles = [];
      front = null;
      scraped = -1;
      paint();
    }

    function onVisibility() {
      if (document.hidden) {
        stop();
      } else if (!motion.matches) {
        // Fresh clock: without it the first frame back carries however long
        // the tab was away, and the snow teleports.
        start();
      }
    }

    function onThemeChange() {
      color = snowColor();
      sprite = drawFlakeSprite(color);
      if (motion.matches) {
        paint();
      }
    }

    function onResize() {
      resize();
      if (motion.matches) {
        applyMotionPreference();
      }
    }

    resize();
    applyMotionPreference();

    startGustRef.current = () => {
      if (front === null && !motion.matches) {
        front = 0;
        scraped = -1;
      }
    };

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    theme.addEventListener("change", onThemeChange);
    motion.addEventListener("change", applyMotionPreference);

    return () => {
      stop();
      startGustRef.current = null;
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      theme.removeEventListener("change", onThemeChange);
      motion.removeEventListener("change", applyMotionPreference);
    };
  }, []);

  return (
    <>
      <canvas aria-hidden="true" className="snowfall" ref={canvasRef} />

      {/*
        No visible label: the icon is the joke, and a button captioned with
        what it does would give the game away before anybody pressed it. The
        accessible name is not optional though — an icon-only control is
        unusable without one — so it says plainly what happens, and `title`
        repeats it for anyone who hovers wondering.
      */}
      <button
        aria-label="Sweep the snow away"
        className="snow-broom"
        disabled={blowing}
        onClick={() => {
          if (!startGustRef.current) {
            return;
          }
          setBlowing(true);
          startGustRef.current();
        }}
        title="Sweep the snow away"
        type="button"
      >
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
          <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
          <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
        </svg>
      </button>
    </>
  );
}
