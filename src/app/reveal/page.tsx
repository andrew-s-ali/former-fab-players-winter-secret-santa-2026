import Link from "next/link";
import { notFound } from "next/navigation";
import { RevealRing } from "@/components/RevealRing";
import { eventTitle } from "@/lib/event";
import { isRevealed } from "@/lib/participants";
import { buildRing } from "@/lib/ring";
import { readEvent } from "@/lib/store";

// Reflects live data; must never be prerendered at build time.
export const dynamic = "force-dynamic";

export const metadata = { title: "Reveal day" };

export default async function RevealDayPage() {
  const event = await readEvent();

  // Locked, or no draw yet: indistinguishable from a page that doesn't exist.
  if (!isRevealed(event) || event.participants.length < 2) {
    notFound();
  }

  const ring = buildRing(event.participants);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-3xl font-semibold">{eventTitle()}</h1>
      <h2 className="text-xl">Who had who</h2>
      <p className="opacity-70">
        One gift chain, all the way round. Reveal them one at a time.
      </p>

      <RevealRing ring={ring} />

      <Link className="underline" href="/">
        ← Back to the rules
      </Link>
    </main>
  );
}
