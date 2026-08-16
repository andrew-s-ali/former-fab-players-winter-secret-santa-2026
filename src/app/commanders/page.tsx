import Link from "next/link";
import { CommanderSuggester } from "@/components/CommanderSuggester";

export const metadata = { title: "Random commanders" };

export default function CommandersPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Random legal commanders</h1>
      <p className="opacity-70">
        Every suggestion is a legendary creature printed in paper at uncommon,
        with the banned list already removed.
      </p>

      <CommanderSuggester colorVeto={null} />

      <Link className="underline" href="/">
        ← Back to the rules
      </Link>
    </main>
  );
}
