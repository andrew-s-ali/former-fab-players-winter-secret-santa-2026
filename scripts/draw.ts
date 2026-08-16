import { readFile } from "node:fs/promises";
import { randomInt, randomUUID } from "node:crypto";
import { drawAssignments } from "#lib/draw";
import type { EventData, Participant } from "#lib/participants";
import { writeEvent, readEvent, describeTarget } from "#lib/store";
import { mintToken } from "#lib/tokens";
import { parseCsv, toParticipantInputs } from "#scripts/csv";

/** Crypto-backed float in [0, 1) — the spec requires the real draw not use Math.random. */
const cryptoRng = () => randomInt(2 ** 30) / 2 ** 30;

/**
 * Usage: npm run draw -- responses.csv [--force]
 *
 * Refuses to overwrite an existing draw without --force: rerunning reshuffles
 * everyone, invalidating links already sent out.
 */
async function main() {
  const [path, ...flags] = process.argv.slice(2);
  if (!path) {
    throw new Error("Usage: npm run draw -- <responses.csv> [--force]");
  }

  console.log(describeTarget());

  const existing = await readEvent();
  if (existing.participants.length > 0 && !flags.includes("--force")) {
    throw new Error(
      `A draw already exists with ${existing.participants.length} participants. ` +
        "Re-running reshuffles everyone and breaks links already sent. " +
        "Use scripts/update-participant.ts to fix details, or pass --force to redraw."
    );
  }

  const inputs = toParticipantInputs(parseCsv(await readFile(path, "utf8")));
  const people = inputs.map((input) => ({ ...input, id: randomUUID() }));
  const assignments = drawAssignments(people, cryptoRng);

  const participants: Participant[] = people.map((person) => ({
    id: person.id,
    name: person.name,
    recipientId: assignments.get(person.id)!,
    token: mintToken(),
    colorVeto: person.colorVeto,
    themeVeto: person.themeVeto,
    themeWish: person.themeWish,
  }));

  const event: EventData = { participants };
  await writeEvent(event);

  const base = process.env.SITE_URL ?? "http://localhost:3000";
  console.log(`\nDrew ${participants.length} participants.\n`);
  console.log(
    "Send each link privately — anyone holding one can see that assignment.\n"
  );
  for (const p of participants) {
    console.log(`${p.name}\t${base}/s/${p.token}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
