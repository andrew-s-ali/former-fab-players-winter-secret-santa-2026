import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { drawAssignments } from "#lib/draw";
import type { EventData, Participant } from "#lib/participants";
import { mintToken } from "#lib/tokens";

/**
 * Usage: npm run seed:demo [-- --revealed]
 *
 * Writes fake participants to src/demo/demo-event.json for the /demo routes.
 * It never imports the real store, so it cannot read or write real event data.
 * The people are invented, so committing their tokens protects nothing.
 */
const PEOPLE = [
  { name: "Ada Lovelace", colorVeto: "R" as const, themeVeto: "mill", themeWish: "elves and tokens" },
  { name: "Bob Ross", colorVeto: null, themeVeto: null, themeWish: null },
  { name: "Cleo Patra", colorVeto: "G" as const, themeVeto: "stax", themeWish: "artifacts, the more the better" },
  { name: "Dev Patel-Nakamura-Rodriguez", colorVeto: "U" as const, themeVeto: null, themeWish: "something with a very long explanation attached, because people do write essays in free-text fields and the layout should survive it" },
  { name: "Eli 🎄", colorVeto: null, themeVeto: "combo", themeWish: "lifegain" },
  { name: "Fay Wray", colorVeto: "B" as const, themeVeto: null, themeWish: null },
  { name: "Gus", colorVeto: null, themeVeto: null, themeWish: "go wide" },
  { name: "Hana", colorVeto: "W" as const, themeVeto: "tribal", themeWish: "spellslinger" },
];

async function main() {
  const revealed = process.argv.slice(2).includes("--revealed");

  const people = PEOPLE.map((p) => ({ ...p, id: randomUUID() }));
  const assignments = drawAssignments(people);

  const participants: Participant[] = people.map((person) => ({
    id: person.id,
    name: person.name,
    recipientId: assignments.get(person.id)!,
    token: mintToken(),
    colorVeto: person.colorVeto,
    themeVeto: person.themeVeto,
    themeWish: person.themeWish,
  }));

  const event: EventData = {
    participants,
    revealedAt: revealed ? new Date().toISOString() : null,
  };

  await mkdir("src/demo", { recursive: true });
  await writeFile("src/demo/demo-event.json", `${JSON.stringify(event, null, 2)}\n`);

  console.log(`Wrote ${participants.length} demo participants (revealed: ${revealed}).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
