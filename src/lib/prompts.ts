/** Build prompts offered alongside the commander grid, purely for inspiration. */
export const THEME_PROMPTS = [
  "Go wide with tokens",
  "Spellslinger — instants and sorceries matter",
  "Artifacts matter",
  "Enchantress — draw off enchantments",
  "Lifegain payoffs",
  "Sacrifice and recursion",
  "+1/+1 counters",
  "Graveyard value",
  "One big creature, heavily protected",
  "Group hug, then win anyway",
  "Blink and flicker",
  "Landfall",
  "Tribal — pick a creature type and commit",
  "Steal your opponents' things",
  "Aggressive low-curve beatdown",
  "Mill as a resource, not a wincon",
  "Equipment and auras — suit up",
  "Chaos and coin flips",
  "Storm-lite: chain cheap spells",
  "Wheels and forced draw",
  "Control with few creatures",
  "Reanimate something enormous",
  "Pillowfort — make yourself unattractive to attack",
  "All commons except the commander",
] as const;

/**
 * Picks a prompt.
 *
 * `rng` returns a float in [0, 1) and is injected so tests are deterministic.
 */
export function pickPrompt(rng: () => number = Math.random): string {
  return THEME_PROMPTS[Math.floor(rng() * THEME_PROMPTS.length)];
}
