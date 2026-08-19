import { EXCHANGE_AT, EXCHANGE_CANDIDATES, SIGNUPS_CLOSE_AT } from "@/lib/event";
import { countdownPhase, formatCandidates } from "@/lib/countdown";

/** Shows the next milestone. Server-rendered; the page is dynamic anyway. */
export function Countdown({ now = new Date() }: { now?: Date }) {
  const phase = countdownPhase(now, {
    signupsCloseAt: SIGNUPS_CLOSE_AT,
    exchangeCandidates: EXCHANGE_CANDIDATES,
    exchangeAt: EXCHANGE_AT,
  });

  const tbc = `Exchange: ${formatCandidates(EXCHANGE_CANDIDATES)} — date TBC`;

  return (
    <div className="rounded-xl border border-slate-300/30 px-4 py-3">
      {phase.kind === "before-signups" ? (
        <p>
          <strong>{phase.days} days</strong> until sign-ups close.
          <span className="block text-sm opacity-70">{tbc}</span>
        </p>
      ) : null}
      {phase.kind === "signups-closed" ? (
        <p>
          Sign-ups are closed.
          <span className="block text-sm opacity-70">{tbc}</span>
        </p>
      ) : null}
      {phase.kind === "before-exchange" ? (
        <p>
          <strong>{phase.days} days</strong> until the exchange.
        </p>
      ) : null}
      {phase.kind === "after-exchange" ? <p>The exchange has happened — hope you liked your deck.</p> : null}
    </div>
  );
}
