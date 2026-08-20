"use client";

import { useEffect, useState } from "react";
import {
  acceptInvite,
  getSettings,
  handleAuthCallback,
  login,
  oauthLogin,
  updateUser,
  type AuthProvider,
} from "@netlify/identity";

const FIELD_CLASS =
  "w-full rounded-lg border border-slate-300/40 bg-transparent px-3 py-2 text-sm";

/** What the page is currently asking for. */
type Mode =
  | { kind: "loading" }
  | { kind: "login" }
  /** Arrived from an invite email; needs a password to finish creating the account. */
  | { kind: "invite"; token: string }
  /** Arrived from a recovery email; signed in, but must choose a new password. */
  | { kind: "recovery" };

/**
 * Sign-in for the organiser console.
 *
 * Handles four entry points, all of which land here:
 *
 * - a normal email/password sign-in;
 * - an invite link, which carries an `invite_token` in the URL hash;
 * - a password-recovery link;
 * - an OAuth redirect coming back from a provider.
 *
 * `handleAuthCallback()` is what turns the hash into a session, and it has to
 * run on a page that does *not* require authentication — hence a separate
 * route from `/admin` rather than a modal on top of it.
 *
 * Which OAuth providers exist is read from `getSettings()` rather than
 * hard-coded, so enabling one in the Netlify dashboard is enough to make its
 * button appear.
 */
export function OrganizerLogin() {
  const [mode, setMode] = useState<Mode>({ kind: "loading" });
  const [providers, setProviders] = useState<AuthProvider[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      // Order matters: consume the URL hash before anything else, or a second
      // render can clear it and lose the invite.
      try {
        const result = await handleAuthCallback();
        if (!active) {
          return;
        }
        if (result?.type === "invite" && result.token) {
          setMode({ kind: "invite", token: result.token });
        } else if (result?.type === "recovery") {
          setMode({ kind: "recovery" });
        } else if (result?.user) {
          window.location.replace("/admin");
          return;
        } else {
          setMode({ kind: "login" });
        }
      } catch (cause) {
        if (!active) {
          return;
        }
        setError(cause instanceof Error ? cause.message : String(cause));
        setMode({ kind: "login" });
      }

      try {
        const settings = await getSettings();
        if (!active) {
          return;
        }
        setProviders(
          (Object.entries(settings.providers) as [AuthProvider, boolean][])
            .filter(([provider, enabled]) => enabled && provider !== "email")
            .map(([provider]) => provider)
        );
      } catch {
        // Identity is unreachable — off-platform, or not enabled yet. The
        // password form still renders; only the OAuth buttons are missing.
      }
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, []);

  async function attempt(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      window.location.replace("/admin");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  if (mode.kind === "loading") {
    return <p className="text-sm opacity-70">Checking…</p>;
  }

  const passwordOnly = mode.kind === "invite" || mode.kind === "recovery";

  return (
    <div className="space-y-6">
      {mode.kind === "invite" ? (
        <p className="text-sm opacity-80">
          You&rsquo;ve been invited to help run the event. Choose a password to
          finish setting up your account.
        </p>
      ) : null}
      {mode.kind === "recovery" ? (
        <p className="text-sm opacity-80">Choose a new password.</p>
      ) : null}

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const password = String(data.get("password") ?? "");

          if (mode.kind === "invite") {
            void attempt(() => acceptInvite(mode.token, password));
          } else if (mode.kind === "recovery") {
            void attempt(() => updateUser({ password }));
          } else {
            void attempt(() => login(String(data.get("email") ?? ""), password));
          }
        }}
      >
        {passwordOnly ? null : (
          <label className="block space-y-1">
            <span className="text-sm font-medium">Email</span>
            <input
              autoComplete="email"
              className={FIELD_CLASS}
              name="email"
              required
              type="email"
            />
          </label>
        )}

        <label className="block space-y-1">
          <span className="text-sm font-medium">
            {passwordOnly ? "New password" : "Password"}
          </span>
          <input
            autoComplete={passwordOnly ? "new-password" : "current-password"}
            className={FIELD_CLASS}
            name="password"
            required
            type="password"
          />
        </label>

        <button
          className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
          disabled={busy}
          type="submit"
        >
          {busy ? "Working…" : passwordOnly ? "Set password" : "Sign in"}
        </button>
      </form>

      {providers.length > 0 && !passwordOnly ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm opacity-70">or</span>
          {providers.map((provider) => (
            <button
              className="rounded-lg border px-3 py-1.5 text-sm capitalize hover:bg-slate-100 dark:hover:bg-slate-800"
              key={provider}
              onClick={() => oauthLogin(provider)}
              type="button"
            >
              Continue with {provider}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
