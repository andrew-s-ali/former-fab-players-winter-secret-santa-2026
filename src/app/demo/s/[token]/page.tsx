import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoBadge } from "@/components/DemoBadge";
import { RevealDetails } from "@/components/RevealDetails";
import { RulesSummary } from "@/components/RulesSummary";
import { SignupSummary } from "@/components/SignupSummary";
import { DeckDeadline } from "@/components/DeckDeadline";
import { DemoCardTrade } from "@/components/DemoCardTrade";
import { DemoCardWorkshop } from "@/components/DemoCardWorkshop";
import { pickSecretCards } from "@/lib/card-pool";
import {
  readDemoEvent,
  readDemoSelections,
  readDemoWorkspace,
  stableRandom,
} from "@/lib/demo";
import { findById, findByToken } from "@/lib/participants";

export const metadata = {
  title: "Demo reveal page",
  robots: { index: false, follow: false },
};

export default async function DemoTokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ phase?: string | string[] }>;
}) {
  const { token } = await params;
  const { phase } = await searchParams;
  const showWorkshop = phase === "workshop";
  const event = readDemoEvent();
  const giver = findByToken(event, token);
  if (!giver) {
    notFound();
  }

  const recipient = findById(event, giver.recipientId);
  if (!recipient) {
    notFound();
  }

  // The real function over the real (committed, invented) selections: the
  // recipient's two sign-up cards plus every other participant's pick for
  // them, this giver's included. Seeded so the draw is stable across renders.
  const shortlist = pickSecretCards(
    readDemoSelections(),
    recipient,
    stableRandom(giver.token)
  );
  if (!shortlist) {
    throw new Error(
      `Demo data is incomplete: ${recipient.name}'s pool has fewer than four unique cards.`
    );
  }
  const workspace = readDemoWorkspace(giver.id);

  const targets = event.participants
    .filter((participant) => participant.id !== giver.id)
    .map((participant) => ({
      id: participant.id,
      name: participant.name,
      colorVeto: participant.colorVeto,
    }));

  if (showWorkshop) {
    const selections = readDemoSelections();
    // A workshop caught partway: this person has picked for the first few and
    // still owes the rest, which is the state the page exists to handle.
    const mine = selections.filter((row) => row.selectorId === giver.id);
    const done = mine.slice(0, Math.ceil(mine.length / 2));
    const peerCards = Object.fromEntries(
      targets.map((target) => [
        target.id,
        done.find((row) => row.recipientId === target.id)?.card ?? null,
      ])
    );

    return (
      <main className="mx-auto max-w-4xl space-y-8 p-6 sm:p-8">
        <DemoBadge />
        <h1 className="text-3xl font-semibold">Hi {giver.name}</h1>

        <p className="rounded-xl border border-slate-300/25 p-4 text-sm">
          This is what the private link shows <strong>before</strong> everyone
          has finished — the stage where each person picks one commander for
          every other participant. Nobody&rsquo;s assignment opens until all of
          these are in.{" "}
          <Link className="underline" href={`/demo/s/${token}`}>
            See the finished page instead →
          </Link>
        </p>

        <SignupSummary
          cards={giver.selfCards}
          colorVeto={giver.colorVeto}
          themeVeto={giver.themeVeto}
          themeWish={giver.themeWish}
        exchangeRanking={giver.exchangeRanking}
        />

        <DemoCardWorkshop
          initialPeerCards={peerCards}
          othersCompleted={targets.length * targets.length}
          targets={targets}
          token={token}
          totalSlots={event.participants.length * targets.length}
        />

        <RulesSummary />

        <Link className="underline" href="/demo">
          ← Back to the demo links
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6 sm:p-8">
      <DemoBadge />
      <h1 className="text-3xl font-semibold">Hi {giver.name}</h1>

      <p className="rounded-xl border border-slate-300/25 p-4 text-sm">
        This is the finished page, once everyone has picked.{" "}
        <Link className="underline" href={`/demo/s/${token}?phase=workshop`}>
          See what it looks like before that →
        </Link>
      </p>

      <SignupSummary
        cards={giver.selfCards}
        colorVeto={giver.colorVeto}
        themeVeto={giver.themeVeto}
        themeWish={giver.themeWish}
        exchangeRanking={giver.exchangeRanking}
      />

      <section className="space-y-6 rounded-2xl border border-sky-200/20 bg-sky-950/20 p-5 sm:p-6">
        <RevealDetails recipient={recipient} />

        <div className="space-y-3">
          <p className="text-sm opacity-70">
            Drawn from {recipient.name}&rsquo;s pool — their own two cards plus
            everyone else&rsquo;s pick for them, yours included. Try the one-time
            trade: it works here exactly as it would on a real link, except
            that you can undo it.
          </p>
          <DemoCardTrade shortlist={shortlist} token={token} />
        </div>
      </section>

      <Link className="underline" href="/commanders">
        Browse every legal commander →
      </Link>

      {/* The real page says this here too; a demo that omits it teaches a
          page that does not exist. */}
      <DeckDeadline />

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Your decklist</h2>
        <p className="text-sm opacity-70">
          On a real link this saves the deck you&rsquo;re building against your
          token, so it survives switching device. Read-only in the demo, which
          never touches the database.
        </p>
        <input
          className="w-full rounded-lg border border-slate-300/40 bg-transparent px-3 py-2 text-sm opacity-50"
          disabled
          placeholder="https://moxfield.com/decks/…"
          readOnly
          type="url"
          value={workspace.decklistUrl ?? ""}
        />
        <p className="text-xs opacity-70">
          {workspace.decklistUrl
            ? "This participant has saved a link."
            : "This participant hasn't saved one yet — the box starts empty."}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Private notes</h2>
        <p className="text-sm opacity-70">
          On a real link these save against your token as you type, so they
          follow you between devices. Read-only in the demo, which never
          touches the database.
        </p>
        <textarea
          aria-label="Private notes"
          className="w-full rounded-xl border border-slate-300/40 bg-slate-50/50 p-3 text-sm opacity-50 dark:border-slate-700/60 dark:bg-slate-900/50"
          placeholder="e.g. deck ideas, card links, budget notes..."
          readOnly
          rows={4}
          value={workspace.notes}
        />
      </section>

      <RulesSummary />

      <Link className="underline" href="/demo">
        ← Back to the demo links
      </Link>
    </main>
  );
}
