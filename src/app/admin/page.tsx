import type { Metadata } from "next";
import Link from "next/link";
import { getUser } from "@netlify/identity";
import { AdminConsole } from "@/components/AdminConsole";
import { summarizeEvent } from "@/lib/admin";
import { isOrganizer } from "@/lib/organizer";
import { readEvent } from "@/lib/store";

export const metadata: Metadata = {
  title: "Organiser console",
  robots: { index: false, follow: false },
};

/**
 * Never cached, never prerendered.
 *
 * The whole page is a function of who is asking, and it reads live event
 * state. A static render would either bake in one user's view or expose the
 * console's contents to everyone.
 */
export const dynamic = "force-dynamic";

/**
 * The organiser console.
 *
 * Rendering is gated here and every Server Action re-checks the role
 * independently — see `actions.ts`. This check controls what is shown; that
 * one controls what can be done.
 *
 * Locally this always renders the signed-out state: Netlify Identity has no
 * local equivalent, and `getUser()` returns null off-platform rather than
 * throwing. Test the real flow on a Deploy Preview.
 */
export default async function AdminPage() {
  const user = await getUser();

  if (!isOrganizer(user)) {
    return (
      <main className="mx-auto max-w-2xl space-y-6 p-8">
        <h1 className="text-3xl font-semibold tracking-tight">Organiser console</h1>
        <p className="rounded-xl border border-slate-300/30 px-4 py-3 text-sm">
          {user
            ? "You are signed in, but this account does not hold an admin, organiser, or organizer role. After changing roles in Netlify, sign in again to refresh access."
            : "You need to be signed in as an organiser to see this."}
        </p>
        <Link className="underline" href="/admin/login">
          {user ? "Sign in as someone else" : "Sign in"} →
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Organiser console</h1>
        <p className="mt-1 text-sm opacity-70">
          Signed in as {user?.email ?? "an organiser"}.
        </p>
      </div>

      <AdminConsole summary={summarizeEvent(await readEvent())} />
    </main>
  );
}
