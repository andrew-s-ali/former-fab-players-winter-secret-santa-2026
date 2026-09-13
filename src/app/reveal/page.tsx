import Link from "next/link";
import { notFound } from "next/navigation";
import { RevealRing } from "@/components/RevealRing";
import {
  readRevealedShortlists,
  type RevealedShortlist,
} from "@/lib/card-selections";
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

  /**
   * What each builder was choosing between, in the ring's own order.
   *
   * Looked up by name because that is what a `RingStep` carries; names are
   * unique across an event (the draw refuses a clash), so this is safe.
   * Missing entries stay null and the page simply shows the pairing alone —
   * a shortlist can be absent if somebody never opened their link.
   */
  /*
    The ring is the page; the cards under it are a bonus. The ring comes from
    the event store and the shortlists from Postgres, so a database that is
    unreachable — or deliberately absent, as in the E2E fixture — must cost the
    cards and not the pairings everybody came to see.
  */
  let shortlists: RevealedShortlist[] = [];
  if (process.env.CARD_SELECTIONS_DISABLED !== "1") {
    try {
      shortlists = await readRevealedShortlists(event.participants);
    } catch (error) {
      console.error("Reveal day: the shortlists could not be read.", error);
    }
  }
  const byGiverId = new Map(shortlists.map((entry) => [entry.giverId, entry]));
  const idByName = new Map(
    event.participants.map((participant) => [participant.name, participant.id])
  );
  const builds = ring.steps.map((step) => {
    const entry = byGiverId.get(idByName.get(step.from) ?? "");
    return entry
      ? {
          cards: entry.cards,
          builtPickId: entry.builtPickId,
          decklistUrl: entry.decklistUrl,
        }
      : null;
  });

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <h1 className="text-3xl font-semibold">{eventTitle()}</h1>
      <h2 className="text-xl">Who had who</h2>
      <p className="opacity-70">
        One gift chain, all the way round. Reveal them one at a time.
      </p>

      <RevealRing builds={builds} ring={ring} />

      <Link className="underline" href="/">
        ← Back to the rules
      </Link>
    </main>
  );
}
