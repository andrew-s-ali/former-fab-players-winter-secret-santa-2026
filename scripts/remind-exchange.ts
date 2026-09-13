import { fileURLToPath } from "node:url";
import { runExchangeReminder } from "#lib/exchange-reminder-run";
import { describeTarget } from "#lib/store";

/**
 * Usage:
 *   npm run remind-exchange -- --dry-run   # print what would go, send nothing
 *   npm run remind-exchange                # post if something is due today
 *   npm run remind-exchange -- --force     # post it again anyway
 *   npm run remind-exchange -- --announce  # the one-off "the date is set"
 *
 * The same code path the scheduled function runs, which is the point: a
 * scheduled function cannot be exercised locally, so this is how the message
 * gets read by a human before a cron sends it to a channel full of friends.
 */
export async function main(
  args: string[] = process.argv.slice(2)
): Promise<void> {
  console.log(describeTarget());

  const result = await runExchangeReminder({
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
    kind: args.includes("--announce") ? "announcement" : undefined,
  });

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
    process.argv[1].endsWith("scripts/remind-exchange.ts") ||
    process.argv[1].endsWith("remind-exchange.ts"));

if (isDirectRun && process.env.NODE_ENV !== "test") {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
