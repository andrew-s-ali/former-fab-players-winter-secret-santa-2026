import type { Config } from "@netlify/functions";
import { runExchangeReminder } from "#lib/exchange-reminder-run";

/**
 * Counts the group down to the exchange itself.
 *
 * The sign-up reminder counted down to a deadline for *joining*; this counts
 * down to the day people have to turn up with a finished deck, which is a much
 * longer runway and a different rhythm. Every second Monday while December is
 * far away, then two weeks out, one week out, and the night before.
 *
 * Runs daily and says nothing most days. The milestones are keyed and the keys
 * are stored, so a day missed is said late rather than skipped, and a day run
 * twice says it once.
 *
 * Scheduled functions only fire on **published production deploys** — never on
 * Deploy Previews — so this cannot post from a preview. There is no local
 * schedule either; use `npm run remind-exchange -- --dry-run`, which runs the
 * same code path.
 */
const exchangeReminder = async () => {
  const result = await runExchangeReminder();

  // The only visibility a scheduled function has is its log.
  console.log(
    `${result.reminder ? `milestone ${result.reminder.key}` : "no milestone"}; ` +
      `${result.posted ? "posted." : "did not post."} ${result.reason}`
  );
};

export default exchangeReminder;

export const config: Config = {
  // 17:00 UTC — noon US Eastern in December (EST, UTC-5), so a reminder lands
  // in the middle of the day rather than overnight. Cron is always UTC.
  schedule: "0 17 * * *",
};
