/** A single build hook with display text and an optional search keyword for commander lookup. */
export interface ThemePromptItem {
  text: string;
  keyword?: string;
}

/** Build prompts offered alongside the commander grid, purely for inspiration. */
export const THEME_PROMPTS: readonly ThemePromptItem[] = [
  { text: "Go wide with tokens", keyword: "token" },
  { text: "Spellslinger — instants and sorceries matter", keyword: "instant" },
  { text: "Artifacts matter", keyword: "artifact" },
  { text: "Enchantress — draw off enchantments", keyword: "enchantment" },
  { text: "Lifegain payoffs", keyword: "life" },
  { text: "Sacrifice and recursion", keyword: "sacrifice" },
  { text: "+1/+1 counters", keyword: "counter" },
  { text: "Graveyard value", keyword: "graveyard" },
  { text: "One big creature, heavily protected", keyword: "hexproof" },
  { text: "Group hug, then win anyway", keyword: "draw" },
  { text: "Blink and flicker", keyword: "exile" },
  { text: "Landfall", keyword: "land" },
  { text: "Tribal — pick a creature type and commit", keyword: "creature" },
  { text: "Steal your opponents' things", keyword: "gain control" },
  { text: "Aggressive low-curve beatdown", keyword: "attack" },
  { text: "Mill as a resource, not a wincon", keyword: "mill" },
  { text: "Equipment and auras — suit up", keyword: "equipment" },
  { text: "Chaos and coin flips", keyword: "coin" },
  { text: "Storm-lite: chain cheap spells", keyword: "cast" },
  { text: "Wheels and forced draw", keyword: "discard" },
  { text: "Control with few creatures", keyword: "destroy" },
  { text: "Reanimate something enormous", keyword: "return" },
  { text: "Pillowfort — make yourself unattractive to attack", keyword: "cannot attack" },
  { text: "All commons except the commander", keyword: "commander" },
] as const;

/**
 * Picks a prompt.
 *
 * `rng` returns a float in [0, 1) and is injected so tests are deterministic.
 */
export function pickPrompt(rng: () => number = Math.random): ThemePromptItem {
  return THEME_PROMPTS[Math.floor(rng() * THEME_PROMPTS.length)];
}

export const randomPrompt = pickPrompt;
