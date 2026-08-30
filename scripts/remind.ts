import { fileURLToPath } from "node:url";
import { runSignupReminder } from "#lib/signup-reminder-run";
import { describeTarget } from "#lib/store";

/**
 * Usage:
 *   npm run remind -- --dry-run   # print what would be posted, send nothing
 *   npm run remind                # post if a milestone is due
 *   npm run remind -- --force     # post even if that milestone already went
 *   npm run remind -- --now=2026-09-01T12:00:00Z   # pretend it is that moment
 *
 * The same path the scheduled function runs. A scheduled function cannot be
 * exercised locally, so this is how the message gets read by a human before a
 * cron sends it to a channel full of friends.
 *
 * `--now` exists because outside the sign-up window there is no milestone and
 * therefore nothing to send — not even with `--force` — which would otherwise
 * leave no way to prove the webhook works until the morning it matters.
 * Combine it with `--dry-run` to read the message, or without to post a real
 * one (point DISCORD_WEBHOOK_URL at a scratch channel first).
 */
export async function main(
  args: string[] = process.argv.slice(2)
): Promise<void> {
  console.log(describeTarget());

  const result = await runSignupReminder({
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
    now: parseNow(args),
  });

  console.log(result.reason);

  if (result.message) {
    console.log("\n--- message ---");
    console.log(result.message);
    console.log("--- end ---\n");
  }

  console.log(result.posted ? "Posted to Discord." : "Nothing was sent.");
}

/** Reads `--now=<iso>`, rejecting a value that is not a date. */
export function parseNow(args: string[]): Date | undefined {
  const flag = args.find((arg) => arg.startsWith("--now="));
  if (!flag) {
    return undefined;
  }
  const parsed = new Date(flag.slice("--now=".length));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `Could not read "${flag}". Expected something like ` +
        "--now=2026-09-01T12:00:00Z."
    );
  }
  console.log(`Pretending it is ${parsed.toISOString()}.`);
  return parsed;
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
