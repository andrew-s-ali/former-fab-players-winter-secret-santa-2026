import type { ColorCode } from "@/lib/commanders";
import { formatEventDate } from "@/lib/launch";
import { PickCards, PickName } from "@/components/PickCards";
import { pickId, type CommanderPick } from "@/lib/pairing";

const COLOR_NAMES: Record<ColorCode, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
};

const NONE = "No preference given";

/**
 * What this participant said when they signed up, collapsed by default.
 *
 * Collapsed because it is reference material, not the job: the page's subject
 * is the person they are building for, and their own answers are here so they
 * can check what they asked for without digging up the sign-up confirmation.
 *
 * Read-only on purpose. The two cards are already in the pool everyone else is
 * drawing from, and the colour veto constrains what those people are allowed
 * to pick — changing either after the fact is an organiser action.
 */
export function SignupSummary({
  cards,
  colorVeto,
  themeVeto,
  themeWish,
  exchangeRanking = null,
}: {
  cards: CommanderPick[];
  colorVeto: ColorCode | null;
  themeVeto: string | null;
  themeWish: string | null;
  /** Their preferred exchange dates, best first; null if they never said. */
  exchangeRanking?: string[] | null;
}) {
  return (
    <details className="rounded-xl border border-slate-300/25">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
        What you chose when you signed up
      </summary>

      <div className="space-y-5 border-t border-slate-300/20 px-4 py-4">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Your two commander choices</h3>
          <p className="text-xs opacity-70">
            These are in your pool. Everyone else added one more card to it, and
            whoever is building your deck sees a shortlist drawn from the whole
            pool.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {cards.map((pick) => (
              <li
                className="flex items-center gap-3 rounded-lg border border-slate-300/20 p-2"
                key={pickId(pick)}
              >
                <PickCards pick={pick} size="thumb" />
                <span className="text-sm font-medium">
                  <PickName pick={pick} />
                </span>
              </li>
            ))}
          </ul>
        </div>

        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-semibold">Colour you asked to avoid</dt>
            <dd>{colorVeto ? COLOR_NAMES[colorVeto] : NONE}</dd>
          </div>
          <div>
            <dt className="font-semibold">Theme you asked to avoid</dt>
            <dd>{themeVeto ?? NONE}</dd>
          </div>
          <div>
            <dt className="font-semibold">Theme you asked for</dt>
            <dd>{themeWish ?? NONE}</dd>
          </div>
          <div>
            <dt className="font-semibold">Exchange dates, your order</dt>
            <dd>
              {exchangeRanking && exchangeRanking.length > 0 ? (
                <ol className="list-inside list-decimal">
                  {exchangeRanking.map((date) => (
                    <li key={date}>{formatEventDate(date)}</li>
                  ))}
                </ol>
              ) : (
                NONE
              )}
            </dd>
          </div>
        </dl>

        <p className="text-xs opacity-70">
          Something wrong here? Ask the organiser — these are locked once the
          draw has run, because other people have already picked against them.
        </p>
      </div>
    </details>
  );
}
