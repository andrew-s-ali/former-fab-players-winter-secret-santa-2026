"use client";

import { useState } from "react";
import { SecretCardChoices } from "@/components/SecretCardChoices";
import { visibleShortlist } from "@/lib/card-pool";
import { pickName, type CommanderPick } from "@/lib/pairing";

/**
 * The one-time trade, playable on the demo routes.
 *
 * The real cash-in writes to Postgres and can never be undone — which is the
 * point of it, and also why nobody would want to find out what it does by
 * using theirs. Here the same component runs against browser state instead, so
 * the trade can be tried, seen, and then reset.
 *
 * `visibleShortlist` is the function the real page uses to decide which of the
 * four are shown, so the card that appears and where it lands are not
 * approximated.
 *
 * One thing the demo cannot copy: it is handed all four cards, so the hidden
 * one is in the page payload and could be read out of it. The real page never
 * sends it — `getOrCreateSecretCards` returns only the visible three, and the
 * fourth stays in the database until the cash-in is spent. Do not take this
 * component's shape as a pattern for the real one.
 */
export function DemoCardTrade({
  shortlist,
  token,
}: {
  /** All four: the three shown, plus the one held back. */
  shortlist: [CommanderPick, CommanderPick, CommanderPick, CommanderPick];
  token: string;
}) {
  const [replacedIndex, setReplacedIndex] = useState<number | null>(null);
  const [traded, setTraded] = useState<string | null>(null);

  const spent = replacedIndex !== null;

  return (
    <div className="space-y-4">
      <SecretCardChoices
        cards={visibleShortlist(shortlist, replacedIndex)}
        cashInUsed={spent}
        onCashIn={async (index) => {
          setTraded(pickName(visibleShortlist(shortlist, replacedIndex)[index]));
          setReplacedIndex(index);
          return { ok: true, message: "Traded." };
        }}
        token={token}
      />

      {spent ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-amber-200/30 p-4 text-sm">
          <span className="opacity-80">
            You traded <strong>{traded}</strong> for the hidden fourth, which is
            now last in the row. On a real link that is permanent.
          </span>
          <button
            className="rounded-lg border px-3 py-1.5 text-sm font-medium"
            onClick={() => {
              setReplacedIndex(null);
              setTraded(null);
            }}
            type="button"
          >
            Reset the demo
          </button>
        </div>
      ) : null}
    </div>
  );
}
