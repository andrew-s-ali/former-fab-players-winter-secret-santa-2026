import Link from "next/link";
import { RulesSummary } from "@/components/RulesSummary";
import { eventTitle } from "@/lib/event";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">{eventTitle()}</h1>

      <RulesSummary />

      <Link className="underline" href="/commanders">
        Browse random legal commanders →
      </Link>
    </main>
  );
}
