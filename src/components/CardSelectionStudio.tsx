"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  removeCardAction,
  saveCardAction,
  type CardActionResult,
} from "@/app/s/actions";
import { CommanderBrowser } from "@/components/CommanderBrowser";
import { PartnerPicker } from "@/components/PartnerPicker";
import { PickCards, PickName } from "@/components/PickCards";
import { useCommanderOptions } from "@/components/use-commander-options";
import type { ColorCode, CommanderOption } from "@/lib/commanders";
import { canTakePartner, pickCards, type CommanderPick } from "@/lib/pairing";

type Target = {
  id: string;
  name: string;
  colorVeto: ColorCode | null;
};

function SavedCard({
  pick,
  remove,
  pending,
}: {
  pick: CommanderPick;
  remove?: () => void;
  pending?: boolean;
}) {
  return (
    <article className="flex items-start gap-3 rounded-xl border border-slate-300/25 bg-slate-950/20 p-3">
      <PickCards pick={pick} size="thumb" />
      <div className="space-y-2">
        <h3 className="font-semibold leading-tight">
          <PickName pick={pick} />
        </h3>
        {remove ? (
          <button
            className="text-sm underline disabled:opacity-50"
            disabled={pending}
            onClick={remove}
            type="button"
          >
            Remove
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function CardSelectionStudio({
  token,
  targets,
  peerCards,
  completedSlots,
  totalSlots,
  needsMoreVariety,
  onSave,
  onRemove,
}: {
  token: string;
  targets: Target[];
  peerCards: Record<string, CommanderPick | null>;
  completedSlots: number;
  totalSlots: number;
  needsMoreVariety: boolean;
  /**
   * Override the server actions. Only the `/demo` routes pass these: they let
   * someone try the workshop without a database behind them, and they do it
   * through this component rather than a lookalike so what the demo shows is
   * what the real page does.
   */
  onSave?: (targetId: string, cardId: string, partnerId: string | null) => Promise<CardActionResult>;
  onRemove?: (targetId: string) => Promise<CardActionResult>;
}) {
  const router = useRouter();
  const [targetId, setTargetId] = useState(targets[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  /** A commander chosen for the current target, paused so a partner can be added. */
  const [pendingPrimary, setPendingPrimary] = useState<CommanderOption | null>(null);
  const { options } = useCommanderOptions();
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
      // The server path re-renders the page to pick up the saved rows; a
      // simulated workshop already holds its own state.
      if (!onSave) {
        router.refresh();
      }
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
              Save one commander for every other participant. Your own two cards came in with your sign-up. When everyone has finished, all choices lock and your secret assignment opens.
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
          <h2 className="text-2xl font-semibold">A card for everyone else</h2>
          <p className="mt-1 text-sm opacity-70">Each recommendation goes only into that person’s private pool.</p>
        </div>
        <label className="block max-w-md space-y-2">
          <span className="text-sm font-medium">Choose a participant</span>
          <select
            className="w-full rounded-lg border border-slate-300/30 bg-transparent px-3 py-2"
            onChange={(event) => {
              setTargetId(event.target.value);
              setPendingPrimary(null);
            }}
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
            pending={pending}
            pick={peerCards[target.id]!}
            remove={() =>
              void dispatch(() =>
                onRemove ? onRemove(target.id) : removeCardAction(token, target.id)
              )
            }
          />
        ) : null}

        {target && pendingPrimary ? (
          <PartnerPicker
            colorVeto={target.colorVeto}
            onChoose={(partner) => {
              void dispatch(() =>
                onSave
                  ? onSave(target.id, pendingPrimary.id, partner.id)
                  : saveCardAction(token, target.id, pendingPrimary.id, partner.id)
              ).then(() => setPendingPrimary(null));
            }}
            onSkip={() => {
              void dispatch(() =>
                onSave
                  ? onSave(target.id, pendingPrimary.id, null)
                  : saveCardAction(token, target.id, pendingPrimary.id)
              ).then(() => setPendingPrimary(null));
            }}
            options={(options ?? []).filter((option) => option.id !== pendingPrimary.id)}
            primary={pendingPrimary}
            skipLabel={`Save ${pendingPrimary.name} on its own`}
          />
        ) : null}

        {target && !pendingPrimary ? (
          <CommanderBrowser
            actionLabel={peerCards[target.id] ? `Replace pick for ${target.name}` : `Save for ${target.name}`}
            initialPrompt={undefined}
            key={target.id}
            lockedExclude={target.colorVeto}
            lockedReason={target.colorVeto ? `${target.name}'s vetoed colour stays excluded.` : undefined}
            onChoose={async (card) => {
              // A commander that can take a partner pauses so one can be
              // offered; anything else saves immediately.
              if (canTakePartner(card)) {
                setPendingPrimary(card);
                return;
              }
              const saved = await dispatch(() =>
                onSave
                  ? onSave(target.id, card.id, null)
                  : saveCardAction(token, target.id, card.id)
              );
              if (!saved) throw new Error("Card was not saved.");
            }}
            savedCardIds={
              peerCards[target.id]
                ? pickCards(peerCards[target.id]!).map((card) => card.id)
                : []
            }
          />
        ) : null}
      </section>
    </div>
  );
}
