"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveNotesAction } from "@/app/s/actions";
import { useLocalDraft } from "@/components/use-local-draft";
import { MAX_NOTES_LENGTH } from "@/lib/deck-build-rules";

/** How long to wait after the last keystroke before saving. */
const SAVE_DEBOUNCE_MS = 1000;

const DRAFT_KEY_PREFIX = "secret-santa-scratchpad-";

type Status = "idle" | "saving" | "saved" | "error";

/**
 * The builder's private notes, saved to their link rather than their browser.
 *
 * These used to live only in `localStorage`. Moving them to the database is
 * what makes them survive a cleared browser or a swapped phone — but it does
 * mean notes about a named person now leave the device, so the wording below
 * says where they are kept instead of promising they never travel.
 *
 * `localStorage` is still here, doing a different job — see `useLocalDraft`:
 * a debounce long enough to be useful is also long enough to lose a paragraph
 * if the tab closes inside it.
 */
export function SecretScratchpad({
  token,
  initialNotes,
}: {
  token: string;
  initialNotes: string;
}) {
  const [draft, setDraft] = useLocalDraft(`${DRAFT_KEY_PREFIX}${token}`);

  /** What has been typed this session; null until the participant edits. */
  const [edited, setEdited] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against an older in-flight save landing after a newer one.
  const latestSave = useRef(0);
  const recoverySaved = useRef(false);

  const notes = edited ?? draft ?? initialNotes;
  const recovered = edited === null && draft !== null && draft !== initialNotes;

  const save = useCallback(
    (value: string) => {
      const saveId = ++latestSave.current;
      setStatus("saving");
      setError(null);
      void saveNotesAction(token, value).then((result) => {
        if (saveId !== latestSave.current) {
          return;
        }
        if (result.ok) {
          setDraft(null);
          setStatus("saved");
        } else {
          setStatus("error");
          setError(result.error);
        }
      });
    },
    [setDraft, token]
  );

  // A draft left behind by a tab that closed before its save landed. Deferred
  // into a callback rather than called straight from the effect body, so the
  // state updates inside `save` do not run synchronously with the render that
  // scheduled them (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!recovered || recoverySaved.current) {
      return;
    }
    recoverySaved.current = true;
    const value = draft;
    void Promise.resolve().then(() => save(value));
  }, [draft, recovered, save]);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    []
  );

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = event.target.value;
    setEdited(value);
    setStatus("idle");
    setDraft(value);

    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => save(value), SAVE_DEBOUNCE_MS);
  }

  /** Leaving the box is a clear "done for now" — don't wait out the debounce. */
  function handleBlur() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      save(notes);
    }
  }

  const label: Record<Status, string> = {
    idle: "",
    saving: "Saving…",
    saved: "Saved to your link",
    error: "Couldn't save",
  };

  return (
    <section aria-labelledby="scratchpad-heading" className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="scratchpad-heading" className="text-xl font-semibold">
          Private notes
        </h2>
        <span
          aria-live="polite"
          className={`text-xs ${
            status === "error"
              ? "text-red-500"
              : "text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {label[status]}
        </span>
      </div>

      <p className="text-sm opacity-70">
        Keep track of deck ideas, card links, or wishlist notes here. These save
        against your private link rather than to this browser, so they follow
        you between devices. Nobody else has your link — but they are stored on
        the server, so don&rsquo;t write anything here you wouldn&rsquo;t want
        the organiser to be able to reach.
      </p>

      {recovered ? (
        <p className="rounded-lg bg-amber-500/15 p-3 text-sm" role="status">
          Restored notes this browser hadn&rsquo;t finished saving last time.
        </p>
      ) : null}

      <div>
        <label htmlFor={`scratchpad-${token}`} className="sr-only">
          Private notes
        </label>
        <textarea
          className="w-full rounded-xl border border-slate-300/40 bg-slate-50/50 p-3 text-sm placeholder:opacity-40 focus:border-slate-400 focus:outline-none dark:border-slate-700/60 dark:bg-slate-900/50 dark:focus:border-slate-500"
          id={`scratchpad-${token}`}
          maxLength={MAX_NOTES_LENGTH}
          name="scratchpad"
          onBlur={handleBlur}
          onChange={handleChange}
          placeholder="e.g. deck ideas, card links, budget notes..."
          rows={4}
          value={notes}
        />
      </div>

      {error ? (
        <p className="text-sm text-red-500" role="alert">
          {error} Your notes are still in the box, and saving is retried when
          you next type.
        </p>
      ) : null}
    </section>
  );
}
