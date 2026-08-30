import { fileURLToPath } from "node:url";
import { runNudge } from "#lib/nudge-run";
import { describeTarget } from "#lib/store";

/**
 * Usage:
 *   npm run nudge -- --dry-run   # print what would be posted, send nothing
 *   npm run nudge                # post if there is news
 *   npm run nudge -- --force     # post even inside the quiet period
 *
 * The same code path the scheduled function runs, which is the point: a
 * scheduled function cannot be exercised locally, so this is how the message
 * gets read by a human before a cron sends it to a channel full of friends.
 */
export async function main(
  args: string[] = process.argv.slice(2)
): Promise<void> {
  console.log(describeTarget());

  const result = await runNudge({
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
  });

  console.log(
    `${result.status.picksIn} of ${result.status.picksRequired} picks are in; ` +
      `waiting on ${result.status.outstanding.length}.`
  );
  console.log(result.reason);

  if (result.message) {
    console.log("\n--- message ---");
    console.log(result.message);
    console.log("--- end ---\n");
  }

  console.log(result.posted ? "Posted to Discord." : "Nothing was sent.");
}

const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
    process.argv[1].endsWith("scripts/nudge.ts") ||
    process.argv[1].endsWith("nudge.ts"));

if (isDirectRun && process.env.NODE_ENV !== "test") {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
