"use client";

import { useState } from "react";
import type { ColorCode } from "@/lib/commanders";
import type { Commander } from "@/lib/scryfall/types";

type Suggestion = { commander: Commander; partner: Commander | null };

function CommanderCard({ card }: { card: Commander }) {
  return (
    <figure className="space-y-2">
      {card.imageUrl ? (
        // Scryfall images are external and unoptimised on purpose: adding them
        // to next/image config buys nothing for a handful of views.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={card.name}
          className="w-64 rounded-xl"
          height={340}
          src={card.imageUrl}
          width={244}
        />
      ) : null}
      <figcaption>
        <a className="font-semibold underline" href={card.scryfallUrl}>
          {card.name}
        </a>
        <p className="text-sm opacity-70">{card.typeLine}</p>
      </figcaption>
    </figure>
  );
}

export function CommanderSuggester({ colorVeto }: { colorVeto: ColorCode | null }) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function roll() {
    setLoading(true);
    setError(null);

    try {
      const query = colorVeto ? `?exclude=${colorVeto}` : "";
      const response = await fetch(`/api/commanders/random${query}`);

      if (!response.ok) {
        throw new Error(String(response.status));
      }

      setSuggestion((await response.json()) as Suggestion);
    } catch {
      setError("Couldn't load a commander. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        className="rounded-lg border px-4 py-2 font-medium disabled:opacity-50"
        disabled={loading}
        onClick={roll}
        type="button"
      >
        {loading ? "Rolling…" : "Random commander"}
      </button>

      {error ? (
        <p className="text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {suggestion ? (
        <div className="flex flex-wrap gap-6" role="status">
          <CommanderCard card={suggestion.commander} />
          {suggestion.partner ? <CommanderCard card={suggestion.partner} /> : null}
        </div>
      ) : null}
    </div>
  );
}
