import type { Config } from "@netlify/functions";
import { runSignupReminder } from "#lib/signup-reminder-run";

/**
 * Posts sign-up reminders to Discord at a few points in the sign-up window.
 *
 * Runs daily but speaks rarely: `currentReminder` only returns a milestone on
 * the opening announcement and at ten, seven, three and one days remaining,
 * and each of those posts exactly once. Outside the window it says nothing at
 * all — a reminder to sign up for something that is not open yet, or is over,
 * is worse than silence.
 *
 * Scheduled functions only fire on **published production deploys**, so this
 * cannot post from a Deploy Preview. There is no local schedule either; use
 * `npm run remind -- --dry-run`, which runs the same code path.
 */
const signupReminder = async () => {
  const result = await runSignupReminder();

  console.log(
    `${result.reminder ? `milestone ${result.reminder.key}` : "no milestone"}; ` +
      `${result.posted ? "posted." : "did not post."} ${result.reason}`
  );
};

export default signupReminder;

export const config: Config = {
  // 12:00 UTC — 8am US Eastern in September (EDT, UTC-4), the hour the
  // organiser wanted the opening announcement to land. Cron is always UTC, so
  // this drifts to 7am Eastern once daylight saving ends; the sign-up window
  // closes in September, well before that.
  schedule: "0 12 * * *",
};
