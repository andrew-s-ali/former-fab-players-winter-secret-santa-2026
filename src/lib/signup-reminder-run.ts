import { postToDiscord, webhookFromEnv } from "#lib/discord";
import { SIGNUPS_CLOSE_AT, SIGNUPS_OPEN_AT, SITE_URL } from "#lib/event";
import {
  alertsChannel,
  currentReminder,
  reminderMessage,
  shouldPostReminder,
  type SignupReminder,
} from "#lib/signup-reminder";
import { readReminderState, writeReminderState } from "#lib/store";

/**
 * Running a sign-up reminder: work out the milestone, count the sign-ups,
 * post, and record that this one has gone.
 *
 * Same split as `nudge-run.ts`, for the same reason — a scheduled function
 * cannot be exercised locally, so it stays a single call and everything worth
 * getting wrong lives here and in the pure module beside it.
 */

export type ReminderResult = {
  reminder: SignupReminder | null;
  message: string | null;
  posted: boolean;
  reason: string;
};

/**
 * How many distinct people have signed up.
 *
 * By name, case-insensitively, because a resubmission to fix a typo is a
 * second row for the same person — and a reminder that says "9 people have
 * signed up" when there are 7 undersells nothing but is simply wrong.
 *
 * Returns null rather than throwing if the database cannot be read: the
 * deadline is the point of the message, and a database blip is a poor reason
 * to let a milestone pass in silence.
 */
async function countSignups(): Promise<number | null> {
  try {
    const { readSignupIdentities } = await import("#lib/signups");
    const rows = await readSignupIdentities();
    return new Set(rows.map((row) => row.name.trim().toLowerCase())).size;
  } catch (error) {
    console.warn(
      `Could not count sign-ups for the reminder (${
        error instanceof Error ? error.message : String(error)
      }); posting without a count.`
    );
    return null;
  }
}

export async function runSignupReminder({
  force = false,
  dryRun = false,
  now = new Date(),
}: { force?: boolean; dryRun?: boolean; now?: Date } = {}): Promise<ReminderResult> {
  const reminder = currentReminder(now, {
    opensAt: SIGNUPS_OPEN_AT,
    closesAt: SIGNUPS_CLOSE_AT,
  });

  if (reminder === null) {
    return {
      reminder: null,
      message: null,
      posted: false,
      reason: "Sign-ups are not open, or have already closed.",
    };
  }

  const state = await readReminderState();
  const due = shouldPostReminder(reminder, state);
  if (!due && !force) {
    return {
      reminder,
      message: null,
      posted: false,
      reason: `The "${reminder.key}" reminder has already been posted.`,
    };
  }

  const message = reminderMessage(reminder, {
    signupCount: await countSignups(),
    closesAt: SIGNUPS_CLOSE_AT,
    // Netlify sets URL to the site's primary address on a production deploy;
    // SITE_URL is the fallback for the CLI and dry runs, which run off-platform.
    url: process.env.URL ?? process.env.SITE_URL ?? SITE_URL,
  });

  const reason = due
    ? `Milestone "${reminder.key}" (${reminder.daysLeft} day(s) left).`
    : `Already posted "${reminder.key}", but posting again as asked.`;

  if (dryRun) {
    return { reminder, message, posted: false, reason: `Would post. ${reason}` };
  }

  const webhook = webhookFromEnv();
  if (!webhook) {
    return {
      reminder,
      message,
      posted: false,
      reason:
        "DISCORD_WEBHOOK_URL is not set, so there is nowhere to post. " +
        "Add it in Netlify under Project configuration > Environment variables " +
        "(scope: Functions).",
    };
  }

  await postToDiscord(webhook, message, { alertChannel: alertsChannel(reminder) });
  // Recorded only after a successful post, so a failed send does not consume
  // the milestone and let it pass in silence.
  await writeReminderState({
    postedKeys: [...(state?.postedKeys ?? []), reminder.key].filter(
      (key, index, all) => all.indexOf(key) === index
    ),
  });

  return { reminder, message, posted: true, reason };
}
