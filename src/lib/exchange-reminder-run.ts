import { exchangeMessage, type ExchangeMessageKind } from "#lib/announce";
import { postToDiscord, webhookFromEnv } from "#lib/discord";
import { EXCHANGE_AT } from "#lib/event";
import {
  currentExchangeReminder,
  pingsRole,
  shouldPostExchangeReminder,
  type ExchangeReminder,
} from "#lib/exchange-reminder";
import {
  readEvent,
  readExchangeReminderState,
  writeExchangeReminderState,
} from "#lib/store";

/**
 * Running an exchange reminder: work out the milestone, see where the group
 * has got to, post, and record that this one has gone.
 *
 * Same split as `signup-reminder-run.ts` and `nudge-run.ts`, for the same
 * reason: a scheduled function cannot be exercised locally, so it stays one
 * call and everything worth getting wrong sits here or in the pure module.
 */

export type ExchangeReminderResult = {
  reminder: ExchangeReminder | null;
  message: string | null;
  posted: boolean;
  reason: string;
};

/**
 * How far along the group is: picks outstanding, and builders still undecided.
 *
 * Both are best-effort. The date is the point of the message, and a database
 * blip is a poor reason to let a milestone pass in silence — so a failure here
 * returns nulls and the message simply says less.
 */
async function progress(): Promise<{
  picksOutstanding: number | null;
  undecided: number | null;
}> {
  try {
    const event = await readEvent();
    if (event.participants.length === 0) {
      return { picksOutstanding: null, undecided: null };
    }

    const [{ nudgeStatus }, { readAllSelections, readRevealedShortlists }] =
      await Promise.all([import("#lib/nudge"), import("#lib/card-selections")]);

    const rows = await readAllSelections(event.participants);
    const outstanding = nudgeStatus(event, rows).outstanding.reduce(
      (sum, entry) => sum + entry.owed,
      0
    );

    // Only meaningful once the shortlists exist, which is after the last pick.
    const shortlists = outstanding === 0
      ? await readRevealedShortlists(event.participants)
      : [];
    const undecided = outstanding === 0
      ? event.participants.length -
        shortlists.filter((entry) => entry.builtPickId !== null).length
      : null;

    return { picksOutstanding: outstanding, undecided };
  } catch (error) {
    console.warn(
      "Could not read how far the group has got " +
        `(${error instanceof Error ? error.message : String(error)}); ` +
        "posting the date without it."
    );
    return { picksOutstanding: null, undecided: null };
  }
}

/**
 * The exchange-date ranking, or null if it cannot be read.
 *
 * Best-effort like `progress`: the date is the news, and the sentence about
 * the vote is a nicety that must never be the reason nothing gets posted.
 */
async function countVote() {
  try {
    const { tallyExchangeDates } = await import("#lib/admin");
    return tallyExchangeDates(await readEvent());
  } catch (error) {
    console.warn(
      "Could not tally the exchange-date vote " +
        `(${error instanceof Error ? error.message : String(error)}); ` +
        "announcing the date without it."
    );
    return null;
  }
}

export async function runExchangeReminder({
  force = false,
  dryRun = false,
  now = new Date(),
  kind,
}: {
  force?: boolean;
  dryRun?: boolean;
  now?: Date;
  /** Overrides the schedule, for the one-off announcement. */
  kind?: ExchangeMessageKind;
} = {}): Promise<ExchangeReminderResult> {
  if (EXCHANGE_AT === null) {
    return {
      reminder: null,
      message: null,
      posted: false,
      reason: "No exchange date is set, so there is nothing to count down to.",
    };
  }

  const scheduled = currentExchangeReminder(now, EXCHANGE_AT);
  // The announcement is not on the schedule: it is said once, by hand, on the
  // day the group settles a date.
  const reminder: ExchangeReminder | null =
    kind && kind !== "announcement"
      ? { key: `${kind}@${EXCHANGE_AT}`, kind, daysLeft: scheduled?.daysLeft ?? 0 }
      : scheduled;

  if (kind === undefined && reminder === null) {
    return {
      reminder: null,
      message: null,
      posted: false,
      reason: "Nothing is due today.",
    };
  }

  const state = await readExchangeReminderState();
  const due = reminder === null || shouldPostExchangeReminder(reminder, state);
  if (!due && !force) {
    return {
      reminder,
      message: null,
      posted: false,
      reason: `The "${reminder!.key}" reminder has already been posted.`,
    };
  }

  const { picksOutstanding, undecided } = await progress();
  const message = exchangeMessage({
    kind: kind ?? reminder!.kind,
    exchangeAt: EXCHANGE_AT,
    now,
    // Only the announcement claims a vote, and only if the count is really
    // there: the later reminders are about a date everybody already knows.
    vote: kind === "announcement" ? await countVote() : null,
    picksOutstanding,
    undecided,
  });

  const label = reminder ? `"${reminder.key}"` : `"${kind}"`;
  const reason = due
    ? `${label}${reminder ? ` (${reminder.daysLeft} day(s) left)` : ""}.`
    : `Already posted ${label}, but posting again as asked.`;

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

  await postToDiscord(webhook, message, { mentionRoles: pingsRole() });
  // Recorded only after a successful post, so a failed send does not consume
  // the milestone and let it pass in silence.
  if (reminder) {
    await writeExchangeReminderState({
      postedKeys: [...(state?.postedKeys ?? []), reminder.key].filter(
        (key, index, all) => all.indexOf(key) === index
      ),
    });
  }

  return { reminder, message, posted: true, reason };
}
