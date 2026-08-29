"use client";

import { useState } from "react";
import { CardSelectionStudio } from "@/components/CardSelectionStudio";
import type { ColorCode } from "@/lib/commanders";
import {
  canPairWith,
  describeIllegalPick,
  pickColorIdentity,
  pickName,
  type CommanderPick,
} from "@/lib/pairing";
import type { CommanderOption } from "@/lib/commanders";
import { useCommanderOptions } from "@/components/use-commander-options";

type Target = { id: string; name: string; colorVeto: ColorCode | null };

/**
 * The card workshop, playable on the demo routes.
 *
 * This is the phase between the draw and the exchange: everybody picks one
 * commander for every other participant, and nobody's assignment opens until
 * they all have. On a real link it writes to Postgres; here the same component
 * runs against browser state, so the flow can be walked through and reset.
 *
 * Saving is re-implemented rather than stubbed out, because the rules are the
 * interesting part: the recipient's vetoed colour is excluded, a partner has
 * to be legal beside its commander, and both are checked against the pair
 * rather than either half. Those checks live in `pairing.ts`, so this runs the
 * same ones the server action does.
 */
export function DemoCardWorkshop({
  targets,
  initialPeerCards,
  othersCompleted,
  totalSlots,
  token,
}: {
  targets: Target[];
  initialPeerCards: Record<string, CommanderPick | null>;
  /** Slots the other participants have already filled, for the progress bar. */
  othersCompleted: number;
  totalSlots: number;
  token: string;
}) {
  const [peerCards, setPeerCards] = useState(initialPeerCards);
  const { options } = useCommanderOptions();

  const mine = Object.values(peerCards).filter(Boolean).length;

  function find(id: string): CommanderOption | undefined {
    return options?.find((option) => option.id === id);
  }

  return (
    <div className="space-y-4">
      <CardSelectionStudio
        completedSlots={othersCompleted + mine}
        needsMoreVariety={false}
        onRemove={async (targetId) => {
          setPeerCards((current) => ({ ...current, [targetId]: null }));
          return { ok: true, message: "The saved card was removed." };
        }}
        onSave={async (targetId, cardId, partnerId) => {
          const commander = find(cardId);
          const partner = partnerId === null ? null : (find(partnerId) ?? null);
          if (!commander || (partnerId !== null && !partner)) {
            return { ok: false, error: "That card is not in the legal pool." };
          }

          // The same rules the server action applies, from the same module.
          const target = targets.find((candidate) => candidate.id === targetId);
          const pick = { commander, partner };
          const illegal = describeIllegalPick(pick);
          if (illegal) {
            return { ok: false, error: illegal };
          }
          if (partner && !canPairWith(commander, partner)) {
            return { ok: false, error: "Those two cannot be partnered." };
          }
          if (target?.colorVeto && pickColorIdentity(pick).includes(target.colorVeto)) {
            return {
              ok: false,
              error: `${pickName(pick)} includes ${target.colorVeto}, which this participant vetoed.`,
            };
          }

          setPeerCards((current) => ({
            ...current,
            [targetId]: pick as unknown as CommanderPick,
          }));
          return { ok: true, message: `${pickName(pick)} was saved for ${target?.name}.` };
        }}
        peerCards={peerCards}
        targets={targets}
        token={token}
        totalSlots={totalSlots}
      />

      <p className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-sky-200/25 p-4 text-sm">
        <span className="opacity-80">
          Nothing here is saved — the demo never reaches the database. On a real
          link each pick is stored as you make it, and the page turns into your
          assignment once <em>everyone</em> has finished.
        </span>
        <button
          className="rounded-lg border px-3 py-1.5 text-sm font-medium"
          onClick={() => setPeerCards(initialPeerCards)}
          type="button"
        >
          Reset the demo
        </button>
      </p>
    </div>
  );
}
