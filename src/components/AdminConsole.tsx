"use client";

import { useState, useTransition } from "react";
import {
  nudgeAction,
  setRevealAction,
  updateParticipantAction,
  type ActionResult,
} from "@/app/admin/actions";
import { PickName } from "@/components/PickCards";
import type { EventSummary, ParticipantPool } from "@/lib/admin";
import { willPing } from "@/lib/discord";
import type { NudgeStatus } from "@/lib/nudge";
import { pickId } from "@/lib/pairing";
import { COLOR_CHOICES } from "@/lib/signup";

/**
 * A Bcc'd mail to the people who still owe picks, and nobody else.
 *
 * Built from the roster rather than from the nudge status because the status
 * carries names and the addresses live on the summary; a redacted participant
 * has no address and simply drops out.
 */
function mailtoStragglers(summary: EventSummary, nudge: NudgeStatus): string {
  const owing = new Set(nudge.outstanding.map((entry) => entry.name));
  const addresses = summary.participants
    .filter((p) => owing.has(p.name) && p.email !== "")
    .map((p) => encodeURIComponent(p.email));
  const subject = encodeURIComponent("Secret Santa: your commander picks");
  const body = encodeURIComponent(
    "Quick nudge — the exchange can't start until everyone has picked one " +
      "commander for every other player. Your private link is the one you " +
      "were emailed."
  );
  return `mailto:?bcc=${addresses.join(",")}&subject=${subject}&body=${body}`;
}

/**
 * Whether this person can actually be pinged.
 *
 * Shown wherever a participant is listed, because the difference is invisible
 * otherwise and matters exactly once — when the nudge goes out and half the
 * group never sees it. "Handle only" is not a warning; plenty of people will
 * never hand over an id, and the message falls back to their name.
 */
function DiscordTag({ discord }: { discord: string | null }) {
  if (!discord) {
    return <span className="block text-xs opacity-50">no Discord set</span>;
  }
  return willPing(discord) ? (
    <span className="block text-xs text-emerald-400/90">
      Discord {discord} — will ping
    </span>
  ) : (
    <span className="block text-xs opacity-70">
      Discord @{discord} — handle only, will not ping
    </span>
  );
}

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
 * `summarizeEvent`. The pools do not either — everybody picks for everybody,
 * so knowing who contributed what says nothing about who was assigned whom.
 *
 * It does show email addresses and every pool, including the organiser's own
 * if they are playing. That is deliberate: this page is behind Identity and
 * exists to let one person see the whole event. Looking at your own pool spoils
 * your own shortlist, and nothing here stops you.
 */
