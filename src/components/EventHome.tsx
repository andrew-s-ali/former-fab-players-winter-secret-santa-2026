import Link from "next/link";
import { Countdown } from "@/components/Countdown";
import { RulesSummary } from "@/components/RulesSummary";
import { eventTitle } from "@/lib/event";

/**
 * The home page once registration is open.
 *
 * Split out from `src/app/page.tsx` so the route is only the pre-launch
 * decision — splash or this — and both sides stay independently testable.
 */
export function EventHome() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">{eventTitle()}</h1>

      <Countdown />

      <RulesSummary />

      <div className="flex flex-col gap-2">
        <Link className="underline" href="/signup">
          Sign up →
        </Link>
        <Link className="underline" href="/commanders">
          Browse random legal commanders →
        </Link>
      </div>
    </main>
  );
}
