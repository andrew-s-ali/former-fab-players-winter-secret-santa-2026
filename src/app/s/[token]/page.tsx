import { notFound } from "next/navigation";
import { CommanderBrowser } from "@/components/CommanderBrowser";
import { CardSelectionStudio } from "@/components/CardSelectionStudio";
import { RevealDetails } from "@/components/RevealDetails";
import { RulesSummary } from "@/components/RulesSummary";
import { SecretCardChoices } from "@/components/SecretCardChoices";
import { SecretScratchpad } from "@/components/SecretScratchpad";
import { getOrCreateSecretCards, getSelectionWorkspace } from "@/lib/card-selections";
import { findById, findByToken } from "@/lib/participants";
import { pickPrompt } from "@/lib/prompts";
import { readEvent } from "@/lib/store";

// Assignments must never be cached or prerendered.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your Secret Santa",
  robots: { index: false, follow: false },
};

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
          <CardSelectionStudio
            completedSlots={workspace.completedSlots}
            needsMoreVariety={workspace.needsMoreVariety}
            ownCards={workspace.ownCards}
            participant={{ id: giver.id, name: giver.name, colorVeto: giver.colorVeto }}
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

    const secretCards = await getOrCreateSecretCards(giver, recipient, event.participants);
    if (!secretCards) {
      throw new Error("Card selections became incomplete while opening the secret page.");
    }

    return (
      <main className="mx-auto max-w-4xl space-y-9 p-6 sm:p-8">
        <h1 className="text-3xl font-semibold">Hi {giver.name}</h1>
        <RevealDetails recipient={recipient} />
        <SecretCardChoices
          cards={secretCards.cards}
          cashInUsed={secretCards.cashInUsed}
          token={token}
        />
        <SecretScratchpad token={token} />
        <RulesSummary />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-8">
      <h1 className="text-3xl font-semibold">Hi {giver.name}</h1>

      <RevealDetails recipient={recipient} />

      <SecretScratchpad token={token} />

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

      <RulesSummary />
    </main>
  );
}
