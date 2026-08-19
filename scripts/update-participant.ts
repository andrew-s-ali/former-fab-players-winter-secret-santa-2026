import {
  EDITABLE_FIELDS,
  applyParticipantEdits,
  findParticipantByName,
} from "#lib/admin";
import { readEvent, writeEvent, describeTarget } from "#lib/store";

/**
 * Usage:
 *   npm run update-participant -- "Ada" --color=R --veto="mill" --wish="elves"
 *   npm run update-participant -- "Ada" --color=none
 *
 * Edits details only. Assignments and tokens are never touched, so links
 * already sent out keep working.
 *
 * "none" is a sentinel that clears a field; a participant whose veto is
 * literally the word "none" cannot be set to it (only cleared) — anything
 * else, like "none of the tribal stuff", is unaffected.
 *
 * Flag parsing lives here; the edit itself lives in `src/lib/admin.ts`, shared
 * with the organiser console.
 */

const KNOWN_FLAGS = ["color", "veto", "wish"] as const;

/** Reads --flag=value, rejecting typos and repeats rather than ignoring them. */
function readFlags(flags: string[]): Map<string, string> {
  const values = new Map<string, string>();

  for (const flag of flags) {
    const separator = flag.indexOf("=");
    const name = flag.slice(2, separator === -1 ? undefined : separator);

    if (!flag.startsWith("--") || separator === -1) {
      throw new Error(`Malformed flag "${flag}". Expected --name=value.`);
    }
    if (!KNOWN_FLAGS.includes(name as (typeof KNOWN_FLAGS)[number])) {
      throw new Error(
        `Unknown flag "--${name}". Known flags: ${KNOWN_FLAGS.map((f) => `--${f}`).join(", ")}.`
      );
    }
    if (values.has(name)) {
      throw new Error(`Flag --${name} was given more than once.`);
    }

    values.set(name, flag.slice(separator + 1));
  }

  return values;
}

async function main() {
  const [name, ...flags] = process.argv.slice(2);
  if (!name) {
    throw new Error(
      'Usage: npm run update-participant -- "<name>" [--color=R|none] [--veto=...] [--wish=...]'
    );
  }

  console.log(describeTarget());

  const event = await readEvent();
  const participant = findParticipantByName(event, name);
  const values = readFlags(flags);

  const { before } = applyParticipantEdits(participant, {
    color: values.get("color"),
    veto: values.get("veto"),
    wish: values.get("wish"),
  });

  await writeEvent(event);

  console.log(`Updated ${participant.name}`);
  for (const key of EDITABLE_FIELDS) {
    const arrow = before[key] === participant[key] ? "unchanged" : "→";
    console.log(
      `  ${key}: ${before[key] ?? "(none)"} ${arrow} ${participant[key] ?? "(none)"}`
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
