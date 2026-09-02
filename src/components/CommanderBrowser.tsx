"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CardImage } from "@/components/CardImage";
import { CommanderDetail } from "@/components/CommanderDetail";
import { ThemePrompt } from "@/components/ThemePrompt";
import type { ColorCode } from "@/lib/commanders";
import type { ThemePromptItem } from "@/lib/prompts";
import type { Commander } from "@/lib/scryfall/types";

const COLORS: Array<{ code: ColorCode; name: string }> = [
  { code: "W", name: "White" },
  { code: "U", name: "Blue" },
  { code: "B", name: "Black" },
  { code: "R", name: "Red" },
  { code: "G", name: "Green" },
];

/**
 * Cards per roll — a whole number of rows in whichever grid is on screen.
 *
 * The grid is `grid-cols-2 sm:grid-cols-3`. Nine is three clean rows at three
 * columns, but at two columns it is four rows plus a single orphan, which
 * reads as a gap rather than a layout. Ten fills five rows exactly on a phone,
 * and would reintroduce the orphan on a wider screen — so the count follows
 * the breakpoint rather than being one number.
 */
const WIDE_SAMPLE_SIZE = 9;
const NARROW_SAMPLE_SIZE = 10;

/** Tailwind's `sm`, where the grid goes from two columns to three. */
const THREE_COLUMN_QUERY = "(min-width: 40rem)";

/**
 * Read when a request is built rather than held in state.
 *
 * Deliberately not a reactive value: as a dependency of `load` it would
 * re-roll the whole grid when a phone is rotated, throwing away the cards
 * somebody was reading to fix a one-card gap. The new size applies to the next
 * roll instead.
 */
function sampleSize(): number {
  const threeColumns =
    typeof window !== "undefined" &&
    window.matchMedia(THREE_COLUMN_QUERY).matches;
  return threeColumns ? WIDE_SAMPLE_SIZE : NARROW_SAMPLE_SIZE;
}

/**
 * Grid browser for picking a commander: colour pips, a pairable toggle, a
 * name search, and a re-roll button, all filtering a sample from the
 * server. `lockedExclude` is the recipient's vetoed colour (from the reveal
 * page) — the pip is disabled as a UI courtesy, but the exclusion is
 * enforced server-side by the sample endpoint regardless.
 */
export function CommanderBrowser({
  lockedExclude,
  lockedReason,
  initialPrompt,
  onChoose,
  actionLabel,
  savedCardIds = [],
}: {
  lockedExclude: ColorCode | null;
  lockedReason?: string;
  initialPrompt?: ThemePromptItem;
  onChoose?: (card: Commander) => Promise<void>;
  actionLabel?: string;
  savedCardIds?: string[];
}) {
  const lockedReasonId = useId();
  const [commanders, setCommanders] = useState<Commander[] | null>(null);
  const [selected, setSelected] = useState<Commander | null>(null);
  const [colors, setColors] = useState<ColorCode[]>([]);
  const [query, setQuery] = useState("");
  /**
   * Active theme, searched against rules text rather than names.
   * Held as the whole prompt so the chip can show human wording ("Go wide with
   * tokens") while the request sends the keyword ("token").
   */
  const [theme, setTheme] = useState<ThemePromptItem | null>(null);
  const [pairsOnly, setPairsOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [chooseError, setChooseError] = useState<string | null>(null);

  // Search refetches per keystroke, so responses can land out of order.
  // Only the newest request is allowed to write state.
  const latestRequest = useRef(0);

  const load = useCallback(() => {
    const requestId = ++latestRequest.current;

    const params = new URLSearchParams({ n: String(sampleSize()) });
    if (colors.length > 0) {
      params.set("colors", colors.join(""));
    }
    if (query.trim()) {
      params.set("q", query.trim());
    }
    if (theme) {
      params.set("theme", theme.keyword ?? theme.text);
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
        if (requestId !== latestRequest.current) {
          return;
        }
        setCommanders(data.commanders);
      })
      .catch(() => {
        if (requestId !== latestRequest.current) {
          return;
        }
        setError("Couldn't load commanders. Try again.");
      })
      .finally(() => {
        if (requestId !== latestRequest.current) {
          return;
        }
        setLoading(false);
      });
  }, [colors, query, theme, pairsOnly, lockedExclude]);

  useEffect(() => {
    void load();
  }, [load]);

  function togglePip(code: ColorCode) {
    setColors((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code]
    );
  }

  function chooseSelected() {
    if (!selected || !onChoose) return;
    setChoosing(true);
    setChooseError(null);
    void onChoose(selected)
      .then(() => setSelected(null))
      .catch(() => setChooseError("Couldn't save that card. Try again."))
      .finally(() => setChoosing(false));
  }

  return (
    <div className="space-y-4">
      {initialPrompt ? (
        <ThemePrompt initialPrompt={initialPrompt} onSelectPrompt={setTheme} />
      ) : null}

      {theme ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="opacity-70">Showing commanders whose rules text mentions</span>
          <span className="rounded-full bg-sky-600 px-3 py-1 text-white">
            {theme.keyword ?? theme.text}
          </span>
          <button
            className="underline"
            onClick={() => setTheme(null)}
            type="button"
          >
            Clear theme
          </button>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {COLORS.map(({ code, name }) => {
          const locked = lockedExclude === code;
          return (
            <button
              aria-describedby={locked && lockedReason ? lockedReasonId : undefined}
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
          {/*
            No number in the label. The sample size follows the breakpoint, so
            a hardcoded "nine" is simply wrong on a phone — and making it
            reactive would mean holding the viewport in state, which would both
            re-render on rotation and risk a hydration mismatch for a word.
          */}
          {loading ? "Rolling…" : "Roll again"}
        </button>
      </div>

      {lockedExclude && lockedReason ? (
        <p className="text-sm opacity-70" id={lockedReasonId}>
          {lockedReason}
        </p>
      ) : null}

      {error ? (
        <p className="text-red-500" role="alert">
          {error}
        </p>
      ) : null}

      {chooseError ? <p className="text-red-500" role="alert">{chooseError}</p> : null}

      {selected ? (
        <CommanderDetail
          card={selected}
          onClose={() => setSelected(null)}
          primaryAction={onChoose ? {
            label: choosing ? "Saving…" : actionLabel ?? "Save this card",
            onClick: chooseSelected,
            disabled: choosing || savedCardIds.includes(selected.id),
          } : undefined}
        />
      ) : null}

      {commanders && commanders.length === 0 ? (
        <p className="opacity-70">No commanders match those filters.</p>
      ) : null}

      <ul aria-busy={loading} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {(commanders ?? []).map((card) => (
          <li key={card.id}>
            <button
              className="w-full text-left"
              onClick={() => setSelected(card)}
              type="button"
            >
              {card.imageUrl ? (
                // Name is deliberately not repeated in alt text: the caption
                // below already announces it, and this button's accessible
                // name comes from that caption text.
                <CardImage className="w-full rounded-lg" src={card.imageUrl} />
              ) : null}
              <span className="mt-1 block text-sm">
                {card.name}{savedCardIds.includes(card.id) ? " — saved" : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
