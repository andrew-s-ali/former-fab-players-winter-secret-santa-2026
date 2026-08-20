import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "@/components/SignupForm";
import { siteNow } from "@/lib/clock";
import { eventTitle, SIGNUPS_CLOSE_AT } from "@/lib/event";
import { formatEventDate } from "@/lib/launch";
import { signupsOpen } from "@/lib/signup";

export const metadata: Metadata = {
  title: `Sign up — ${eventTitle()}`,
};

/**
 * Rendered per request rather than at build time.
 *
 * The open/closed state turns over on a date, and a statically rendered page
 * would keep offering the form after sign-ups had closed until something else
 * happened to trigger a rebuild.
 */
export const dynamic = "force-dynamic";

function closingDate(): string {
  return formatEventDate(SIGNUPS_CLOSE_AT);
}

export default function SignupPage() {
  const open = signupsOpen(siteNow());

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Sign up</h1>

      {open ? (
        <>
          <p className="text-sm opacity-80">
            Sign-ups close on {closingDate()}. Everything except your name is
            optional — leave a box empty if you have no strong feelings.
          </p>
          <SignupForm />
        </>
      ) : (
        <p className="rounded-xl border border-slate-300/30 px-4 py-3 text-sm">
          Sign-ups closed at the end of {closingDate()}. If you meant to be in and
          aren&rsquo;t, talk to the organiser — they can still add you by hand
          before the draw runs.
        </p>
      )}

      <Link className="underline" href="/">
        ← Back
      </Link>
    </main>
  );
}
