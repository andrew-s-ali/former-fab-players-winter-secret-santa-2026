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
 * `game:paper` is load-bearing: without it, digital-only MTGO uncommon
 * reprints would wrongly enter the pool.
 *
 * `-e:slz` excludes a set whose uncommon printings are not meant to change
 * what is legal here. Scryfall filters **printings**, not cards, so this drops
 * only the commanders whose *sole* uncommon paper printing is in that set —
 * anything also printed uncommon elsewhere stays, which is the intent. When it
 * was added it took the pool from 710 to 704, leaving the 65 pair-capable
 * commanders untouched.
 *
 * Adding an exclusion can strand a sign-up that named one of the dropped
 * cards: `resolveSelfCards` resolves against the live pool, so the draw fails
 * naming the person and the card. Check the console's sign-up list after
 * changing this.
 */
export const COMMANDER_POOL_QUERY = "f:edh is:commander r:u game:paper -e:slz";

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
