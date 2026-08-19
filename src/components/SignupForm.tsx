"use client";

import { useState } from "react";
import {
  COLOR_CHOICES,
  HONEYPOT_FIELD,
  SIGNUP_ACTION,
  SIGNUP_FIELDS,
  SIGNUP_FORM_NAME,
} from "@/lib/signup";

type Status = "idle" | "submitting" | "done" | "error";

const FIELD_CLASS =
  "w-full rounded-lg border border-slate-300/40 bg-transparent px-3 py-2 text-sm";

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
 */
export function SignupForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
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
        You&rsquo;re in. Your secret link will be sent to you privately once the
        draw runs — nothing else to do until then.
      </p>
    );
  }

  return (
    <form
      className="space-y-4"
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
          However people know you in the group — this is how your gifter will
          see you, and how the organiser looks you up later.
        </span>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">A colour you&rsquo;d rather not receive</span>
        <select className={FIELD_CLASS} defaultValue="" name={SIGNUP_FIELDS.colorVeto}>
          {COLOR_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
        <span className="block text-xs opacity-70">
          Commanders with this colour in their identity are hidden from whoever
          builds your deck.
        </span>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">A theme you&rsquo;d like</span>
        <textarea className={FIELD_CLASS} name={SIGNUP_FIELDS.themeWish} rows={2} />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">A theme you&rsquo;d rather avoid</span>
        <input className={FIELD_CLASS} name={SIGNUP_FIELDS.themeVeto} type="text" />
      </label>

      <button
        className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
        disabled={status === "submitting"}
        type="submit"
      >
        {status === "submitting" ? "Sending…" : "Sign me up"}
      </button>

      {status === "error" ? (
        <p className="text-sm text-red-500" role="alert">
          That didn&rsquo;t send{error ? ` (${error})` : ""}. Try again, and tell
          the organiser if it keeps failing.
        </p>
      ) : null}
    </form>
  );
}
