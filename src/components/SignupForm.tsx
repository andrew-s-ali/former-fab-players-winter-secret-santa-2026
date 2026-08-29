"use client";

import { useState } from "react";
import Link from "next/link";
import { CommanderCombobox } from "@/components/CommanderCombobox";
import { PartnerPicker } from "@/components/PartnerPicker";
import { PickCards, PickName } from "@/components/PickCards";
import { useCommanderOptions } from "@/components/use-commander-options";
import type { CommanderOption } from "@/lib/commanders";
import {
  canBePrimary,
  canTakePartner,
  pickCards,
  pickColorIdentity,
  pickId,
  pickName,
  soloPick,
  type PickOf,
} from "@/lib/pairing";
import {
  COLOR_CHOICES,
  COLOR_CODES,
  HONEYPOT_FIELD,
  SELF_CARD_COUNT,
  SELF_CARD_FIELDS,
  SIGNUP_ACTION,
  SIGNUP_FIELDS,
  SIGNUP_FORM_NAME,
} from "@/lib/signup";

type Status = "idle" | "submitting" | "done" | "error";

const FIELD_CLASS =
  "w-full rounded-lg border border-slate-300/40 bg-transparent px-3 py-2 text-sm";

/** One chosen commander, plus its partner if they added one. */
type Pick = PickOf<CommanderOption>;

/** The hidden field names, in slot order. */
const SELF_CARD_INPUTS = SELF_CARD_FIELDS;

function PickedCard({ pick, remove }: { pick: Pick; remove: () => void }) {
  return (
    <article className="flex items-start gap-3 rounded-xl border border-slate-300/25 p-3">
      <PickCards pick={pick} size="thumb" />
      <div className="space-y-2">
        <h3 className="font-semibold leading-tight">
          <PickName pick={pick} />
        </h3>
        <button className="text-sm underline" onClick={remove} type="button">
          Remove
        </button>
      </div>
    </article>
  );
}

/**
 * The sign-up form, submitted to Netlify Forms over AJAX.
 *
 * Why AJAX rather than a plain form POST: a native submission navigates to the
 * POST target, which here is the bare skeleton file at /__forms.html — the
 * participant would land on an empty page. Handling it in JS keeps them on the
 * styled page and lets us show a confirmation.
 *
 * Two details are load-bearing and easy to lose in a refactor:
 *
 * - the body must be URL-encoded; Netlify does not accept JSON;
 * - `form-name` must be in the body, or the submission is not attributed to a
 *   registered form and is discarded.
 *
 * Both come along automatically here because the hidden inputs are inside the
 * <form> and the body is built with FormData.
 *
 * The two commander picks are React state rather than plain inputs because
 * they are chosen from the browser rather than typed, and because the colour
 * veto can invalidate one after it has been picked. They reach the submission
 * through hidden inputs, as card names — see `ParticipantInput.selfCards`.
 */
