import { CardImage } from "@/components/CardImage";
import { pickCards, pickName, type PickOf } from "@/lib/pairing";

/** Enough of a card to draw it. */
type Drawable = { id: string; name: string; imageUrl: string | null };

/**
 * How much of one card's width each half of a pair takes.
 *
 * The two are offset into opposite corners, so this is also what sets the
 * overlap: at 86%, the remaining 14% is the offset in each direction, and the
 * pair lands in exactly one card's footprint.
 */
const PAIRED_SCALE = "86%";

function Card({
  card,
  className,
  width,
}: {
  card: Drawable;
  className: string;
  /** Inline, because Tailwind has no utility for the paired scale. */
  width?: string;
}) {
  if (!card.imageUrl) {
    return (
      <div
        className={`${className} aspect-[5/7] bg-slate-500/20`}
        style={width ? { width } : undefined}
      />
    );
  }
  return (
    <CardImage
      className={className}
      name={card.name}
      src={card.imageUrl}
      style={width ? { width } : undefined}
    />
  );
}

/**
 * The card art for one commander choice.
 *
 * A choice is one or two cards, so every place that shows one needs the same
 * treatment. Kept in one component rather than repeated at each call site,
 * because getting it wrong silently hides half of somebody's commander.
 *
 * A pair is drawn as two cards overlapping at the corners, inside the footprint
 * of a single card. Side by side at half width they read as two separate
 * things and shrink the art to nothing; stacked, a pair takes the same room as
 * every other choice in the row, which is what it is — one choice. Either half
 * can still be hovered for the enlarged view, since the front card only covers
 * a corner of the one behind.
 */
export function PickCards({
  pick,
  size = "full",
}: {
  pick: PickOf<Drawable>;
  /** `full` fills its column; `thumb` is a fixed small row. */
  size?: "full" | "thumb";
}) {
  const cards = pickCards(pick);
  const thumb = size === "thumb";
  const width = thumb ? "w-14" : "w-full";
  const rounded = thumb ? "rounded" : "rounded-lg";

  if (cards.length === 1) {
    return <Card card={cards[0]} className={`${width} ${rounded}`} />;
  }

  return (
    <div className={`relative aspect-[5/7] ${width}`}>
      {/*
        Partner behind at the top-right, commander in front at the bottom-left.
        Offsetting the back card upward leaves its title bar showing above the
        front one, so both cards can be named at a glance; tucking it under the
        bottom corner instead would show only art and an edge.
      */}
      <Card
        card={cards[1]}
        className={`absolute right-0 top-0 ${rounded} ring-1 ring-black/30`}
        width={PAIRED_SCALE}
      />
      <Card
        card={cards[0]}
        className={`absolute bottom-0 left-0 z-10 ${rounded} shadow-lg ring-1 ring-black/30`}
        width={PAIRED_SCALE}
      />
    </div>
  );
}

/**
 * The name of a choice, with the pairing made visible.
 *
 * "A + B" reads as one commander choice rather than two separate cards, which
 * is what it is.
 */
export function PickName({ pick }: { pick: PickOf<Drawable> }) {
  if (!pick.partner) {
    return <>{pick.commander.name}</>;
  }
  return (
    <>
      {pick.commander.name}
      <span className="opacity-60"> + </span>
      {pick.partner.name}
      <span className="ml-2 rounded-full border border-sky-200/30 px-2 py-0.5 text-xs font-normal opacity-80">
        partners
      </span>
    </>
  );
}

/** The plain-text form, for aria labels and confirmation copy. */
export { pickName };
