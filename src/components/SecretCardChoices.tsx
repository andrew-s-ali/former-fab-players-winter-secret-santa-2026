"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cashInCardAction, type CardActionResult } from "@/app/s/actions";
import { PickCards, PickName } from "@/components/PickCards";
import { pickId, pickName, type CommanderPick } from "@/lib/pairing";

export function SecretCardChoices({
  token,
  cards,
  cashInUsed,
  onCashIn,
}: {
  token: string;
  cards: CommanderPick[];
  cashInUsed: boolean;
  /**
   * Overrides the server action. Only the `/demo` routes pass this: they let
   * someone try the trade without a database behind them, and they do it
   * through this component rather than a lookalike so what the demo shows is
   * what the real page does.
   */
  onCashIn?: (index: number) => Promise<CardActionResult>;
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

      <div className="grid gap-5 sm:grid-cols-3">
        {cards.map((pick, index) => (
          <article className="overflow-hidden rounded-2xl border border-amber-100/20 bg-slate-950/25" key={pickId(pick)}>
            <PickCards pick={pick} />
            <div className="space-y-3 p-4">
              <h3 className="font-semibold leading-tight">
                <PickName pick={pick} />
              </h3>
              {!cashInUsed ? (
                <button
                  className="text-sm underline disabled:opacity-50"
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
