"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearDecklistAction, saveDecklistAction } from "@/app/s/actions";
import { useLocalDraft } from "@/components/use-local-draft";
import { normalizeDecklistUrl } from "@/lib/deck-build-rules";

const DRAFT_KEY_PREFIX = "secret-santa-decklist-";

type Status = "idle" | "saving" | "saved" | "error";

/** Validates without throwing, so the client can check before a round trip. */
function check(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  try {
    return { ok: true, url: normalizeDecklistUrl(raw) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Where the builder keeps the link to the deck they are assembling.
 *
 * Server-stored rather than in `localStorage`: a decklist is the one artefact
 * of this whole process that outlives the site, and losing it to a cleared
 * browser or a swapped phone weeks before the exchange is a bad trade.
 *
 * Saves when focus leaves the box, matching the notes below it, and keeps the
 * Save button as the visible affordance. It used to save *only* on that
 * button, which meant pasting a link and navigating away lost it silently —
 * the one field on the page with no draft protection.
 *
 * Blur only saves what validates. Tabbing out of a half-typed URL is ordinary,
 * and firing a doomed request at the server on every such blur would turn a
 * normal pause into an error banner; the check runs on the client first and
 * the draft keeps the text either way.
 */
export function DecklistLink({
  token,
  savedUrl,
  builtName = null,
}: {
  token: string;
  savedUrl: string | null;
  /**
   * The commander they said they were building, if they have said.
   *
   * Carried down so this box and the shortlist above it read as one job rather
   * than a list of cards and an unrelated URL field.
   */
  builtName?: string | null;
}) {
  const [draft, setDraft] = useLocalDraft(`${DRAFT_KEY_PREFIX}${token}`);
  /** What has been typed this session; null until the participant edits. */
  const [edited, setEdited] = useState<string | null>(null);
  const [saved, setSaved] = useState(savedUrl);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const latestSave = useRef(0);
  const recoverySaved = useRef(false);

  const value = edited ?? draft ?? saved ?? "";
  const recovered = edited === null && draft !== null && draft !== (saved ?? "");

  /** `url` is already normalised — every caller validates before calling. */
  const save = useCallback(
    (url: string) => {
      const saveId = ++latestSave.current;
      setStatus("saving");
      setError(null);
      setHint(null);
      void saveDecklistAction(token, url).then((result) => {
        if (saveId !== latestSave.current) {
          return;
        }
        if (result.ok) {
          setDraft(null);
          setSaved(url);
          // Back to the saved value, which is the normalised form — so the
          // box shows exactly what was stored.
          setEdited(null);
          setStatus("saved");
        } else {
          setStatus("error");
          setError(result.error);
        }
      });
    },
    [setDraft, token]
  );

  // A draft a previous visit never finished saving. Only saved automatically
  // when it validates — restoring an unfinished URL should not greet the
  // participant with an error they did not just cause. Deferred into a
  // callback so the state updates inside `save` do not run synchronously with
  // the render that scheduled them (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!recovered || recoverySaved.current) {
      return;
    }
    recoverySaved.current = true;
    const checked = draft === null ? null : check(draft);
    if (checked?.ok) {
      void Promise.resolve().then(() => save(checked.url));
    }
  }, [draft, recovered, save]);

  function handleChange(next: string) {
    setEdited(next);
    setDraft(next);
    setStatus("idle");
    setError(null);
    setHint(null);
  }

  /** Leaving the box saves it, but only if there is something valid to save. */
  function handleBlur() {
    if (value === (saved ?? "")) {
      return;
    }
    if (value.trim() === "") {
      setHint(
        saved
          ? "Emptying the box doesn't remove the saved link — use Remove for that."
          : null
      );
      return;
    }
    const checked = check(value);
    if (!checked.ok) {
      setStatus("error");
      setError(checked.error);
      return;
    }
    save(checked.url);
  }

  /** The button saves whatever is there, so an empty box explains itself. */
  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const checked = check(value);
    if (!checked.ok) {
      setStatus("error");
      setError(checked.error);
      return;
    }
    save(checked.url);
  }

  function handleRemove() {
    const saveId = ++latestSave.current;
    setStatus("saving");
    setError(null);
    setHint(null);
    void clearDecklistAction(token).then((result) => {
      if (saveId !== latestSave.current) {
        return;
      }
      if (result.ok) {
        setDraft(null);
        setSaved(null);
        setEdited("");
        setStatus("idle");
      } else {
        setStatus("error");
        setError(result.error);
      }
    });
  }

  const label: Record<Status, string> = {
    idle: "",
    saving: "Saving…",
    saved: "Saved to your link",
    error: "Couldn't save",
  };

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold">Your decklist</h2>
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

      {builtName ? (
        <p className="text-sm opacity-75">
          You are building <strong>{builtName}</strong>. Save the list here as
          it comes together.
        </p>
      ) : null}

      <p className="text-sm opacity-70">
        Paste the link to the deck you&rsquo;re building — Moxfield, Archidekt,
        wherever. It saves when you click away, and is stored against your
        private link rather than this browser, so it survives switching device.
      </p>

      {recovered ? (
        <p className="rounded-lg bg-amber-500/15 p-3 text-sm" role="status">
          Restored a link this browser hadn&rsquo;t finished saving last time.
        </p>
      ) : null}

      <form className="flex flex-wrap items-center gap-2" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor={`decklist-${token}`}>
          Decklist link
        </label>
        <input
          className="min-w-0 flex-1 rounded-lg border border-slate-300/40 bg-transparent px-3 py-2 text-sm"
          id={`decklist-${token}`}
          inputMode="url"
          onBlur={handleBlur}
          onChange={(event) => handleChange(event.target.value)}
          placeholder="https://moxfield.com/decks/…"
          type="url"
          value={value}
        />
        <button
          className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
          disabled={status === "saving"}
          type="submit"
        >
          {status === "saving" ? "Saving…" : "Save"}
        </button>
        {saved ? (
          <button
            className="text-sm underline disabled:opacity-50"
            disabled={status === "saving"}
            onClick={handleRemove}
            type="button"
          >
            Remove
          </button>
        ) : null}
      </form>

      {saved ? (
        <p className="text-sm">
          Saved:{" "}
          <a className="underline" href={saved} rel="noreferrer noopener" target="_blank">
            {saved}
          </a>
        </p>
      ) : null}

      {hint ? (
        <p className="text-sm opacity-70" role="status">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
