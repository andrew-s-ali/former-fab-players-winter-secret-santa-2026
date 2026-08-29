import type { Metadata } from "next";
import Link from "next/link";
import { getUser } from "@netlify/identity";
import { AdminConsole } from "@/components/AdminConsole";
import { buildPools, summarizeEvent, type ParticipantPool } from "@/lib/admin";
import { readAllSelections } from "@/lib/card-selections";
import { isOrganizer } from "@/lib/organizer";
import type { EventData } from "@/lib/participants";
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
/**
 * Reads the pools, tolerating a database that is not answering.
 *
 * The roster, the reveal toggle and the participant edits all come from Blobs
 * and work without Postgres. Letting a database problem throw here would take
 * the whole console down — including the reveal-day switch — for a section
 * that is reference material.
 */
async function loadPools(
  event: EventData
): Promise<{ pools: ParticipantPool[]; poolsError: string | null }> {
  if (event.participants.length === 0) {
    return { pools: [], poolsError: null };
  }
  try {
    return {
      pools: buildPools(event, await readAllSelections(event.participants)),
      poolsError: null,
    };
  } catch (error) {
    console.error("Organiser console: could not read card selections", error);
    return {
      pools: [],
      poolsError:
        error instanceof Error ? error.message : "The card selections could not be read.",
    };
  }
}

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

  const event = await readEvent();
  const { pools, poolsError } = await loadPools(event);

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Organiser console</h1>
        <p className="mt-1 text-sm opacity-70">
          Signed in as {user?.email ?? "an organiser"}.
        </p>
      </div>

      <AdminConsole
        pools={pools}
        poolsError={poolsError}
        summary={summarizeEvent(event)}
      />
    </main>
  );
}
