"use client";

import type { Commander } from "@/lib/scryfall/types";

/** Detail view for one commander, shown when a grid tile is chosen. */
export function CommanderDetail({
  card,
  onClose,
}: {
  card: Commander;
  onClose: () => void;
}) {
  return (
    <div
      aria-label={card.name}
      className="rounded-xl border border-slate-300/40 bg-slate-900/40 p-4"
      role="region"
    >
      <div className="flex justify-end">
        <button className="text-sm underline" onClick={onClose} type="button">
          Close
        </button>
      </div>

      <div className="flex flex-wrap gap-4">
        {card.imageUrl ? (
          // Scryfall images are external and deliberately unoptimised.
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={card.name} className="w-56 rounded-xl" src={card.imageUrl} />
        ) : null}

        <div className="min-w-48 flex-1 space-y-2">
          <h3 className="text-lg font-semibold">{card.name}</h3>
          <p className="text-sm opacity-80">{card.manaCost}</p>
          <p className="text-sm">{card.typeLine}</p>
          {card.canPair ? (
            <p className="inline-block rounded border px-2 py-0.5 text-xs">
              Can pair with another commander
            </p>
          ) : null}
          <p className="whitespace-pre-line text-sm opacity-90">{card.oracleText}</p>
          <p className="text-sm opacity-70">
            {card.rarity === "uncommon" ? "Uncommon" : card.rarity} in {card.setName}
          </p>
          <a className="text-sm underline" href={card.scryfallUrl}>
            View on Scryfall
          </a>
        </div>
      </div>
    </div>
  );
}
