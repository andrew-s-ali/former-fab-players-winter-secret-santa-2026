import { EXCHANGE_AT, EXCHANGE_CANDIDATES, SIGNUPS_CLOSE_AT } from "@/lib/event";
import { countdownPhase, formatCandidates } from "@/lib/countdown";
import { formatEventDate } from "@/lib/launch";

/** Shows the next milestone. Server-rendered; the page is dynamic anyway. */
export function Countdown({ now = new Date() }: { now?: Date }) {
  const phase = countdownPhase(now, {
    signupsCloseAt: SIGNUPS_CLOSE_AT,
    exchangeCandidates: EXCHANGE_CANDIDATES,
    exchangeAt: EXCHANGE_AT,
  });

  /*
    The second line: the candidates while the group is still choosing, the
    settled day once it has. It used to say "date TBC" unconditionally, which
    was true for as long as `EXCHANGE_AT` was null and became a lie the moment
    it was not — the page would have gone on offering three dates after one had
    been announced.
  */
  const exchangeLine =
    EXCHANGE_AT === null
      ? `Exchange: ${formatCandidates(EXCHANGE_CANDIDATES)} — date TBC`
      : `Exchange: ${formatEventDate(EXCHANGE_AT)}`;

  return (
    <div className="rounded-xl border border-slate-300/30 px-4 py-3">
      {phase.kind === "before-signups" ? (
        <p>
          <strong>{phase.days} days</strong> until sign-ups close.
          <span className="block text-sm opacity-70">{exchangeLine}</span>
        </p>
      ) : null}
      {phase.kind === "signups-closed" ? (
        <p>
          Sign-ups are closed.
          <span className="block text-sm opacity-70">{exchangeLine}</span>
        </p>
      ) : null}
      {phase.kind === "before-exchange" ? (
        <p>
          <strong>{phase.days} days</strong> until the exchange
          {EXCHANGE_AT === null ? "." : `, on ${formatEventDate(EXCHANGE_AT)}.`}
        </p>
      ) : null}
      {phase.kind === "after-exchange" ? <p>The exchange has happened — hope you liked your deck.</p> : null}
    </div>
  );
}
