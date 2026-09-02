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
