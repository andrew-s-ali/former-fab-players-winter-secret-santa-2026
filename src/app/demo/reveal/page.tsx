import Link from "next/link";
import { DemoBadge } from "@/components/DemoBadge";
import { RevealRing } from "@/components/RevealRing";
import { readDemoEvent } from "@/lib/demo";
import { isRevealed } from "@/lib/participants";
import { buildRing } from "@/lib/ring";

export const metadata = {
  title: "Demo reveal",
  robots: { index: false, follow: false },
};

export default function DemoRevealPage() {
  const event = readDemoEvent();

  // Unlike the real page this explains itself rather than 404ing: on a demo,
  // a dead end teaches nothing.
  if (!isRevealed(event)) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 p-8">
        <DemoBadge />
        <h1 className="text-2xl font-semibold">Reveal day is locked</h1>
        <p className="opacity-70">
          The real page 404s in this state. Re-seed with{" "}
          <code>npm run seed:demo -- --revealed</code> to see the ring.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <DemoBadge />
      <h1 className="text-3xl font-semibold">Who had who</h1>
      <RevealRing ring={buildRing(event.participants)} />
      <Link className="underline" href="/demo">
        ← Back to the demo links
      </Link>
    </main>
  );
}
