import Link from "next/link";
import { DemoBadge } from "@/components/DemoBadge";
import { readDemoEvent, readDemoSelections, readDemoWorkspace } from "@/lib/demo";

export const metadata = {
  title: "Demo",
  robots: { index: false, follow: false },
};

const COLOR_NAMES: Record<string, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
};

export default function DemoIndexPage() {
  const { participants } = readDemoEvent();
  const selections = readDemoSelections();

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-8">
      <DemoBadge />
      <h1 className="text-3xl font-semibold">Demo links</h1>

      <div className="space-y-3 rounded-xl border border-slate-300/25 p-4 text-sm">
        <p>
          A complete event, mid-flight: {participants.length} invented people
          have all signed up, all picked their own two commanders, and all made
          their {selections.length} recommendations for each other. The workshop
          has therefore closed and every assignment is open.
        </p>
        <p className="opacity-70">
          Each shortlist below is drawn by the same function the real site uses,
          over the selections committed in{" "}
          <code>src/demo/demo-event.json</code> — not by a stand-in. Nothing
          here reads real participant data, Netlify Blobs or the database.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Each participant&rsquo;s private link</h2>
        <p className="text-sm opacity-70">
          What one person receives. The link goes through two stages: a
          <strong> workshop</strong>, where they pick one commander for every
          other participant, and then — once everybody has finished — their
          <strong> assignment</strong>. Both are shown here.
        </p>
        <ul className="divide-y divide-slate-300/15">
          {participants.map((person) => (
            <li className="flex flex-wrap items-baseline gap-x-3 py-2" key={person.id}>
              <span className="font-medium">{person.name}</span>
              <Link className="underline" href={`/demo/s/${person.token}?phase=workshop`}>
                workshop
              </Link>
              <Link className="underline" href={`/demo/s/${person.token}`}>
                assignment
              </Link>
              <span className="text-xs opacity-60">
                {person.colorVeto
                  ? `avoids ${COLOR_NAMES[person.colorVeto]}`
                  : "no colour veto"}
                {readDemoWorkspace(person.id).decklistUrl ? " · decklist saved" : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">The rest of the site</h2>
        <ul className="space-y-2">
          <li>
            <Link className="underline" href="/demo/reveal">
              Reveal day →
            </Link>{" "}
            <span className="text-xs opacity-60">
              the ring, stepped through one person at a time
            </span>
          </li>
          <li>
            <Link className="underline" href="/signup">
              The sign-up form →
            </Link>{" "}
            <span className="text-xs opacity-60">
              the real one — it takes submissions, so don&rsquo;t send it
            </span>
          </li>
          <li>
            <Link className="underline" href="/commanders">
              The commander browser →
            </Link>{" "}
            <span className="text-xs opacity-60">every legal commander</span>
          </li>
        </ul>
      </section>
    </main>
  );
}
