"use client";

import { useState } from "react";
import { pickPrompt, type ThemePromptItem } from "@/lib/prompts";

/**
 * A random build prompt.
 *
 * The first prompt is chosen on the server and handed down as a prop, so the
 * server and client render the same thing and there is no hydration mismatch.
 * Picking it in an effect instead would trip this repo's
 * react-hooks/set-state-in-effect rule; re-rolling from a click handler is
 * fine, because that is an event rather than an effect.
 */
export function ThemePrompt({
  initialPrompt,
  onSelectPrompt,
}: {
  initialPrompt: ThemePromptItem;
  onSelectPrompt?: (prompt: ThemePromptItem) => void;
}) {
  const [prompt, setPrompt] = useState<ThemePromptItem>(initialPrompt);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-300/30 px-4 py-2">
      <span className="text-sm opacity-70">Need a hook?</span>
      <strong className="text-sm">{prompt.text}</strong>
      {onSelectPrompt ? (
        <button
          className="rounded-lg border px-2 py-0.5 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
          onClick={() => onSelectPrompt(prompt)}
          type="button"
        >
          Search this theme
        </button>
      ) : null}
      <button
        className="ml-auto text-sm underline"
        onClick={() => setPrompt(pickPrompt())}
        type="button"
      >
        Another
      </button>
    </div>
  );
}
