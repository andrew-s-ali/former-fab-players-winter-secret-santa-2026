"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY_PREFIX = "secret-santa-scratchpad-";
const STORAGE_EVENT_NAME = "secret-santa-scratchpad-update";

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(STORAGE_EVENT_NAME, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(STORAGE_EVENT_NAME, onStoreChange);
  };
}

export function SecretScratchpad({ token }: { token: string }) {
  const storageKey = `${STORAGE_KEY_PREFIX}${token}`;

  const getSnapshot = useCallback(() => {
    try {
      return localStorage.getItem(storageKey) ?? "";
    } catch {
      return "";
    }
  }, [storageKey]);

  const getServerSnapshot = useCallback(() => "", []);

  const notes = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    try {
      localStorage.setItem(storageKey, nextValue);
      window.dispatchEvent(new Event(STORAGE_EVENT_NAME));
    } catch {
      // In case localStorage is quota-exceeded or blocked
    }
  };

  return (
    <section aria-labelledby="scratchpad-heading" className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="scratchpad-heading" className="text-xl font-semibold">
          Private notes
        </h2>
        <span className="text-xs text-emerald-600 dark:text-emerald-400">
          Saved to this browser
        </span>
      </div>

      <p className="text-sm opacity-70">
        Keep track of deck ideas, card links, or wishlist notes here. These notes
        are stored only in this browser and are never sent to a server or seen by
        anyone else.
      </p>

      <div>
        <label htmlFor={`scratchpad-${token}`} className="sr-only">
          Private notes
        </label>
        <textarea
          id={`scratchpad-${token}`}
          name="scratchpad"
          rows={4}
          value={notes}
          onChange={handleChange}
          placeholder="e.g. deck ideas, card links, budget notes..."
          className="w-full rounded-xl border border-slate-300/40 bg-slate-50/50 p-3 text-sm placeholder:opacity-40 focus:border-slate-400 focus:outline-none dark:border-slate-700/60 dark:bg-slate-900/50 dark:focus:border-slate-500"
        />
      </div>
    </section>
  );
}
