import { fileURLToPath } from "node:url";
import { setReveal } from "#lib/admin";
import { describeTarget } from "#lib/store";

/**
 * Usage:
 *   npm run reveal            # unlock /reveal
 *   npm run reveal -- --undo  # lock it again
 *
 * The work itself lives in `src/lib/admin.ts` so the CLI and the organiser
 * console cannot drift apart; this file is the command-line face of it.
 */
export const reveal = setReveal;

export async function main(
  args: string[] = process.argv.slice(2)
): Promise<void> {
  const undo = args.includes("--undo");

  console.log(describeTarget());

  const result = await reveal({ undo });
  console.log(result.message);
}

const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
    process.argv[1].endsWith("scripts/reveal.ts") ||
    process.argv[1].endsWith("reveal.ts"));

if (isDirectRun && process.env.NODE_ENV !== "test") {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
