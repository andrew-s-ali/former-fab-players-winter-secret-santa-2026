import { fileURLToPath } from "node:url";
import { EXCHANGE_AT } from "#lib/event";
import { describeTarget, readEvent } from "#lib/store";
import { unlockEmail, UNLOCK_EMAIL_SUBJECT } from "#lib/unlock";
import { runUnlockAnnouncement } from "#lib/unlock-run";

/**
 * Usage:
 *   npm run unlock -- --status    # one line: LOCKED or UNLOCKED, sends nothing
 *   npm run unlock -- --dry-run   # print the Discord message and the email
 *   npm run unlock                # post to Discord, unless already announced
 *   npm run unlock -- --force     # post again even if already announced
 *
 * The site posts this itself when the last pick is saved, and the nightly
 * nudge retries it; this is the manual lever, and the thing to poll. The
 * email is printed rather than sent — the site has no mail provider, so the
 * organiser sends it (as a reply on each person's original link email).
 */
export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  const status = args.includes("--status");
  if (!status) {
    console.log(describeTarget());
  }

  const result = await runUnlockAnnouncement({
    dryRun: status || args.includes("--dry-run"),
    force: args.includes("--force"),
  });

  if (status) {
    console.log(
      `${result.unlocked ? "UNLOCKED" : "LOCKED"} ` +
        `announced=${result.announced ? "yes" : "no"}`
    );
    return;
  }

  console.log(result.reason);
  if (result.message) {
    console.log("\n--- discord ---");
    console.log(result.message);
    console.log("--- end ---");

    const event = await readEvent();
    const example = event.participants[0];
    if (example) {
      console.log(`\n--- email (reply on "Your private link"; subject if new: ${UNLOCK_EMAIL_SUBJECT}) ---`);
      console.log(unlockEmail({ name: example.name, exchangeAt: EXCHANGE_AT }));
      console.log("--- end ---");
    }
  }
  console.log(result.posted ? "\nPosted to Discord." : "\nNothing was sent.");
}

const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
    process.argv[1].endsWith("scripts/unlock.ts"));

if (isDirectRun && process.env.NODE_ENV !== "test") {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
