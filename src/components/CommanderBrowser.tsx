"use client";

import { useCallback, useEffect, useState } from "react";
import { CommanderDetail } from "@/components/CommanderDetail";
import type { ColorCode } from "@/lib/commanders";
import type { Commander } from "@/lib/scryfall/types";

const COLORS: Array<{ code: ColorCode; name: string }> = [
  { code: "W", name: "White" },
  { code: "U", name: "Blue" },
  { code: "B", name: "Black" },
  { code: "R", name: "Red" },
  { code: "G", name: "Green" },
];

const SAMPLE_SIZE = 9;

/**
 * Grid browser for picking a commander: colour pips, a pairable toggle, a
 * name search, and a re-roll button, all filtering an `n=9` sample from the
 * server. `lockedExclude` is the recipient's vetoed colour (from the reveal
 * page) — the pip is disabled as a UI courtesy, but the exclusion is
 * enforced server-side by the sample endpoint regardless.
 */
export function CommanderBrowser({
  lockedExclude,
  lockedReason,
}: {
  lockedExclude: ColorCode | null;
  lockedReason?: string;
}) {
  const [commanders, setCommanders] = useState<Commander[] | null>(null);
  const [selected, setSelected] = useState<Commander | null>(null);
  const [colors, setColors] = useState<ColorCode[]>([]);
  const [query, setQuery] = useState("");
  const [pairsOnly, setPairsOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    const params = new URLSearchParams({ n: String(SAMPLE_SIZE) });
    if (colors.length > 0) {
      params.set("colors", colors.join(""));
    }
    if (query.trim()) {
      params.set("q", query.trim());
    }
    if (lockedExclude) {
      params.set("exclude", lockedExclude);
    }
    if (pairsOnly) {
      params.set("pairs", "1");
    }

    // Chained as a promise, rather than async/await, so every state update
    // happens inside a callback rather than synchronously in the effect body
    // that triggers it (react-hooks/set-state-in-effect).
    return Promise.resolve()
      .then(() => {
        setLoading(true);
        setError(null);
        return fetch(`/api/commanders/sample?${params}`);
      })
      .then((response) => {
        if (!response.ok) {
          throw new Error(String(response.status));
        }
        return response.json() as Promise<{ commanders: Commander[] }>;
      })
      .then((data) => {
        setCommanders(data.commanders);
      })
      .catch(() => {
        setError("Couldn't load commanders. Try again.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [colors, query, pairsOnly, lockedExclude]);

  useEffect(() => {
    void load();
  }, [load]);

  function togglePip(code: ColorCode) {
    setColors((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code]
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {COLORS.map(({ code, name }) => {
          const locked = lockedExclude === code;
          return (
            <button
              aria-pressed={colors.includes(code)}
              className={`rounded-full border px-3 py-1 text-sm ${
                colors.includes(code) ? "bg-sky-600 text-white" : ""
              } ${locked ? "line-through opacity-40" : ""}`}
              disabled={locked}
              key={code}
              onClick={() => togglePip(code)}
              type="button"
            >
              {name}
            </button>
          );
        })}

        <button
          aria-pressed={pairsOnly}
          className={`rounded-full border px-3 py-1 text-sm ${
            pairsOnly ? "bg-sky-600 text-white" : ""
          }`}
          onClick={() => setPairsOnly((on) => !on)}
          type="button"
        >
          Can pair
        </button>

        <input
          aria-label="Search by name"
          className="rounded-lg border px-3 py-1 text-sm"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name…"
          value={query}
        />

        <button
          className="rounded-lg border px-3 py-1 text-sm font-medium disabled:opacity-50"
          disabled={loading}
          onClick={() => void load()}
          type="button"
        >
          {loading ? "Rolling…" : "Roll nine more"}
        </button>
      </div>

      {lockedExclude && lockedReason ? (
        <p className="text-sm opacity-70">{lockedReason}</p>
      ) : null}

      {error ? (
        <p className="text-red-500" role="alert">
          {error}
        </p>
      ) : null}

      {selected ? (
        <CommanderDetail card={selected} onClose={() => setSelected(null)} />
      ) : null}

      {commanders && commanders.length === 0 ? (
        <p className="opacity-70">No commanders match those filters.</p>
      ) : null}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {(commanders ?? []).map((card) => (
          <li key={card.id}>
            <button
              className="w-full text-left"
              onClick={() => setSelected(card)}
              type="button"
            >
              {card.imageUrl ? (
                // Scryfall images are external and deliberately unoptimised.
                // Name is deliberately not repeated in alt text: the caption
                // below already announces it, and this button's accessible
                // name comes from that caption text.
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" className="w-full rounded-lg" src={card.imageUrl} />
              ) : null}
              <span className="mt-1 block text-sm">{card.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
