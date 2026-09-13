import { edhrecSlug } from "@/components/CommanderDetail";
import type { Commander } from "@/lib/scryfall/types";

/** Enough of a card to price it and link it out. */
type Linkable = Pick<
  Commander,
  "name" | "scryfallUrl" | "priceUsd" | "priceIsFoil"
>;

/**
 * What a card costs, and where to go and read about it.
 *
 * The commander browser has carried these since the start; the shortlist on
 * somebody's assignment page did not, which had it backwards. The browser is
 * where people are idly looking, and the shortlist is where the one decision
 * of the whole event gets made — three cards, pick one, build a deck around
 * it. That screen was a picture and a name.
 *
 * The price is here rather than left to the deck rules because the budget is
 * $75 for the whole deck: what the commander takes out of that is the first
 * thing worth knowing about it, and `priceUsd` is already on every card in the
 * pool.
 */
export function CardLinks({ card }: { card: Linkable }) {
  return (
    <div className="space-y-1 text-xs">
      {card.priceUsd ? (
        <p className="font-mono text-emerald-400">
          ~${card.priceUsd}
          {card.priceIsFoil ? " (foil)" : ""}
        </p>
      ) : (
        // Said rather than left blank: a missing price is Scryfall having none,
        // not the card being free.
        <p className="opacity-60">no price on Scryfall</p>
      )}
      <p className="flex flex-wrap gap-x-3 gap-y-1">
        <a
          aria-label={`View ${card.name} on Scryfall (opens in a new tab)`}
          className="underline"
          href={card.scryfallUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          Scryfall
        </a>
        <a
          aria-label={`View ${card.name} on EDHREC (opens in a new tab)`}
          className="underline"
          href={`https://edhrec.com/commanders/${edhrecSlug(card.name)}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          EDHREC
        </a>
        <a
          aria-label={`Search Moxfield for ${card.name} decks (opens in a new tab)`}
          className="underline"
          href={`https://www.moxfield.com/decks/public/advanced?format=commander&commander=${encodeURIComponent(card.name)}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          Moxfield
        </a>
      </p>
    </div>
  );
}
