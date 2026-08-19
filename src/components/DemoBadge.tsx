/** Marks a page as fake data, so it can never be mistaken for the real event. */
export function DemoBadge() {
  return (
    <p className="inline-block rounded-full border border-amber-400 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-400">
      Demo — invented people, not the real draw
    </p>
  );
}
