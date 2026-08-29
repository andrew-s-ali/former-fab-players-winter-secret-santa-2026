"use client";

import { CommanderCombobox } from "@/components/CommanderCombobox";
import type { ColorCode, CommanderOption } from "@/lib/commanders";
import { canTakePartner, partnersFor } from "@/lib/pairing";

/**
 * The optional second half of a commander choice.
 *
 * Shown only once a commander that can actually take a partner has been
 * chosen, and offering only the cards that legally pair with it — plain
 * Partner with plain Partner, "Choose a Background" with a Background. The
 * event's banned-together list is applied here too, so a pair that is illegal
 * for this event never appears as an option rather than being rejected on save.
 *
 * A partner's colours join the commander's, so the participant's vetoed colour
 * is excluded from this list as well; a legal pair that would hand somebody
 * the colour they asked to avoid is not offered.
 */
export function PartnerPicker({
  primary,
  options,
  colorVeto,
  onChoose,
  onSkip,
  skipLabel,
}: {
  primary: CommanderOption;
  options: CommanderOption[];
  colorVeto: ColorCode | null;
  onChoose: (partner: CommanderOption) => void;
  onSkip: () => void;
  skipLabel: string;
}) {
  if (!canTakePartner(primary)) {
    return null;
  }

  const candidates = partnersFor(primary, options).filter(
    (candidate) => !colorVeto || !candidate.colorIdentity.includes(colorVeto)
  );

  const kind =
    primary.pairingRole === "choose-background" ? "Background" : "partner";

  return (
    <div className="space-y-3 rounded-xl border border-sky-200/25 bg-sky-950/15 p-4">
      <div>
        <h4 className="text-sm font-semibold">
          {primary.name} can take a {kind}
        </h4>
        <p className="mt-1 text-xs opacity-70">
          {candidates.length === 0
            ? `No legal ${kind} is available for this choice — save it on its own.`
            : `Add one to make this a single two-card choice, or save ${primary.name} on its own. A pair fills one slot, not two.`}
        </p>
      </div>

      {candidates.length > 0 ? (
        <CommanderCombobox
          label={`Find a ${kind} for ${primary.name}`}
          onChoose={onChoose}
          options={candidates}
        />
      ) : null}

      <button className="text-sm underline" onClick={onSkip} type="button">
        {skipLabel}
      </button>
    </div>
  );
}
