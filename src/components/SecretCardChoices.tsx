"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cashInCardAction,
  chooseBuiltCardAction,
  type CardActionResult,
} from "@/app/s/actions";
import { CardLinks } from "@/components/CardLinks";
import { PickCards, PickName } from "@/components/PickCards";
import { pickCards, pickId, pickName, type CommanderPick } from "@/lib/pairing";

export function SecretCardChoices({
  token,
  cards,
  cashInUsed,
  builtPickId = null,
  onCashIn,
  onChooseBuilt,
}: {
  token: string;
  cards: CommanderPick[];
  cashInUsed: boolean;
  /** Which of these they have said they are building, if they have said. */
  builtPickId?: string | null;
  /**
   * Overrides the server action. Only the `/demo` routes pass this: they let
   * someone try the trade without a database behind them, and they do it
   * through this component rather than a lookalike so what the demo shows is
   * what the real page does.
   */
  onCashIn?: (index: number) => Promise<CardActionResult>;
  /** Overrides the server action, for the same reason as `onCashIn`. */
  onChooseBuilt?: (pickId: string | null) => Promise<CardActionResult>;
}) {
  const router = useRouter();
  const [tradeIndex, setTradeIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmTrade() {
    if (tradeIndex === null) return;
    startTransition(async () => {
      const result = onCashIn
        ? await onCashIn(tradeIndex)
        : await cashInCardAction(token, tradeIndex);
      if (result.ok) {
        setTradeIndex(null);
        // The server path re-renders the page to pick up the new shortlist;
        // a simulated trade already holds its own state.
        if (!onCashIn) {
          router.refresh();
        }
      } else {
        setError(result.error);
      }
    });
  }

  /**
   * Says which one they are building.
   *
   * Asked here, while they are building, because nothing else can recover it
   * later: the shortlist is stored but the choice made from it is not, and by
   * reveal day the only record would be in somebody's memory. Changeable as
   * often as they like — people change their minds at the table — and clearing
   * it back to undecided is allowed.
   */
  function chooseBuilt(next: string | null) {
    setError(null);
    startTransition(async () => {
      const result = onChooseBuilt
        ? await onChooseBuilt(next)
        : await chooseBuiltCardAction(token, next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (!onChooseBuilt) {
        router.refresh();
      }
    });
  }

  return (
    <section className="space-y-5">
      <div>
        <p className="text-sm uppercase tracking-[0.18em] text-amber-200/70">Locked shortlist</p>
        <h2 className="mt-1 text-2xl font-semibold">Build around one of these commanders</h2>
        <p className="mt-2 text-sm opacity-70">
          {cashInUsed
            ? "Your cash-in is spent. These are your final three choices."
            : "You may trade exactly one of these for the hidden fourth choice. The trade cannot be undone."}
        </p>
      </div>

      {error ? <p className="rounded-lg bg-red-500/15 p-3 text-sm" role="alert">{error}</p> : null}

      <p className="text-sm opacity-75">
        {builtPickId === null
          ? "Once you have decided, say which one you are building — it goes on the reveal-day page beside the three you chose from."
          : "Changed your mind? Choose another and it will be updated."}
      </p>

      <div className="grid gap-5 sm:grid-cols-3">
        {cards.map((pick, index) => (
          <article className="overflow-hidden rounded-2xl border border-amber-100/20 bg-slate-950/25" key={pickId(pick)}>
            <PickCards pick={pick} />
            <div className="space-y-3 p-4">
              <h3 className="font-semibold leading-tight">
                <PickName pick={pick} />
              </h3>

              {/*
                Both halves of a pair get their own price and links: they are
                two cards to buy and two pages to read, and the budget counts
                them both.
              */}
              {pickCards(pick).map((card) => (
                <div key={card.id}>
                  {pick.partner ? (
                    <p className="text-xs font-medium opacity-70">{card.name}</p>
                  ) : null}
                  <CardLinks card={card} />
                </div>
              ))}
              {builtPickId === pickId(pick) ? (
                <p className="flex items-center gap-2 text-sm font-medium text-emerald-300">
                  <span aria-hidden="true">✓</span> You are building this one
                  <button
                    className="ml-auto text-xs underline opacity-70 disabled:opacity-40"
                    disabled={pending}
                    onClick={() => chooseBuilt(null)}
                    type="button"
                  >
                    Undo
                  </button>
                </p>
              ) : (
                <button
                  className="text-sm underline disabled:opacity-50"
                  disabled={pending}
                  onClick={() => chooseBuilt(pickId(pick))}
                  type="button"
                >
                  I&rsquo;m building this one
                </button>
              )}
              {!cashInUsed ? (
                <button
                  className="block text-sm underline opacity-70 disabled:opacity-50"
                  disabled={pending}
                  onClick={() => setTradeIndex(index)}
                  type="button"
                >
                  {pick.partner ? "Trade this pair" : "Trade this card"}
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      {!cashInUsed ? (
        <div className="rounded-2xl border border-dashed border-amber-200/30 bg-amber-950/10 p-5">
          {tradeIndex === null ? (
            <p className="text-sm opacity-75">The fourth choice stays completely hidden until you pick one to trade.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">
                Trade{" "}
                <strong>
                  {cards[tradeIndex] ? pickName(cards[tradeIndex]) : ""}
                </strong>{" "}
                for the hidden fourth choice?
              </p>
              <div className="flex gap-3">
                <button className="rounded-lg bg-amber-200 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50" disabled={pending} onClick={confirmTrade} type="button">
                  {pending ? "Trading…" : "Use my one cash-in"}
                </button>
                <button className="text-sm underline" disabled={pending} onClick={() => setTradeIndex(null)} type="button">Cancel</button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
