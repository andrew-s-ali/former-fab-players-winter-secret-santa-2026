"use client";

import { useState } from "react";
import { pickPrompt } from "@/lib/prompts";

/**
 * A random build prompt.
 *
 * The first prompt is chosen on the server and handed down as a prop, so the
 * server and client render the same thing and there is no hydration mismatch.
 * Picking it in an effect instead would trip this repo's
 * react-hooks/set-state-in-effect rule; re-rolling from a click handler is
 * fine, because that is an event rather than an effect.
 */
export function ThemePrompt({ initialPrompt }: { initialPrompt: string }) {
  const [prompt, setPrompt] = useState(initialPrompt);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-300/30 px-4 py-2">
      <span className="text-sm opacity-70">Need a hook?</span>
      <strong className="text-sm">{prompt}</strong>
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
