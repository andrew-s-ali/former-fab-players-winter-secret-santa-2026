"use client";

import { useState } from "react";
import type { Ring } from "@/lib/ring";
import { Confetti } from "./Confetti";

const SIZE = 320;
const CENTRE = SIZE / 2;
const RADIUS = SIZE / 2 - 40;

/** Evenly spaced points, first at the top, going clockwise. */
function position(index: number, total: number) {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  return { x: CENTRE + RADIUS * Math.cos(angle), y: CENTRE + RADIUS * Math.sin(angle) };
}

function formatDiscordSummary(steps: { from: string; to: string }[]): string {
  return [
    "🎄 **Winter Secret Santa 2026 — Reveal Day Pairings** 🎁",
    ...steps.map((step) => `||${step.from} ➜ ${step.to}||`),
  ].join("\n");
}

export function RevealRing({ ring }: { ring: Ring }) {
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
        className="mx-auto block max-w-full"
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
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
          const from = points[i];
          const to = points[(i + 1) % total];
          return (
            <line
              key={`${step.from}-${step.to}`}
              markerEnd="url(#ring-arrow)"
              stroke="currentColor"
              strokeWidth="2"
              x1={from.x}
              x2={to.x}
              y1={from.y}
              y2={to.y}
            />
          );
        })}

        {points.map((point, i) => (
          <g key={point.name}>
            <circle
              cx={point.x}
              cy={point.y}
              fill="none"
              r="22"
              stroke="currentColor"
              strokeDasharray={i < visibleNames ? undefined : "3 3"}
              strokeWidth="1.5"
              opacity={i < visibleNames ? 1 : 0.35}
            />
            {i < visibleNames ? (
              <text
                dominantBaseline="middle"
                fontSize="11"
                textAnchor="middle"
                x={point.x}
                y={point.y}
                fill="currentColor"
              >
                {point.name}
              </text>
            ) : null}
          </g>
        ))}
      </svg>

      <p className="text-center" role="status">
        {taken === 0
          ? "Nobody revealed yet."
          : `${ring.steps[taken - 1].from} gave to ${ring.steps[taken - 1].to}`}
      </p>

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

