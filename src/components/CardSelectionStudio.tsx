"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { removeCardAction, saveCardAction } from "@/app/s/actions";
import { CommanderBrowser } from "@/components/CommanderBrowser";
import type { ColorCode } from "@/lib/commanders";
import type { Commander } from "@/lib/scryfall/types";

type Target = {
  id: string;
  name: string;
  colorVeto: ColorCode | null;
};

function SavedCard({
  card,
  remove,
  pending,
}: {
  card: Commander;
  remove: () => void;
  pending: boolean;
}) {
  return (
    <article className="grid grid-cols-[5rem_1fr] gap-3 rounded-xl border border-slate-300/25 bg-slate-950/20 p-3">
      {card.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="w-20 rounded-lg" src={card.imageUrl} />
      ) : (
        <div className="aspect-[5/7] w-20 rounded-lg bg-slate-500/20" />
      )}
      <div className="space-y-2">
        <h3 className="font-semibold leading-tight">{card.name}</h3>
        <button
          className="text-sm underline disabled:opacity-50"
          disabled={pending}
          onClick={remove}
          type="button"
        >
          Remove
        </button>
      </div>
    </article>
  );
}

export function CardSelectionStudio({
  token,
  participant,
  targets,
  ownCards,
  peerCards,
  completedSlots,
  totalSlots,
  needsMoreVariety,
}: {
  token: string;
  participant: Target;
  targets: Target[];
  ownCards: Array<{ slot: number; card: Commander }>;
  peerCards: Record<string, Commander | null>;
  completedSlots: number;
  totalSlots: number;
  needsMoreVariety: boolean;
}) {
  const router = useRouter();
  const [targetId, setTargetId] = useState(targets[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const target = targets.find((candidate) => candidate.id === targetId) ?? targets[0];

  async function dispatch(
    work: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>
  ): Promise<boolean> {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const result = await work();
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      setMessage(result.message);
      router.refresh();
      return true;
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-10">
      <section className="overflow-hidden rounded-2xl border border-sky-200/20 bg-sky-950/20">
        <div className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-sky-200/70">Private card workshop</p>
            <h2 className="mt-2 text-2xl font-semibold">Choose before the draw unlocks</h2>
            <p className="mt-2 max-w-xl text-sm opacity-75">
              Save two commanders for yourself and one for every other participant. When every slot is filled, all choices lock and your secret assignment opens.
            </p>
          </div>
          <p className="rounded-full border border-sky-200/20 px-4 py-2 text-sm">
            {completedSlots} of {totalSlots} group picks saved
          </p>
        </div>
        <div className="h-1 bg-slate-950/30">
          <div
            className="h-full bg-sky-400 transition-transform"
            style={{ transform: `scaleX(${totalSlots === 0 ? 0 : completedSlots / totalSlots})`, transformOrigin: "left" }}
          />
        </div>
      </section>

      {message ? <p className="rounded-lg bg-emerald-500/15 p-3 text-sm">{message}</p> : null}
      {error ? <p className="rounded-lg bg-red-500/15 p-3 text-sm" role="alert">{error}</p> : null}
      {needsMoreVariety ? (
        <p className="rounded-lg bg-amber-500/15 p-3 text-sm" role="status">
          Every slot is filled, but at least one secret pool has fewer than four unique cards. Replace a duplicated recommendation to unlock the exchange.
        </p>
      ) : null}

      <section className="space-y-4">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] opacity-55">Step one</p>
          <h2 className="text-2xl font-semibold">Your two cards</h2>
          <p className="mt-1 text-sm opacity-70">These join the recommendation pool if someone draws your name.</p>
        </div>
        {ownCards.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {ownCards.map(({ card, slot }) => (
              <SavedCard
                card={card}
                key={card.id}
                pending={pending}
                remove={() => void dispatch(() => removeCardAction(token, participant.id, slot))}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-300/30 p-5 text-sm opacity-70">No personal cards saved yet.</p>
        )}
        {ownCards.length < 2 ? (
          <CommanderBrowser
            actionLabel="Save for myself"
            initialPrompt={undefined}
            lockedExclude={participant.colorVeto}
            lockedReason={participant.colorVeto ? "Your vetoed colour stays excluded." : undefined}
            onChoose={async (card) => {
              const saved = await dispatch(() => saveCardAction(token, participant.id, card.id));
              if (!saved) throw new Error("Card was not saved.");
            }}
            savedCardIds={ownCards.map(({ card }) => card.id)}
          />
        ) : null}
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] opacity-55">Step two</p>
          <h2 className="text-2xl font-semibold">A card for everyone else</h2>
          <p className="mt-1 text-sm opacity-70">Each recommendation goes only into that person’s private pool.</p>
        </div>
        <label className="block max-w-md space-y-2">
          <span className="text-sm font-medium">Choose a participant</span>
          <select
            className="w-full rounded-lg border border-slate-300/30 bg-transparent px-3 py-2"
            onChange={(event) => setTargetId(event.target.value)}
            value={target?.id ?? ""}
          >
            {targets.map((candidate) => (
              <option className="bg-slate-900" key={candidate.id} value={candidate.id}>
                {candidate.name}{peerCards[candidate.id] ? " — saved" : ""}
              </option>
            ))}
          </select>
        </label>

        {target && peerCards[target.id] ? (
          <SavedCard
            card={peerCards[target.id]!}
            pending={pending}
            remove={() => void dispatch(() => removeCardAction(token, target.id, 1))}
          />
        ) : null}

        {target ? (
          <CommanderBrowser
            actionLabel={peerCards[target.id] ? `Replace pick for ${target.name}` : `Save for ${target.name}`}
            initialPrompt={undefined}
            key={target.id}
            lockedExclude={target.colorVeto}
            lockedReason={target.colorVeto ? `${target.name}'s vetoed colour stays excluded.` : undefined}
            onChoose={async (card) => {
              const saved = await dispatch(() => saveCardAction(token, target.id, card.id));
              if (!saved) throw new Error("Card was not saved.");
            }}
            savedCardIds={peerCards[target.id] ? [peerCards[target.id]!.id] : []}
          />
        ) : null}
      </section>
    </div>
  );
}