export function SignupForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [colorVeto, setColorVeto] = useState("");
  const [picks, setPicks] = useState<Pick[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  /** A commander chosen but not yet committed, while a partner is offered. */
  const [pendingPrimary, setPendingPrimary] = useState<CommanderOption | null>(null);
  const { options, failed: optionsError } = useCommanderOptions();

  const vetoCode = COLOR_CODES[colorVeto] ?? null;
  const complete = picks.length === SELF_CARD_COUNT;

  // Every card already spoken for, either half of either pick.
  const usedIds = new Set(picks.flatMap((pick) => pickCards(pick).map((c) => c.id)));
  const available = (options ?? []).filter(
    (option) =>
      !usedIds.has(option.id) &&
      (!vetoCode || !option.colorIdentity.includes(vetoCode))
  );
  // Backgrounds are only ever the second half of a pair, so they are not
  // offered as a commander in their own right.
  const eligible = available.filter(canBePrimary);

  function commit(pick: Pick) {
    setPicks((current) =>
      current.some((existing) => pickId(existing) === pickId(pick))
        ? current
        : [...current, pick]
    );
    setPendingPrimary(null);
    setNotice(null);
  }

  /**
   * Dropping a pick the new veto forbids, rather than letting it through.
   *
   * Picking a card and then changing the veto underneath it is an ordinary
   * thing to do on a form, and the result would otherwise be a submission the
   * draw rejects hours later, when nobody is around to ask.
   */
  function changeVeto(value: string) {
    setColorVeto(value);
    const code = COLOR_CODES[value] ?? null;
    if (!code) {
      return;
    }
    // A pair's combined identity: a partner can bring in the vetoed colour
    // even when the commander does not.
    const clashing = picks.filter((pick) => pickColorIdentity(pick).includes(code));
    if (clashing.length === 0 && (pendingPrimary === null ||
        !pendingPrimary.colorIdentity.includes(code))) {
      return;
    }
    setPicks((current) =>
      current.filter((pick) => !pickColorIdentity(pick).includes(code))
    );
    if (pendingPrimary?.colorIdentity.includes(code)) {
      setPendingPrimary(null);
    }
    if (clashing.length > 0) {
      setNotice(
        `${clashing.map((pick) => pickName(pick)).join(" and ")} ` +
          `${clashing.length === 1 ? "was" : "were"} removed — ` +
          "your own picks can't include the colour you asked to avoid. " +
          "Choose again below."
      );
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!complete) {
      setStatus("error");
      setError(`Choose ${SELF_CARD_COUNT} commanders before sending.`);
      return;
    }

    setStatus("submitting");
    setError(null);

    try {
      // FormData is not directly assignable to URLSearchParams, and copying
      // it by hand also drops any File entry rather than stringifying it.
      const encoded = new URLSearchParams();
      for (const [key, value] of new FormData(form).entries()) {
        if (typeof value === "string") {
          encoded.append(key, value);
        }
      }

      const response = await fetch(SIGNUP_ACTION, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: encoded.toString(),
      });

      if (!response.ok) {
        throw new Error(`Netlify returned ${response.status}`);
      }

      form.reset();
      setPicks([]);
      setColorVeto("");
      setNotice(null);
      setStatus("done");
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  if (status === "done") {
    return (
      <p
        className="rounded-xl border border-emerald-500/40 px-4 py-3 text-sm"
        role="status"
      >
        You&rsquo;re in, and your two commanders are in your pool. When sign-ups
        close you&rsquo;ll get a private link — it opens a card workshop where
        you pick one commander for each other player. Once everyone has
        finished, the picks lock and the link shows you who you&rsquo;re
        building for.
      </p>
    );
  }

  return (
    <form
      className="space-y-6"
      data-netlify="true"
      method="post"
      name={SIGNUP_FORM_NAME}
      onSubmit={handleSubmit}
    >
      <input type="hidden" name="form-name" value={SIGNUP_FORM_NAME} />

      {/*
        Honeypot. Hidden from people, irresistible to bots; anything typed in
        it makes Netlify drop the submission silently. `hidden` rather than a
        visually-hidden class on purpose — a screen reader should not offer it
        either, or a real participant fills it in and vanishes.
      */}
      <p hidden>
        <label>
          Leave this empty
          <input name={HONEYPOT_FIELD} tabIndex={-1} />
        </label>
      </p>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Your name</span>
        <input
          autoComplete="name"
          className={FIELD_CLASS}
          name={SIGNUP_FIELDS.name}
          required
          type="text"
        />
        <span className="block text-xs opacity-70">
          However people know you in the group — every other player sees this
          when they choose a commander for you, and it is how the organiser
          looks you up later.
        </span>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Your email</span>
        <input
          autoComplete="email"
          className={FIELD_CLASS}
          name={SIGNUP_FIELDS.email}
          required
          type="email"
        />
        <span className="block text-xs opacity-70">
          Only the organiser sees this. It&rsquo;s how your private link reaches
          you when sign-ups close — no other player is shown it.
        </span>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">A colour you&rsquo;d rather not receive</span>
        <select
          className={FIELD_CLASS}
          name={SIGNUP_FIELDS.colorVeto}
          onChange={(event) => changeVeto(event.target.value)}
          value={colorVeto}
        >
          {COLOR_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
        <span className="block text-xs opacity-70">
          Commanders with this colour in their identity are hidden from everyone
          choosing a card for you, and from your own two picks below. Set it
          before you pick.
        </span>
      </label>

      <fieldset className="space-y-4 rounded-xl border border-slate-300/30 p-4">
        <legend className="px-1 text-sm font-medium">
          Your two commanders ({picks.length} of {SELF_CARD_COUNT} chosen)
        </legend>

        <p className="text-xs opacity-70">
          These two go into your own pool. Everyone else adds one more card to
          it, and whoever ends up building your deck is shown a shortlist drawn
          from the whole pool — so pick two you would genuinely be happy to
          receive, not two you think are strongest.
        </p>

        {/*
          Names rather than ids: these are what the organiser reads in the
          Netlify Forms dashboard, and what the CSV fallback carries.
        */}
        {SELF_CARD_INPUTS.map((slot, index) => (
          <span key={slot.commander}>
            <input
              name={slot.commander}
              type="hidden"
              value={picks[index]?.commander.name ?? ""}
            />
            <input
              name={slot.partner}
              type="hidden"
              value={picks[index]?.partner?.name ?? ""}
            />
          </span>
        ))}

        {notice ? (
          <p className="rounded-lg bg-amber-500/15 p-3 text-sm" role="status">
            {notice}
          </p>
        ) : null}

        {picks.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {picks.map((pick) => (
              <PickedCard
                key={pickId(pick)}
                pick={pick}
                remove={() =>
                  setPicks((current) =>
                    current.filter((candidate) => pickId(candidate) !== pickId(pick))
                  )
                }
              />
            ))}
          </div>
        ) : null}

        {complete ? null : (
          <>
            {optionsError ? (
              <p className="text-sm text-red-500" role="alert">
                Couldn&rsquo;t load the card list. Reload the page, and tell the
                organiser if it keeps failing.
              </p>
            ) : pendingPrimary ? (
              <PartnerPicker
                colorVeto={vetoCode}
                onChoose={(partner) => commit({ commander: pendingPrimary, partner })}
                onSkip={() => commit(soloPick(pendingPrimary))}
                options={available}
                primary={pendingPrimary}
                skipLabel={`Save ${pendingPrimary.name} on its own`}
              />
            ) : (
              <CommanderCombobox
                disabled={options === null}
                hint={
                  options === null
                    ? "Loading the card list…"
                    : vetoCode
                      ? `${eligible.length} legal commanders, with the colour you vetoed already excluded.`
                      : `${eligible.length} legal commanders to choose from.`
                }
                label={`Find your ${picks.length === 0 ? "first" : "second"} commander`}
                onChoose={(card) => {
                  // A commander that can take a partner pauses here so they
                  // can add one; anything else is committed straight away.
                  setNotice(null);
                  setPendingPrimary(card);
                  if (!canTakePartner(card)) {
                    commit(soloPick(card));
                  }
                }}
                options={eligible}
              />
            )}

            <p className="text-xs opacity-70">
              Not sure what to pick?{" "}
              <Link
                className="underline"
                href="/commanders"
                rel="noreferrer"
                target="_blank"
              >
                Browse every legal commander
              </Link>{" "}
              — opens in a new tab, so you won&rsquo;t lose what you&rsquo;ve
              filled in here.
            </p>
          </>
        )}
      </fieldset>

      <label className="block space-y-1">
        <span className="text-sm font-medium">A theme you&rsquo;d like</span>
        <textarea className={FIELD_CLASS} name={SIGNUP_FIELDS.themeWish} rows={2} />
        <span className="block text-xs opacity-70">
          Only the person who ends up building your deck sees this — not the
          rest of the group.
        </span>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">A theme you&rsquo;d rather avoid</span>
        <input className={FIELD_CLASS} name={SIGNUP_FIELDS.themeVeto} type="text" />
      </label>

      <button
        className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
        disabled={status === "submitting" || !complete}
        type="submit"
      >
        {status === "submitting" ? "Sending…" : "Sign me up"}
      </button>

      {!complete ? (
        <p className="text-sm opacity-70">
          Choose {SELF_CARD_COUNT - picks.length} more commander
          {SELF_CARD_COUNT - picks.length === 1 ? "" : "s"} to finish signing up.
        </p>
      ) : null}

      {status === "error" ? (
        <p className="text-sm text-red-500" role="alert">
          That didn&rsquo;t send{error ? ` (${error})` : ""}. Try again, and tell
          the organiser if it keeps failing.
        </p>
      ) : null}
    </form>
  );
}
