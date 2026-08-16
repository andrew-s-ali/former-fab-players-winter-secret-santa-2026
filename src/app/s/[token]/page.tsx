import { notFound } from "next/navigation";
import { CommanderSuggester } from "@/components/CommanderSuggester";
import { RevealDetails } from "@/components/RevealDetails";
import { RulesSummary } from "@/components/RulesSummary";
import { findById, findByToken } from "@/lib/participants";
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

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-8">
      <h1 className="text-3xl font-semibold">Hi {giver.name}</h1>

      <RevealDetails recipient={recipient} />

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Commander ideas for them</h2>
        <p className="opacity-70">
          Filtered to exclude their vetoed colour and every banned commander.
        </p>
        <CommanderSuggester colorVeto={recipient.colorVeto} />
      </section>

      <RulesSummary />
    </main>
  );
}
