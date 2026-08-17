import Link from "next/link";
import { notFound } from "next/navigation";
import { CommanderBrowser } from "@/components/CommanderBrowser";
import { DemoBadge } from "@/components/DemoBadge";
import { RevealDetails } from "@/components/RevealDetails";
import { RulesSummary } from "@/components/RulesSummary";
import { readDemoEvent } from "@/lib/demo";
import { findById, findByToken } from "@/lib/participants";

export const metadata = {
  title: "Demo reveal page",
  robots: { index: false, follow: false },
};

export default async function DemoTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const event = readDemoEvent();
  const giver = findByToken(event, token);
  if (!giver) {
    notFound();
  }

  const recipient = findById(event, giver.recipientId);
  if (!recipient) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-8">
      <DemoBadge />
      <h1 className="text-3xl font-semibold">Hi {giver.name}</h1>

      <RevealDetails recipient={recipient} />

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Commander ideas for them</h2>
        <CommanderBrowser
          lockedExclude={recipient.colorVeto}
          lockedReason={
            recipient.colorVeto
              ? `${recipient.name} vetoed a colour, so it stays filtered out.`
              : undefined
          }
        />
      </section>

      <RulesSummary />

      <Link className="underline" href="/demo">
        ← Back to the demo links
      </Link>
    </main>
  );
}
