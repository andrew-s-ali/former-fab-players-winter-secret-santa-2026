"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cashInCardAction } from "@/app/s/actions";
import type { Commander } from "@/lib/scryfall/types";

export function SecretCardChoices({
  token,
  cards,
  cashInUsed,
}: {
  token: string;
  cards: Commander[];
  cashInUsed: boolean;
}) {
  const router = useRouter();
  const [tradeIndex, setTradeIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmTrade() {
    if (tradeIndex === null) return;
    startTransition(async () => {
      const result = await cashInCardAction(token, tradeIndex);
      if (result.ok) {
        setTradeIndex(null);
        router.refresh();
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
            : "You may trade exactly one visible card for the hidden fourth card. The trade cannot be undone."}
        </p>
      </div>

      {error ? <p className="rounded-lg bg-red-500/15 p-3 text-sm" role="alert">{error}</p> : null}

      <div className="grid gap-5 sm:grid-cols-3">
        {cards.map((card, index) => (
          <article className="overflow-hidden rounded-2xl border border-amber-100/20 bg-slate-950/25" key={card.id}>
            {card.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt={card.name} className="w-full" src={card.imageUrl} />
            ) : null}
            <div className="space-y-3 p-4">
              <h3 className="font-semibold leading-tight">{card.name}</h3>
              {!cashInUsed ? (
                <button
                  className="text-sm underline disabled:opacity-50"
                  disabled={pending}
                  onClick={() => setTradeIndex(index)}
                  type="button"
                >
                  Trade this card
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      {!cashInUsed ? (
        <div className="rounded-2xl border border-dashed border-amber-200/30 bg-amber-950/10 p-5">
          {tradeIndex === null ? (
            <p className="text-sm opacity-75">The fourth card stays completely hidden until you choose a card to trade.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">
                Trade <strong>{cards[tradeIndex]?.name}</strong> for the hidden fourth card?
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
