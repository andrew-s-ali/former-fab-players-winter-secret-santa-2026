"use client";

import { useState, useTransition } from "react";
import { setRevealAction, updateParticipantAction, type ActionResult } from "@/app/admin/actions";
import type { EventSummary } from "@/lib/admin";
import { COLOR_CHOICES } from "@/lib/signup";

const FIELD_CLASS =
  "w-full rounded-lg border border-slate-300/40 bg-transparent px-3 py-2 text-sm";

/**
 * The organiser's controls.
 *
 * Deliberately does not offer the draw. Re-running it reshuffles everyone and
 * invalidates every link already sent, and unlike the other two actions there
 * is no undo — so it stays on the CLI, where running it takes intent rather
 * than a stray click. Everything here is reversible.
 *
 * The summary it renders carries no tokens and no assignments; see
 * `summarizeEvent`.
 */
export function AdminConsole({ summary }: { summary: EventSummary }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [confirmingReveal, setConfirmingReveal] = useState(false);

  function dispatch(work: () => Promise<ActionResult>) {
    startTransition(async () => {
      setResult(await work());
    });
  }

  const revealed = summary.revealedAt !== null;

  return (
    <div className="space-y-8">
      {result ? (
        <p
          className={`rounded-xl border px-4 py-3 text-sm ${
            result.ok ? "border-emerald-500/40" : "border-red-500/40"
          }`}
          role="status"
        >
          {result.ok ? result.message : result.error}
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Reveal day</h2>
        <p className="text-sm opacity-80">
          {revealed
            ? `/reveal has been public since ${summary.revealedAt}.`
            : "/reveal is locked and currently 404s."}
        </p>

        {revealed ? (
          <button
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
            disabled={pending}
            onClick={() => dispatch(() => setRevealAction(true))}
            type="button"
          >
            Lock it again
          </button>
        ) : confirmingReveal ? (
          // Two steps on purpose: unlocking publishes every assignment at a
          // public URL, and there is no taking that back once people have
          // looked.
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm">
              This publishes the whole ring publicly. Sure?
            </span>
            <button
              className="rounded-lg border border-red-500/50 px-4 py-2 text-sm font-medium disabled:opacity-50"
              disabled={pending}
              onClick={() => dispatch(() => setRevealAction(false))}
              type="button"
            >
              Yes, unlock /reveal
            </button>
            <button
              className="text-sm underline"
              onClick={() => setConfirmingReveal(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
            disabled={pending || summary.participantCount === 0}
            onClick={() => setConfirmingReveal(true)}
            type="button"
          >
            Unlock /reveal
          </button>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">
          Participants ({summary.participantCount})
        </h2>

        {summary.participantCount === 0 ? (
          <p className="text-sm opacity-80">
            No draw yet. Run <code>npm run draw</code> from the CLI.
          </p>
        ) : (
          <ul className="divide-y divide-slate-300/20 text-sm">
            {summary.participants.map((p) => (
              <li className="py-2" key={p.name}>
                <strong>{p.name}</strong>
                <span className="opacity-70">
                  {" — "}
                  avoids {p.colorVeto ?? "no colour"}
                  {p.themeVeto ? `, not ${p.themeVeto}` : ""}
                  {p.themeWish ? `, would like ${p.themeWish}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Edit a participant</h2>
        <p className="text-sm opacity-80">
          Leave a box empty to leave it alone, or type <code>none</code> to
          clear it. Assignments and reveal links are never affected.
        </p>

        <form
          action={(formData) => dispatch(() => updateParticipantAction(formData))}
          className="space-y-3"
        >
          <label className="block space-y-1">
            <span className="text-sm font-medium">Name</span>
            <input className={FIELD_CLASS} name="name" required type="text" />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Colour to avoid</span>
            <input
              className={FIELD_CLASS}
              list="admin-colour-options"
              name="color"
              placeholder="leave empty to keep"
              type="text"
            />
            <datalist id="admin-colour-options">
              {COLOR_CHOICES.filter((c) => c.value !== "").map((c) => (
                <option key={c.value} value={c.value} />
              ))}
              <option value="none" />
            </datalist>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Theme to avoid</span>
            <input className={FIELD_CLASS} name="veto" type="text" />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Theme they&rsquo;d like</span>
            <input className={FIELD_CLASS} name="wish" type="text" />
          </label>

          <button
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
            disabled={pending}
            type="submit"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </form>
      </section>
    </div>
  );
}
