import { fileURLToPath } from "node:url";
import { describeTarget, readEvent, writeEvent } from "#lib/store";

/**
 * Usage:
 *   npm run reveal            # unlock /reveal
 *   npm run reveal -- --undo  # lock it again
 *
 * Unlocking publishes every assignment at a public URL, so it is deliberately
 * a separate, explicit action rather than a date the site guesses at.
 */
export async function reveal(options: { undo?: boolean } = {}): Promise<{
  revealedAt: string | null;
  message: string;
}> {
  const undo = options.undo ?? false;

  const event = await readEvent();
  if (event.participants.length === 0) {
    throw new Error("No draw exists yet — nothing to reveal.");
  }

  event.revealedAt = undo ? null : new Date().toISOString();
  await writeEvent(event);

  const message = undo
    ? "Locked. /reveal now 404s."
    : `Unlocked at ${event.revealedAt}. /reveal is now public.`;

  return {
    revealedAt: event.revealedAt,
    message,
  };
}

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
