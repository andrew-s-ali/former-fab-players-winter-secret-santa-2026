import Link from "next/link";
import { CommanderBrowser } from "@/components/CommanderBrowser";
import { pickPrompt } from "@/lib/prompts";

// Rendered per request so the theme prompt differs between visits. Without
// this the prompt would be baked in at build time and never change.
export const dynamic = "force-dynamic";

export const metadata = { title: "Commanders" };

export default function CommandersPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Legal commanders</h1>
      <p className="opacity-70">
        Every card here is a legendary card that can be a commander, printed in
        paper at uncommon, with the banned list already removed.
      </p>

      <CommanderBrowser initialPrompt={pickPrompt()} lockedExclude={null} />

      <Link className="underline" href="/">
        ← Back to the rules
      </Link>
    </main>
  );
}
