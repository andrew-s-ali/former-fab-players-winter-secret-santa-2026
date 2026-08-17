import { BANNED_COMMANDERS, BANNED_PAIRS, BUDGET_USD } from "@/lib/rules";

/**
 * Event rules, shared between the home page and the secret reveal page.
 */
export function RulesSummary() {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Rules</h2>

      <ul className="list-disc space-y-1 pl-5">
        <li>
          Commanders must be legendary cards that can be a commander —
          creatures, Backgrounds and the like — printed in paper at{" "}
          <strong>uncommon</strong>, including both halves of a partner pair.
        </li>
        <li>Deck cards may be any rarity.</li>
        <li>
          Budget: <strong>${BUDGET_USD}</strong>.
        </li>
      </ul>

      <div>
        <h3 className="font-semibold">Banned commanders</h3>
        <ul className="list-disc space-y-1 pl-5">
          {BANNED_COMMANDERS.map((name) => (
            <li key={name}>{name}</li>
          ))}
          {BANNED_PAIRS.map(([first, second]) => (
            <li key={`${first}-${second}`}>
              {first} + {second} (banned as a pair — each is individually
              legal with a different partner)
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
