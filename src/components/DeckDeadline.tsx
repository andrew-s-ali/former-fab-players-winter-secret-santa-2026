import { formatCandidates } from "@/lib/countdown";
import { EXCHANGE_AT, EXCHANGE_CANDIDATES } from "@/lib/event";
import { daysUntilOpen, formatEventDate } from "@/lib/launch";

/**
 * When the deck has to be ready.
 *
 * The assignment page told somebody what to build and never when it was due.
 * Every other deadline in the event is stated where the work happens — the
 * workshop names the picking date, the sign-up page names its own close — and
 * this was the one screen with a job on it and no date attached.
 *
 * It reads `EXCHANGE_AT`, which is `null` until the group settles a December
 * date. That absence is said out loud with the candidates, rather than left
 * blank: "one of these three, we have not chosen yet" is real information for
 * somebody deciding how much of December they have.
 */
export function DeckDeadline({ now = new Date() }: { now?: Date } = {}) {
  if (EXCHANGE_AT === null) {
    return (
      <p className="text-sm opacity-75">
        The exchange is on{" "}
        <strong>{formatCandidates(EXCHANGE_CANDIDATES)}</strong> — the group has
        not settled which yet. Your deck needs to be ready for the day, so build
        toward the earliest of them and you cannot be caught out.
      </p>
    );
  }

  const days = daysUntilOpen(now, EXCHANGE_AT);

  return (
    <p className="text-sm opacity-75">
      Your deck needs to be ready for the exchange on{" "}
      <strong>{formatEventDate(EXCHANGE_AT)}</strong>
      {days === null || days === 0 ? (
        "."
      ) : (
        <>
          {" "}
          — <strong>{days}</strong> {days === 1 ? "day" : "days"} from now.
        </>
      )}
    </p>
  );
}
