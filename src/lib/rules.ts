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

/** The Scryfall query defining the legal commander pool. */
export const COMMANDER_POOL_QUERY = "f:edh is:commander r:u game:paper";
