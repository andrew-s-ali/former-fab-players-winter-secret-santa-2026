import type { ColorCode } from "@/lib/commanders";
import type { Participant } from "@/lib/participants";

const COLOR_NAMES: Record<ColorCode, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
};

const NONE = "No preference given";

/**
 * Shows the recipient's name and stated preferences: colour veto, theme
 * veto, and theme wish. Presentational only — the page owns data access.
 */
export function RevealDetails({ recipient }: { recipient: Participant }) {
  return (
    <section className="space-y-4">
      <p className="opacity-70">You are building for</p>
      <h2 className="text-2xl font-semibold">{recipient.name}</h2>

      <dl className="space-y-3">
        <div>
          <dt className="font-semibold">Colour to avoid</dt>
          <dd>{recipient.colorVeto ? COLOR_NAMES[recipient.colorVeto] : NONE}</dd>
        </div>
        <div>
          <dt className="font-semibold">Theme to avoid</dt>
          <dd>{recipient.themeVeto ?? NONE}</dd>
        </div>
        <div>
          <dt className="font-semibold">What they&apos;d like</dt>
          <dd>{recipient.themeWish ?? NONE}</dd>
        </div>
      </dl>
    </section>
  );
}
