/** Commanders banned outright from the event. */
export const BANNED_COMMANDERS = [
  "Tatyova, Benthic Druid",
  "Alexios, Deimos of Kosmos",
  "Dionus, Elvish Archdruid",
  "Queza, Augur of Agonies",
  "Mica, Reader of Ruins",
  "Zada, Hedron Grinder",
] as const;

/**
 * Partner combinations that are banned together. Each card is individually
 * legal — only the pairing is prohibited.
 */
export const BANNED_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["Malcolm, Keen-Eyed Navigator", "Kediss, Emberclaw Familiar"],
];

/** Deck budget in US dollars. */
export const BUDGET_USD = 75;

/**
 * The Scryfall query defining the legal commander pool.
 *
 * **No `f:edh`**, deliberately. Format legality lags a set's release by a few
 * weeks, so a spoiled set is invisible to `f:edh` exactly while the group is
 * most excited about it. The group would rather play with new cards on the day
 * they can buy them, so legality here is the event's own judgement: the type
 * line says it can be a commander, the rarity says uncommon, and the ban list
 * below is ours. Reality Fracture brought 28 commanders in this way.
 *
 * `-is:unset` replaces what `f:edh` used to do about un-sets. It is blunter:
 * seven Unfinity commanders are legal in Commander and are lost with it
 * (Ambassador Blorpityblorpboop, Dee Kay, Monoxa, Roxi, Spinnerette, The Space
 * Family Goblinson, Tusk and Whiskers). None were in anybody's pool when this
 * changed. Nothing banned in Commander is an uncommon legendary creature, so
 * dropping `f:edh` lets in no banned card.
 *
 * **`game:paper` is load-bearing** and was nearly lost in this change. Without
 * it the pool gains 49 Arena-only Alchemy cards — the "A-" rebalances and
 * Alchemy Horizons — which cannot be bought, in an exchange where somebody has
 * to physically hand over a deck built to a $75 budget.
 *
 * `-e:slz` excludes a set whose uncommon printings are not meant to change
 * what is legal here. Scryfall filters **printings**, not cards, so this drops
 * only the commanders whose *sole* uncommon paper printing is in that set —
 * anything also printed uncommon elsewhere stays, which is the intent.
 *
 * Sizes when this last changed: 704 with `f:edh`, 742 without it, 791 without
 * `game:paper` too.
 *
 * Adding an exclusion can strand a sign-up that named one of the dropped
 * cards: `resolveSelfCards` resolves against the live pool, so the draw fails
 * naming the person and the card. Check the console's sign-up list after
 * changing this.
 */
export const COMMANDER_POOL_QUERY = "is:commander r:u game:paper -is:unset -e:slz";

/**
 * The same pool, as a search a participant can open on Scryfall.
 *
 * `COMMANDER_POOL_QUERY` on its own is not what this event plays with: six
 * commanders are banned on top of it, and a search that still lists them sends
 * somebody back here holding a card the save action refuses. Scryfall's
 * exact-name operator drops them — verified against the live API, which goes
 * from 704 results to 698, the same six `legalCommanders` removes.
 *
 * Two things it deliberately does not express:
 *
 *   - the banned **pair**. Malcolm and Kediss are each legal alone and only the
 *     combination is out, which no single search can say. The rules panel
 *     stays the authority there.
 *   - the recipient's vetoed colour. This is the whole pool rather than one
 *     person's slice of it, so the same link is correct on every screen; the
 *     picker on this site is what enforces a veto.
 */
export function commanderPoolSearchUrl(): string {
  const query = [
    COMMANDER_POOL_QUERY,
    ...BANNED_COMMANDERS.map((name) => `-!"${name}"`),
  ].join(" ");
  return `https://scryfall.com/search?unique=cards&q=${encodeURIComponent(query)}`;
}
