import Link from "next/link";
import { notFound } from "next/navigation";
import { CommanderBrowser } from "@/components/CommanderBrowser";
import { CardSelectionStudio } from "@/components/CardSelectionStudio";
import { DecklistLink } from "@/components/DecklistLink";
import { RevealDetails } from "@/components/RevealDetails";
import { RulesSummary } from "@/components/RulesSummary";
import { SecretCardChoices } from "@/components/SecretCardChoices";
import { SecretScratchpad } from "@/components/SecretScratchpad";
import { SignupSummary } from "@/components/SignupSummary";
import { getOrCreateSecretCards, getSelectionWorkspace } from "@/lib/card-selections";
import { readDeckBuild } from "@/lib/deck-builds";
import { findById, findByToken, type Participant } from "@/lib/participants";
import { pickPrompt } from "@/lib/prompts";
import { readEvent } from "@/lib/store";

// Assignments must never be cached or prerendered.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your Secret Santa",
  robots: { index: false, follow: false },
};

/** Their own sign-up answers, collapsed — the same block in both phases. */
function OwnSignup({ giver }: { giver: Participant }) {
  return (
    <SignupSummary
      cards={giver.selfCards}
      colorVeto={giver.colorVeto}
      themeVeto={giver.themeVeto}
      themeWish={giver.themeWish}
      exchangeRanking={giver.exchangeRanking}
    />
  );
}

function BrowserLink() {
  return (
    <Link className="underline" href="/commanders">
      Browse every legal commander →
    </Link>
  );
}

export default async function RevealPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const event = await readEvent();
  const giver = findByToken(event, token);

  // Unknown and malformed tokens must be indistinguishable.
  if (!giver) {
    notFound();
  }

  const recipient = findById(event, giver.recipientId);
  if (!recipient) {
    // Data fault, not a bad URL: the giver exists but points at nobody.
    // The response stays an indistinguishable 404; this is for the organiser.
    console.error(
      `Reveal page: participant ${giver.id} has unresolvable recipientId ${giver.recipientId}`
    );
    notFound();
  }

  if (process.env.CARD_SELECTIONS_DISABLED !== "1") {
    const workspace = await getSelectionWorkspace(giver, event.participants);
    if (!workspace.ready) {
      return (
        <main className="mx-auto max-w-4xl space-y-8 p-6 sm:p-8">
          <h1 className="text-3xl font-semibold">Hi {giver.name}</h1>
          <OwnSignup giver={giver} />
          <CardSelectionStudio
            completedSlots={workspace.completedSlots}
            needsMoreVariety={workspace.needsMoreVariety}
            peerCards={workspace.peerCards}
            targets={event.participants
              .filter((participant) => participant.id !== giver.id)
              .map((participant) => ({
                id: participant.id,
                name: participant.name,
                colorVeto: participant.colorVeto,
              }))}
            token={token}
            totalSlots={workspace.totalSlots}
          />
          <RulesSummary />
        </main>
      );
    }

    const [secretCards, deckBuild] = await Promise.all([
      getOrCreateSecretCards(giver, recipient, event.participants),
      readDeckBuild(giver.id),
    ]);
    if (!secretCards) {
      throw new Error("Card selections became incomplete while opening the secret page.");
    }

    return (
      <main className="mx-auto max-w-4xl space-y-9 p-6 sm:p-8">
        <h1 className="text-3xl font-semibold">Hi {giver.name}</h1>

        {/* 1. Their own answers, out of the way until they want them. */}
        <OwnSignup giver={giver} />

        {/* 2. The job: who they build for, that person's asks, and the
            shortlist drawn from that person's pool. */}
        <section className="space-y-6 rounded-2xl border border-sky-200/20 bg-sky-950/20 p-5 sm:p-6">
          <RevealDetails recipient={recipient} />
          <SecretCardChoices
            cards={secretCards.cards}
            cashInUsed={secretCards.cashInUsed}
            token={token}
          />
        </section>

        {/* 3. */}
        <BrowserLink />

        {/* 4. */}
        <DecklistLink savedUrl={deckBuild.decklistUrl} token={token} />

        <SecretScratchpad initialNotes={deckBuild.notes} token={token} />
        <RulesSummary />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-8">
      <h1 className="text-3xl font-semibold">Hi {giver.name}</h1>

      <OwnSignup giver={giver} />

      <RevealDetails recipient={recipient} />

      {/* No private notes here: they live in the database, which this branch
          exists precisely to avoid. */}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Commander ideas for them</h2>
        <p className="opacity-70">
          Filtered to exclude their vetoed colour and every banned commander.
        </p>
        <CommanderBrowser
          initialPrompt={pickPrompt()}
          lockedExclude={recipient.colorVeto}
          lockedReason={
            recipient.colorVeto
              ? `${recipient.name} vetoed a colour, so it stays filtered out.`
              : undefined
          }
        />
      </section>

      <BrowserLink />

      <RulesSummary />
    </main>
  );
}
