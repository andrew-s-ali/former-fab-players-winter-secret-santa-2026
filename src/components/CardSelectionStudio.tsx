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
import { WORKSHOP_CLOSE_AT } from "@/lib/event";
import { formatDeadline } from "@/lib/launch";
import { canTakePartner, pickCards, type CommanderPick } from "@/lib/pairing";
import { commanderPoolSearchUrl } from "@/lib/rules";

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
  /**
   * This person's own progress, which the group counter does not show.
   *
   * "53 of 56" is the number that decides when the exchange opens, but it is
   * not the number anybody can act on: it moves when other people work. What
   * a reader wants to know is how many of their own are left.
   */
  const yoursSaved = targets.filter((candidate) => peerCards[candidate.id]).length;

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
            {/*
              A target, not a gate. Nothing refuses a pick after this date —
              the exchange still waits for the last person — but the deadline
              is what everyone is being chased toward, so it belongs where the
              picking happens rather than only in the reminder.
            */}
            <p className="mt-2 text-sm opacity-75">
              Aim to be done by{" "}
              <strong>{formatDeadline(WORKSHOP_CLOSE_AT)}</strong>. Building
              starts the day after, and nobody&rsquo;s deck can start until the
              last pick is in.
            </p>
          </div>
          <div className="space-y-2 sm:text-right">
            <p className="inline-block rounded-full border border-sky-200/20 px-4 py-2 text-sm">
              {completedSlots} of {totalSlots} group picks saved
            </p>
            <p className="text-sm opacity-75">
              {yoursSaved === targets.length
                ? "All of yours are in \u2014 thank you."
                : `${yoursSaved} of ${targets.length} of yours saved`}
            </p>
          </div>
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

      {/*
        Spelled out rather than left to be inferred. Rehearsing the workshop
        turned up three things nobody can work out from the controls: how many
        picks they personally owe, that the deadline is a target and the last
        pick is what actually unlocks anything, and that several people
        choosing the same commander for the same person can stall the event
        with every slot apparently filled.
      */}
      <section className="space-y-3 rounded-2xl border border-slate-300/20 p-5">
        <h2 className="text-lg font-semibold">What to do here</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm opacity-80">
          <li>
            Pick a name under <strong>Choose a participant</strong> below. You
            owe one commander for each of the {targets.length} other players.
          </li>
          <li>
            Find them a commander &mdash; search by name, filter by colour, or
            press <strong>Roll again</strong> for a fresh handful &mdash; then
            open the card and press <strong>Save for &hellip;</strong>. If it
            can take a partner you are offered one; saving it on its own is
            always fine.
          </li>
          <li>
            Change any of them as often as you like until the last person
            finishes. At that moment every choice locks.
          </li>
          <li>
            Once the whole group is done this page turns into your own
            assignment: who you are building for, and a shortlist drawn from
            their pool.
          </li>
        </ol>
        <p className="text-sm opacity-80">
          <strong>
            Pick a different card for each person, and something you would not
            expect everyone else to pick.
          </strong>{" "}
          Each person&rsquo;s shortlist needs four distinct cards out of their
          two sign-up choices plus one from each of the rest of you &mdash; so
          if several of you land on the same commander for the same person,
          that pool comes up short and nobody&rsquo;s assignment opens.
        </p>
        <p className="text-sm">
          <a
            className="underline"
            href={commanderPoolSearchUrl()}
            rel="noreferrer"
            target="_blank"
          >
            Open the full legal pool on Scryfall &#8599;
          </a>{" "}
          <span className="opacity-70">
            &mdash; all of it in a new tab, with the banned commanders already
            taken out. Scryfall knows nothing about colour vetoes; the picker
            below does.
          </span>
        </p>
      </section>

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
