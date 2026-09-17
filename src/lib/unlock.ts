import { formatExchangeDay, theAsk } from "#lib/announce";
import { roleMention } from "#lib/discord";
import { SITE_URL } from "#lib/event";
import { BUDGET_USD } from "#lib/rules";

/**
 * Telling the group that the last pick is in and the assignments are open.
 *
 * The one message in this event that has to arrive promptly: until it does,
 * everybody's link still says "locked" in their memory, and nobody goes back to
 * look. So it is said the moment the last pick is saved, with the nightly
 * nudge as the fallback if that attempt failed — and `UnlockState` is what
 * stops the second one repeating the first.
 *
 * Pure. Like the nudge, it says nothing about who draws whom: everybody's link
 * opened at once, which is all this message claims.
 */

/** When the group was told, so it is only told once. */
export type UnlockState = { announcedAt: string };

/**
 * The Discord message.
 *
 * Deliberately does not link a private page — there is no such thing as a
 * link that is right for everybody. It points at the email each person
 * already has instead.
 */
export function unlockMessage({
  participantCount,
  exchangeAt,
}: {
  participantCount: number;
  exchangeAt: string | null;
}): string {
  const lines = [
    "🔓 **Assignments are open!** 🎁",
    "",
    `${roleMention()} — all ${participantCount * (participantCount - 1)} ` +
      "commander picks are in, so every private link has unlocked.",
    "",
    "**Open your private link** — the one you were emailed — to see who " +
      "you are building for and the three commanders you get to choose " +
      "between. Nobody else can see that page, so keep it to yourself.",
    "",
    "**Then confirm which commander you are building** on that same page, " +
      "and save your decklist there when you have one. Both are shown on " +
      "reveal day.",
    "",
    theAsk(),
  ];
  if (exchangeAt) {
    lines.push("", `Decks are due at the exchange: **${formatExchangeDay(exchangeAt)}**.`);
  }
  return lines.join("\n");
}

export const UNLOCK_EMAIL_SUBJECT = "Your private link is unlocked";

/**
 * The email, sent as a reply on each person's original link email.
 *
 * A reply rather than a fresh message so the link sits right there in the
 * thread: nothing here has to handle anybody's token again.
 */
export function unlockEmail({
  name,
  exchangeAt,
}: {
  name: string;
  exchangeAt: string | null;
}): string {
  return [
    `Hi ${name},`,
    "",
    "Every commander pick is in, so your private link (in the email below) " +
      "is now unlocked.",
    "",
    "Open it to see who you are building for and the three commanders you " +
      "can choose between. Once you have decided, confirm which one you are " +
      "building on that page, and save your decklist there when it is ready.",
    "",
    "The deck is a 100-card Commander deck (commander included) within the " +
      `$${BUDGET_USD} budget` +
      (exchangeAt ? `, due at the exchange on ${formatExchangeDay(exchangeAt)}.` : "."),
    "",
    "Please keep the link and your recipient to yourself.",
    "",
    `If you cannot find the link, just reply and I will resend it. ` +
      `The site itself is ${SITE_URL}.`,
    "",
    "Andrew",
  ].join("\n");
}
