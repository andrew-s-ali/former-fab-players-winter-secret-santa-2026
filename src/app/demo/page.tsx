import Link from "next/link";
import { DemoBadge } from "@/components/DemoBadge";
import { readDemoEvent } from "@/lib/demo";

export const metadata = {
  title: "Demo",
  robots: { index: false, follow: false },
};

export default function DemoIndexPage() {
  const { participants } = readDemoEvent();

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <DemoBadge />
      <h1 className="text-3xl font-semibold">Demo links</h1>
      <p className="opacity-70">
        Each link is what one participant would receive privately. Nothing here
        touches the real event data.
      </p>

      <ul className="space-y-2">
        {participants.map((person) => (
          <li key={person.id}>
            <Link className="underline" href={`/demo/s/${person.token}`}>
              {person.name}
            </Link>
          </li>
        ))}
      </ul>

      <Link className="underline" href="/demo/reveal">
        See the demo reveal day →
      </Link>
    </main>
  );
}
