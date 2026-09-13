"use client";

import { useState } from "react";
import { PickCards, PickName } from "@/components/PickCards";
import { eventTitle } from "@/lib/event";
import { pickId, type CommanderPick } from "@/lib/pairing";
import type { Ring } from "@/lib/ring";
import { Confetti } from "./Confetti";

/** What one builder was choosing between, for the pair just revealed. */
export type RevealedBuild = {
  cards: CommanderPick[];
  builtPickId: string | null;
  decklistUrl: string | null;
} | null;

/**
 * The drawing is wider than it is tall because the names sit *outside* the
 * ring, and the widest ones stick out sideways.
 *
 * They used to sit inside the nodes, which worked only for the short names the
 * demo happens to use: at 22px radius and 11px type, "Dev
 * Patel-Nakamura-Rodriguez" ran three times the width of its own circle and
 * across its neighbours. A name has no length limit — it is whatever somebody
 * typed into the sign-up form — so the layout has to give it room rather than
 * hope.
 */
const WIDTH = 640;
const HEIGHT = 420;
const CENTRE_X = WIDTH / 2;
const CENTRE_Y = HEIGHT / 2;
const RADIUS = 150;
/** Radius of the disc marking each person. */
const NODE = 7;
/** Gap between a node and the arrow that points at it. */
const ARROW_GAP = 5;
/** How far outside the ring a name sits. */
const LABEL_GAP = 16;

/** Evenly spaced points, first at the top, going clockwise. */
function position(index: number, total: number) {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  return {
    angle,
    x: CENTRE_X + RADIUS * Math.cos(angle),
    y: CENTRE_Y + RADIUS * Math.sin(angle),
  };
}

/**
 * Where a name goes, given which side of the ring its node is on.
 *
 * Anchored away from the centre — start on the right half, end on the left —
 * so the text grows outward into empty space instead of back over the ring.
 * Near the top and bottom neither side is "outward", so those are centred and
 * nudged clear of the node.
 */
function label(point: { angle: number; x: number; y: number }) {
  const cos = Math.cos(point.angle);
  const sin = Math.sin(point.angle);
  const sideways = Math.abs(cos) > 0.35;

  return {
    x: point.x + cos * (NODE + LABEL_GAP),
    y: point.y + sin * (NODE + LABEL_GAP) + (sideways ? 4 : sin > 0 ? 10 : -2),
    anchor: !sideways ? "middle" : cos > 0 ? "start" : "end",
  } as const;
}

/**
 * An edge that stops short of both nodes.
 *
 * Drawn centre to centre, a line crosses both discs and lands its arrowhead on
 * top of the very name it is pointing at — which is what it used to do.
 */
function edge(
  from: { x: number; y: number },
  to: { x: number; y: number }
): { x1: number; y1: number; x2: number; y2: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const start = NODE + ARROW_GAP;
  // Extra room at the sharp end: the marker is drawn beyond the line's end.
  const stop = NODE + ARROW_GAP + 6;
  return {
    x1: from.x + ux * start,
    y1: from.y + uy * start,
    x2: to.x - ux * stop,
    y2: to.y - uy * stop,
  };
}

function formatDiscordSummary(steps: { from: string; to: string }[]): string {
  return [
    `🎄 **${eventTitle()} — Reveal Day Pairings** 🎁`,
    ...steps.map((step) => `||${step.from} ➜ ${step.to}||`),
  ].join("\n");
}

/**
 * The three cards the builder was choosing between, under the ring.
 *
 * Large, because this is the half of the story the ring cannot tell: who had
 * whom is one line, but *what they had to work with* is the interesting part,
 * and at reveal time it is no longer a secret from anybody.
 */