export function AdminConsole({
  summary,
  pools,
  poolsError,
  nudge = null,
}: {
  summary: EventSummary;
  pools: ParticipantPool[];
  poolsError: string | null;
  /** Null when there is no draw yet, or the selections could not be read. */
  nudge?: NudgeStatus | null;
}) {
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
                <strong>{p.name}</strong>{" "}
                {p.email ? (
                  <a className="underline opacity-80" href={`mailto:${p.email}`}>
                    {p.email}
                  </a>
                ) : (
                  // Blanked by `npm run forget -- <name> --redact`. Saying so
                  // beats a mailto: link to nowhere, and beats leaving the
                  // organiser to wonder whether the address was ever collected.
                  <span className="opacity-60">address erased at their request</span>
                )}
                <span className="block opacity-70">
                  avoids {p.colorVeto ?? "no colour"}
                  {p.themeVeto ? `, not ${p.themeVeto}` : ""}
                  {p.themeWish ? `, would like ${p.themeWish}` : ""}
                </span>
                <DiscordTag discord={p.discord} />
              </li>
            ))}
          </ul>
        )}

        {summary.participantCount > 0 ? (
          <p className="text-xs opacity-70">
            <a
              className="underline"
              href={`mailto:?bcc=${summary.participants
                .filter((p) => p.email !== "")
                .map((p) => encodeURIComponent(p.email))
                .join(",")}`}
            >
              Open a blank email to everyone
            </a>{" "}
            — addresses go in Bcc, so nobody sees the others. Private links are
            per-person and must still be sent individually.
          </p>
        ) : null}
      </section>

      {nudge && nudge.participantCount > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Who to chase</h2>
          <p className="text-sm opacity-80">
            {nudge.picksIn} of {nudge.picksRequired} picks are in. The pools
            below show the same shortfall per <em>pool</em>, which is the wrong
            way round for chasing anybody — one slow person appears under every
            other participant. This counts per person.
          </p>

          {nudge.complete ? (
            <p className="rounded-xl border border-emerald-500/40 px-4 py-3 text-sm">
              Everybody has picked. Nothing to chase, and the exchange is
              unlocked.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-slate-300/20 text-sm">
                {nudge.outstanding.map((entry) => (
                  <li
                    className="flex flex-wrap items-baseline justify-between gap-x-3 py-2"
                    key={entry.name}
                  >
                    <span>
                      <strong>{entry.name}</strong>{" "}
                      <DiscordTag discord={entry.discord} />
                    </span>
                    <span className="opacity-70">
                      {entry.owed} pick{entry.owed === 1 ? "" : "s"} to go
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center gap-4">
                <button
                  className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
                  disabled={pending}
                  onClick={() => dispatch(() => nudgeAction())}
                  type="button"
                >
                  {pending ? "Posting…" : "Post a nudge to Discord"}
                </button>
                {/*
                  The mail fallback, for a group that does not use Discord or a
                  webhook that is not configured yet. Bcc, so nobody sees the
                  others, and only the people who still owe picks.
                */}
                <a
                  className="text-sm underline"
                  href={mailtoStragglers(summary, nudge)}
                >
                  Or email just these people
                </a>
              </div>
            </>
          )}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Pools</h2>
        <p className="text-sm opacity-80">
          What each person&rsquo;s shortlist will be drawn from: their own two
          choices from sign-up, plus one from every other participant. Four
          distinct choices are needed before the exchange unlocks.
        </p>

        {poolsError ? (
          <p className="rounded-xl border border-amber-500/40 px-4 py-3 text-sm">
            The pools could not be read ({poolsError}). Everything else on this
            page still works.
          </p>
        ) : null}

        {!poolsError && pools.length === 0 ? (
          <p className="text-sm opacity-80">
            Nothing to show until the draw has run.
          </p>
        ) : null}

        <ul className="space-y-4">
          {pools.map((pool) => (
            <li
              className="rounded-xl border border-slate-300/25 p-4 text-sm"
              key={pool.name}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <strong>{pool.name}</strong>
                <span
                  className={`text-xs ${
                    pool.distinctCount >= 4 ? "opacity-70" : "text-amber-400"
                  }`}
                >
                  {pool.distinctCount} distinct
                  {pool.awaiting.length > 0
                    ? ` · waiting on ${pool.awaiting.length}`
                    : " · everyone has picked"}
                </span>
              </div>

              <dl className="mt-3 space-y-3">
                <div>
                  <dt className="text-xs uppercase tracking-wide opacity-60">
                    Their own two
                  </dt>
                  <dd>
                    <ul className="mt-1 space-y-1">
                      {pool.own.map((pick) => (
                        <li key={pickId(pick)}>
                          <PickName pick={pick} />
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>

                <div>
                  <dt className="text-xs uppercase tracking-wide opacity-60">
                    Chosen for them ({pool.contributed.length})
                  </dt>
                  <dd>
                    {pool.contributed.length === 0 ? (
                      <p className="mt-1 opacity-70">Nobody has picked yet.</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {pool.contributed.map((entry) => (
                          <li key={`${entry.from}-${pickId(entry.pick)}`}>
                            <PickName pick={entry.pick} />
                            <span className="opacity-60"> — from {entry.from}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </dd>
                </div>

                {pool.awaiting.length > 0 ? (
                  <div>
                    <dt className="text-xs uppercase tracking-wide opacity-60">
                      Still to pick for them
                    </dt>
                    <dd className="mt-1 opacity-70">{pool.awaiting.join(", ")}</dd>
                  </div>
                ) : null}
              </dl>
            </li>
          ))}
        </ul>
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
            <span className="text-sm font-medium">Email</span>
            <input
              className={FIELD_CLASS}
              name="email"
              placeholder="leave empty to keep"
              type="email"
            />
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
            <span className="text-sm font-medium">Discord</span>
            <input
              className={FIELD_CLASS}
              name="discord"
              placeholder="user id (pings) or handle — leave empty to keep"
              type="text"
            />
            <span className="block text-xs opacity-70">
              Only a numeric <strong>user id</strong> produces a real ping.
              Turn on Discord&rsquo;s Settings &gt; Advanced &gt; Developer
              Mode, then right-click the person and{" "}
              <em>Copy User ID</em>. A handle is stored and shown, but notifies
              nobody. Type <code>none</code> to clear.
            </span>
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
