import { formatCandidates } from "@/lib/countdown";
import { EVENT, eventTitle, EXCHANGE_CANDIDATES, SIGNUPS_OPEN_AT } from "@/lib/event";
import { daysUntilOpen, formatEventDate } from "@/lib/launch";

/**
 * Decorative gift seal. Pure currentColor so it reads on both palettes, and
 * aria-hidden because it says nothing the copy underneath does not.
 */
function GiftSeal() {
  return (
    <svg aria-hidden="true" className="splash-seal h-32 w-32" viewBox="0 0 120 120">
      <circle
        cx="60"
        cy="60"
        r="55"
        fill="none"
        stroke="currentColor"
        strokeDasharray="3 8"
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />
      <circle cx="60" cy="60" r="45" fill="none" stroke="currentColor" strokeOpacity="0.15" />

      {/* Box, lid and ribbon. */}
      <rect
        fill="none"
        height="32"
        rx="3"
        stroke="currentColor"
        strokeWidth="2"
        width="44"
        x="38"
        y="58"
      />
      <rect
        fill="none"
        height="13"
        rx="3"
        stroke="currentColor"
        strokeWidth="2"
        width="52"
        x="34"
        y="47"
      />
      <path d="M60 47v43" stroke="currentColor" strokeWidth="2" />

      {/* Bow. */}
      <path
        d="M60 47c-9-2-14-6-13-11 1-4 6-4 9-1 3 3 4 8 4 12z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M60 47c9-2 14-6 13-11-1-4-6-4-9-1-3 3-4 8-4 12z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />

      {/* Sparkles. */}
      <path d="M97 33v9M92.5 37.5h9" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.5" />
      <path d="M23 76v7M19.5 79.5h7" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * The pre-launch home page.
 *
 * Shown instead of the real home page until `SIGNUPS_OPEN_AT` arrives, so the
 * URL can be shared ahead of time without the rules, the sign-up link and the
 * commander pool all being live before the organiser is ready.
 *
 * `now` and `opensAt` are props so every phase — announced date, no date yet —
 * is testable without mocking the clock or the config.
 */
export function SplashPage({
  now = new Date(),
  opensAt = SIGNUPS_OPEN_AT,
}: {
  now?: Date;
  opensAt?: string | null;
} = {}) {
  const days = daysUntilOpen(now, opensAt);

  return (
    <main className="relative mx-auto flex min-h-svh max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <div aria-hidden="true" className="splash-glow" />

      <p className="text-xs font-semibold tracking-[0.35em] uppercase opacity-60">
        Winter {EVENT.year}
      </p>

      <GiftSeal />

      <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        {eventTitle()}
      </h1>

      <p className="text-lg text-balance">
        {days === null ? (
          <>Sign-ups open soon.</>
        ) : days === 0 ? (
          <>Sign-ups open today.</>
        ) : (
          <>
            <strong>
              {days} {days === 1 ? "day" : "days"}
            </strong>{" "}
            until sign-ups open.
          </>
        )}
      </p>

      {opensAt === null ? null : (
        <p className="text-sm opacity-70">{formatEventDate(opensAt)}</p>
      )}

      {/* An introduction, deliberately not a briefing. The rules, the budget
          and the ban list stay on the real home page until it goes live. */}
      <p className="max-w-md text-balance opacity-80">
        Everyone who joins is secretly assigned someone else, and builds them a
        Commander deck for the winter exchange. Nobody finds out who had them
        until the day.
      </p>

      <p className="rounded-xl border border-slate-300/30 px-4 py-3 text-sm">
        Exchange: {formatCandidates(EXCHANGE_CANDIDATES)} — date TBC
      </p>

      {/* No links out. The commander pool is the rules made browsable, so it
          waits for the real home page along with everything else. */}
      <p className="text-sm opacity-70">
        Bookmark this page — everything opens here on the day.
      </p>
    </main>
  );
}