function RevealedShortlist({
  build,
  from,
  to,
}: {
  build: RevealedBuild;
  from: string;
  to: string;
}) {
  /**
   * Held back behind a button, because the shortlist is the question and the
   * built card is the answer — showing both at once throws the answer away.
   *
   * Reset per pairing by remounting: the parent keys this on the step, so
   * moving round the ring cannot leave the next builder's deck already shown.
   */
  const [shown, setShown] = useState(false);

  if (!build || build.cards.length === 0) {
    return null;
  }
  // The decklist is hidden with it: those URLs are usually named after the
  // deck, so the link alone gives the answer away.
  const hasAnswer = build.builtPickId !== null || build.decklistUrl !== null;

  return (
    <section className="space-y-4 rounded-2xl border border-amber-100/20 bg-slate-950/25 p-5">
      <div>
        <h3 className="text-lg font-semibold">
          What {from} had to choose from for {to}
        </h3>
        <p className="mt-1 text-sm opacity-70">
          {!hasAnswer
            ? "Three cards, drawn from their pool."
            : shown
              ? "Three cards, drawn from their pool — the built one is marked."
              : "Three cards, drawn from their pool. Which one did they build?"}
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        {build.cards.map((pick) => {
          const built = shown && build.builtPickId === pickId(pick);
          return (
            <article
              className={`overflow-hidden rounded-2xl border ${
                built ? "border-emerald-300/60 bg-emerald-500/10" : "border-slate-300/15"
              }`}
              key={pickId(pick)}
            >
              <PickCards pick={pick} />
              <div className="space-y-1 p-3">
                <h4 className="text-sm font-semibold leading-tight">
                  <PickName pick={pick} />
                </h4>
                {built ? (
                  <p className="text-sm font-medium text-emerald-300">
                    <span aria-hidden="true">✓</span> Built this one
                  </p>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {hasAnswer && !shown ? (
        <button
          className="cursor-pointer rounded-lg border border-emerald-300/40 px-4 py-2 text-sm font-medium transition hover:bg-emerald-400/10 active:scale-95"
          onClick={() => setShown(true)}
          type="button"
        >
          Reveal what {from} built
        </button>
      ) : null}

      {shown && build.decklistUrl ? (
        <a
          className="inline-block text-sm underline"
          href={build.decklistUrl}
          rel="noreferrer"
          target="_blank"
        >
          See {from}&rsquo;s decklist &#8599;
        </a>
      ) : null}
    </section>
  );
}

export function RevealRing({
  ring,
  builds = [],
}: {
  ring: Ring;
  /** One entry per step of the ring, in the same order. */
  builds?: RevealedBuild[];
}) {
  const [taken, setTaken] = useState(0);
  const [copied, setCopied] = useState(false);
  const total = ring.names.length;
  const done = taken >= ring.steps.length;

  // Every slot is positioned up front so nothing shifts as names appear.
  const points = ring.names.map((name, i) => ({ name, ...position(i, total) }));
  const visibleNames = taken === 0 ? 0 : Math.min(taken + 1, total);

  const handleCopyDiscordSummary = async () => {
    try {
      await navigator.clipboard.writeText(formatDiscordSummary(ring.steps));
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      // Graceful fallback if clipboard API is not available
    }
  };

  return (
    <div className="space-y-4">
      {done ? <Confetti /> : null}

      <svg
        aria-hidden="true"
        className="mx-auto block h-auto w-full"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        <defs>
          <marker
            id="ring-arrow"
            markerHeight="6"
            markerWidth="6"
            orient="auto-start-reverse"
            refX="5"
            refY="5"
            viewBox="0 0 10 10"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>

        {ring.steps.slice(0, taken).map((step, i) => {
          const line = edge(points[i], points[(i + 1) % total]);
          return (
            <line
              key={`${step.from}-${step.to}`}
              markerEnd="url(#ring-arrow)"
              stroke="currentColor"
              strokeWidth="2"
              {...line}
            />
          );
        })}

        {points.map((point, i) => {
          const shown = i < visibleNames;
          const text = label(point);
          return (
            <g key={point.name} opacity={shown ? 1 : 0.35}>
              <circle
                cx={point.x}
                cy={point.y}
                fill={shown ? "currentColor" : "none"}
                r={NODE}
                stroke="currentColor"
                strokeDasharray={shown ? undefined : "3 3"}
                strokeWidth="1.5"
              />
              {shown ? (
                <text
                  fill="currentColor"
                  fontSize="13"
                  textAnchor={text.anchor}
                  x={text.x}
                  y={text.y}
                >
                  {point.name}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      <p className="text-center" role="status">
        {taken === 0
          ? "Nobody revealed yet."
          : `${ring.steps[taken - 1].from} gave to ${ring.steps[taken - 1].to}`}
      </p>

      {/*
        Only the pair just revealed. Showing every shortlist at once would
        spoil the pairings still to come — the cards are a recipient's pool,
        and three of them beside a name is most of the answer.
      */}
      {taken > 0 ? (
        <RevealedShortlist
          build={builds[taken - 1] ?? null}
          from={ring.steps[taken - 1].from}
          key={taken}
          to={ring.steps[taken - 1].to}
        />
      ) : null}

      <div className="text-center">
        {done ? (
          <div className="space-y-3">
            <p className="font-semibold">That&apos;s all the way round.</p>
            <div className="flex flex-col items-center gap-2">
              <button
                className="cursor-pointer rounded-lg border px-4 py-2 font-medium transition hover:bg-white/10 active:scale-95"
                onClick={handleCopyDiscordSummary}
                type="button"
              >
                Copy Discord Summary
              </button>
              {copied ? (
                <p className="text-sm font-medium text-emerald-400" role="status">
                  Copied to clipboard! ✓
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <button
            className="cursor-pointer rounded-lg border px-4 py-2 font-medium"
            onClick={() => setTaken((n) => n + 1)}
            type="button"
          >
            Reveal the next one
          </button>
        )}
      </div>
    </div>
  );
}

