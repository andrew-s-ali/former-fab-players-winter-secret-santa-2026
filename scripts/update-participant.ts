import type { ColorCode } from "#lib/commanders";
import { readEvent, writeEvent, describeTarget } from "#lib/store";
import { COLOR_CODES } from "#scripts/csv";

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

const COLOR_CODE_SET = new Set<ColorCode>(["W", "U", "B", "R", "G"]);

/** Accepts a colour code (W/U/B/R/G) or a colour word (white/blue/...). */
function parseColor(raw: string): ColorCode {
  const upper = raw.toUpperCase();
  if (COLOR_CODE_SET.has(upper as ColorCode)) {
    return upper as ColorCode;
  }

  const fromWord = COLOR_CODES[raw.toLowerCase()];
  if (fromWord) {
    return fromWord;
  }

  throw new Error(
    `Unrecognised colour "${raw}". Use a code (${Array.from(COLOR_CODE_SET).join(", ")}) ` +
      `or a name (${Object.keys(COLOR_CODES).join(", ")}), or "none" to clear the veto.`
  );
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
  const participant = event.participants.find(
    (p) => p.name.toLowerCase() === name.toLowerCase()
  );

  if (!participant) {
    throw new Error(
      `No participant named "${name}". Known: ${event.participants
        .map((p) => p.name)
        .join(", ")}`
    );
  }

  const values = readFlags(flags);

  const before = {
    colorVeto: participant.colorVeto,
    themeVeto: participant.themeVeto,
    themeWish: participant.themeWish,
  };

  const color = values.get("color");
  if (color !== undefined) {
    participant.colorVeto = color === "none" ? null : parseColor(color);
  }

  const veto = values.get("veto");
  if (veto !== undefined) {
    participant.themeVeto = veto === "none" ? null : veto;
  }

  const wish = values.get("wish");
  if (wish !== undefined) {
    participant.themeWish = wish === "none" ? null : wish;
  }

  await writeEvent(event);

  console.log(`Updated ${participant.name}`);
  for (const key of ["colorVeto", "themeVeto", "themeWish"] as const) {
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
