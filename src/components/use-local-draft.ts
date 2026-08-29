"use client";

import { useCallback, useSyncExternalStore } from "react";

const DRAFT_EVENT = "secret-santa-draft-update";

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(DRAFT_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(DRAFT_EVENT, onStoreChange);
  };
}

/**
 * An unsaved value mirrored to `localStorage` until the server confirms it.
 *
 * Both the notes box and the decklist box save without an explicit press — on
 * a debounce, or when focus leaves — which means there is always a window
 * where what you typed exists only in a React state variable. Closing the tab
 * in that window would lose it. So every keystroke is written here
 * synchronously, and the draft is cleared only once a save has been
 * acknowledged; whatever survives is offered back on the next visit.
 *
 * Read through `useSyncExternalStore` rather than an effect so the server
 * render and the first client render agree (the server snapshot is `null`) and
 * restoring a draft needs no state update on mount.
 *
 * Writes are best-effort: the server save is the real one, so a blocked or
 * full `localStorage` costs the crash guard, not the value.
 */
export function useLocalDraft(
  key: string
): [string | null, (value: string | null) => void] {
  const getSnapshot = useCallback(() => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }, [key]);

  const getServerSnapshot = useCallback(() => null, []);
  const draft = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setDraft = useCallback(
    (value: string | null) => {
      try {
        if (value === null) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, value);
        }
        window.dispatchEvent(new Event(DRAFT_EVENT));
      } catch {
        // Nothing useful to tell the participant here.
      }
    },
    [key]
  );

  return [draft, setDraft];
}
