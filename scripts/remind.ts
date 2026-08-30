import { fileURLToPath } from "node:url";
import { runSignupReminder } from "#lib/signup-reminder-run";
import { describeTarget } from "#lib/store";

/**
 * Usage:
 *   npm run remind -- --dry-run   # print what would be posted, send nothing
 *   npm run remind                # post if a milestone is due
 *   npm run remind -- --force     # post even if that milestone already went
 *
 * The same path the scheduled function runs. A scheduled function cannot be
 * exercised locally, so this is how the message gets read by a human before a
 * cron sends it to a channel full of friends.
 */
export async function main(
  args: string[] = process.argv.slice(2)
): Promise<void> {
  console.log(describeTarget());

  const result = await runSignupReminder({
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
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
    process.argv[1].endsWith("scripts/remind.ts") ||
    process.argv[1].endsWith("remind.ts"));

if (isDirectRun && process.env.NODE_ENV !== "test") {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
