import type { ExchangeVote } from "#lib/admin";
import { roleMention } from "#lib/discord";
import { EVENT_TIME_ZONE, instantOf } from "#lib/launch";
import { BUDGET_USD } from "#lib/rules";

/**
 * Everything this event says to the channel about the exchange *date*.
 *
 * One module for all five stages — the announcement, the fortnightly nudge,
 * two weeks, one week, and the night before — because they are the same facts
 * at rising volume, and keeping them together is what stops the deadline being
 * stated three different ways in three different files.
 *
 * Pure. The wording is read in a test rather than in a channel full of
 * friends, and `exchange-reminder.ts` decides which one is due.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type ExchangeMessageKind =
  | "announcement"
  | "fortnight"
  | "two-weeks"
  | "one-week"
  | "eve";

/**
 * "Saturday 12 December 2026", in the group's own zone.
 *
 * The weekday earns its words: "keep the day free" lands differently when
 * people can see it is a Saturday. Formatted in `EVENT_TIME_ZONE` rather than
 * UTC because the weekday is the part a zone can get wrong.
 */
export function formatExchangeDay(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: EVENT_TIME_ZONE,
  }).format(new Date(instantOf(value)));
}

/** Whole days from now until the exchange; never negative. */
export function daysUntilExchange(now: Date, exchangeAt: string): number {
  return Math.max(0, Math.ceil((instantOf(exchangeAt) - now.getTime()) / DAY_MS));
}

/**
 * How the vote is described, or null when there is nothing true to say.
 *
 * A date announced with the count behind it reads as the group's decision
 * rather than the organiser's, which is why the ranking was collected at
 * sign-up at all. Omitted entirely when the tally is missing or nobody
 * answered: a claim about a vote has to be one.
 */
export function describeVote(vote: ExchangeVote | null, winner: string): string | null {
  if (!vote || vote.answered === 0) {
    return null;
  }
  const tally = vote.tallies.find((entry) => entry.date === winner);
  if (!tally) {
    return null;
  }
  return (
    "You all ranked the three candidates when you signed up, and this one " +
    `came out on top — ${tally.firsts} of ${vote.answered} first choices.`
  );
}

export type ExchangeMessageInput = {
  kind: ExchangeMessageKind;
  exchangeAt: string;
  now: Date;
  /** Only used by the announcement; null elsewhere. */
  vote?: ExchangeVote | null;
  /** Picks still outstanding across the group, or null if unknown. */
  picksOutstanding: number | null;
  /** Builders who have not said what they are building, or null if unknown. */
  undecided?: number | null;
};

/** What everybody needs to have in hand on the day, in one line. */
export function theAsk(): string {
  return (
    `**What you need:** a finished **100-card Commander deck**, built around ` +
    `one of the three commanders on your private link, inside the **$${BUDGET_USD}** ` +
    `budget. The 100 includes your commander — and both halves if you were ` +
    `given a pair.`
  );
}

/**
 * Where the group has got to, and what to do about it on your own link.
 *
 * Always two things: how far along everybody is, and then the ask. The ask
 * used to be swallowed whenever picks were outstanding — the message said
 * "assignments are locked" and stopped, so the one instruction that outlives
 * the locked phase was missing from exactly the message most people would read
 * first.
 *
 * Told at every stage rather than only in the announcement: somebody reading
 * the two-week warning for the first time needs the same instructions as
 * somebody who read the first one.
 */
function whereThingsStand(
  picksOutstanding: number | null,
  undecided: number | null | undefined
): string[] {
  const locked = picksOutstanding !== null && picksOutstanding > 0;
  const lines: string[] = [];

  if (locked) {
    lines.push(
      `Assignments are still locked — ${picksOutstanding} ` +
        `${picksOutstanding === 1 ? "pick is" : "picks are"} outstanding, and ` +
        "everybody's opens the moment the last one lands. Nobody can start " +
        "building before that, so the sooner they are in, the more of " +
        "December you get."
    );
  } else if (undecided !== null && undecided !== undefined && undecided > 0) {
    lines.push(
      undecided === 1
        ? "One of you has not yet confirmed which commander they are building."
        : `${undecided} of you have not yet confirmed which commander you are building.`
    );
  }

  lines.push(
    `**Please confirm which commander you are building** on your private ` +
      `link${locked ? ", once yours opens" : ""} — say which of the three it ` +
      "is, and save your decklist there while you are at it. Both turn up on " +
      "the reveal-day page, so that is how everyone sees what you made."
  );

  // Blank lines between, not just newlines: Discord treats a single newline as
  // a line break, which runs two separate points together into one block.
  return lines.flatMap((line, index) => (index === 0 ? [line] : ["", line]));
}

/**
 * The message for one stage.
 *
 * Every stage names the day and the days remaining, because the one thing a
 * reminder must not do is make somebody go and look it up.
 */
export function exchangeMessage({
  kind,
  exchangeAt,
  now,
  vote = null,
  picksOutstanding,
  undecided = null,
}: ExchangeMessageInput): string {
  const day = formatExchangeDay(exchangeAt);
  const days = daysUntilExchange(now, exchangeAt);
  const countdown = `**${days} ${days === 1 ? "day" : "days"}** from today`;
  const standing = whereThingsStand(picksOutstanding, undecided);

  if (kind === "eve") {
    return [
      `🎄 **Tomorrow: ${day}** 🎁`,
      "",
      `${roleMention()} — that is the Winter Secret Santa exchange, tomorrow.`,
      "",
      "Bring the deck you built, and whatever you are keeping it in. " +
        "Everything else — who had who, the three cards each of you chose " +
        "between, and what you each built — gets revealed on the day.",
      "",
      "Looking forward to seeing what everybody made.",
    ].join("\n");
  }

  if (kind === "one-week") {
    return [
      `⏳ **One week to go — ${day}** 🎁`,
      "",
      `${roleMention()} — the exchange is a week away.`,
      "",
      "If anything is still missing from your deck, this is the week to " +
        "order it. Shipping is the thing that catches people out, not " +
        "deckbuilding.",
      "",
      theAsk(),
      "",
      ...standing,
      "",
      `${countdown}.`,
    ].join("\n");
  }

  if (kind === "two-weeks") {
    return [
      `📦 **Two weeks to go — ${day}** 🎁`,
      "",
      `${roleMention()} — two weeks until the exchange.`,
      "",
      "Now is the point to have your list finished and anything you still " +
        "need on order, so a slow delivery cannot cost you the day.",
      "",
      theAsk(),
      "",
      ...standing,
      "",
      `${countdown}.`,
    ].join("\n");
  }

  if (kind === "fortnight") {
    return [
      `🎁 **Winter Secret Santa — ${day}**`,
      "",
      `${roleMention()} — keeping the date in front of you: the exchange is ` +
        `${day}, ${countdown}.`,
      "",
      theAsk(),
      "",
      ...standing,
    ].join("\n");
  }

  const voted = describeVote(vote, exchangeAt.slice(0, 10));
  return [
    `🎄 **The date is set: ${day}** 🎁`,
    "",
    `${roleMention()} — the Winter Secret Santa exchange has a day.`,
    ...(voted ? ["", voted] : []),
    "",
    "**Please keep the day free.** This is when we swap decks, and the whole " +
      "thing only works with everybody in the room.",
    "",
    theAsk(),
    "",
    ...standing,
    "",
    `That is ${countdown}.`,
  ].join("\n");
}
