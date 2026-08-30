/**
 * Posting to a Discord incoming webhook.
 *
 * A webhook URL *is* the credential — there is no separate token or header, so
 * anyone holding the URL can post to that channel as the bot. Two consequences
 * shape this file: the URL comes from the environment and is never logged, and
 * the host is checked before anything is sent.
 */

/** Hosts a webhook URL is allowed to point at. */
const WEBHOOK_HOSTS = new Set([
  "discord.com",
  "discordapp.com",
  "ptb.discord.com",
  "canary.discord.com",
]);

export class DiscordError extends Error {}

/**
 * Whether this is really a Discord webhook.
 *
 * Worth checking rather than trusting the variable's name. The payload is a
 * roster of real people's names, and a typo'd or swapped `DISCORD_WEBHOOK_URL`
 * would POST it to whatever host was in there — silently, and with a 200 back
 * from anything willing to accept it. Failing on an unexpected host turns a
 * quiet disclosure into a loud configuration error.
 */
export function isWebhookUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    WEBHOOK_HOSTS.has(url.hostname) &&
    /^\/api\/webhooks\/\d+\/[\w-]+$/.test(url.pathname)
  );
}

/** The webhook URL from the environment, checked. Null when unset. */
export function webhookFromEnv(
  env: Record<string, string | undefined> = process.env
): string | null {
  const raw = env.DISCORD_WEBHOOK_URL?.trim();
  if (!raw) {
    return null;
  }
  if (!isWebhookUrl(raw)) {
    throw new DiscordError(
      "DISCORD_WEBHOOK_URL is not a Discord webhook URL. It should look like " +
        "https://discord.com/api/webhooks/<id>/<token> — copy it from Discord " +
        "under Server Settings > Integrations > Webhooks."
    );
  }
  return raw;
}

/**
 * Posts one message.
 *
 * `username` overrides the bot's display name for this message only, so the
 * webhook can be named something generic in Discord and still show up as this
 * event.
 *
 * Errors carry the status and Discord's own message, but never the URL — it is
 * the credential, and a failed post is exactly when somebody pastes the log
 * somewhere.
 */
export async function postToDiscord(
  webhookUrl: string,
  content: string,
  { username = "Secret Santa" }: { username?: string } = {}
): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      content,
      username,
      // Nothing here should ever ping a role or @everyone; the message is
      // plain names today, but this makes that true regardless of what a
      // future mention resolver puts in the text.
      allowed_mentions: { parse: ["users"] },
    }),
  });

  if (response.ok) {
    return;
  }

  if (response.status === 404) {
    throw new DiscordError(
      "Discord says that webhook does not exist (404). It was probably deleted " +
        "in Server Settings > Integrations > Webhooks — create a new one and " +
        "update DISCORD_WEBHOOK_URL."
    );
  }
  if (response.status === 429) {
    const retryAfter = await retryAfterSeconds(response);
    throw new DiscordError(
      `Discord is rate limiting the webhook (429)` +
        (retryAfter === null ? "." : `; try again in ${retryAfter}s.`)
    );
  }

  throw new DiscordError(
    `Discord rejected the message: ${response.status} ${response.statusText}` +
      `${(await detail(response)) ?? ""}`
  );
}

async function retryAfterSeconds(response: Response): Promise<number | null> {
  const header = response.headers.get("retry-after");
  if (header !== null && !Number.isNaN(Number(header))) {
    return Number(header);
  }
  try {
    const body = (await response.clone().json()) as { retry_after?: number };
    return body.retry_after ?? null;
  } catch {
    return null;
  }
}

async function detail(response: Response): Promise<string | null> {
  try {
    const body = (await response.text()).trim();
    return body ? ` — ${body.slice(0, 300)}` : null;
  } catch {
    return null;
  }
}

/**
 * How a participant is referred to in Discord.
 *
 * The distinction is not cosmetic: **only a numeric user id produces a real
 * ping.** `@gus` typed into a message is plain text — Discord highlights
 * nothing and notifies nobody. A mention has to be `<@` + the account's
 * snowflake id + `>`, which is why this is a tagged union rather than a
 * string: the two behave completely differently and the message builder has to
 * know which it has.
 */
export type DiscordRef =
  /** A user id. Renders as a real mention and notifies them. */
  | { kind: "id"; id: string }
  /** A handle. Renders as plain text and notifies nobody. */
  | { kind: "name"; name: string };

/**
 * Discord snowflakes are 64-bit ids, currently 18–19 digits. The range is
 * loose on both sides so an older or future account is not rejected for being
 * a digit off.
 */
const SNOWFLAKE = /^\d{17,20}$/;

/** Longest handle we will store. Discord's own limit is 32; display names 32. */
const MAX_NAME_LENGTH = 40;

/**
 * Reads whatever the organiser pasted into the Discord field.
 *
 * Accepts a bare id, and the two mention forms — `<@123…>` and the legacy
 * `<@!123…>` — because copying a mention out of a chat is the obvious thing to
 * try and produces those. Anything else is treated as a handle, with a leading
 * `@` stripped.
 *
 * @throws on input that cannot be either, so a typo is a visible error in the
 *   console rather than a name that silently never pings.
 */
export function parseDiscordRef(raw: string): DiscordRef {
  const trimmed = raw.trim();
  if (trimmed === "") {
    throw new DiscordError("Enter a Discord user id or handle, or `none` to clear it.");
  }

  const mention = trimmed.match(/^<@!?(\d{17,20})>$/);
  if (mention) {
    return { kind: "id", id: mention[1] };
  }
  if (SNOWFLAKE.test(trimmed)) {
    return { kind: "id", id: trimmed };
  }

  const name = trimmed.replace(/^@/, "");
  if (name === "") {
    throw new DiscordError("That is just an @ with no handle after it.");
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new DiscordError(
      `"${name.slice(0, 20)}…" is too long for a Discord handle (max ${MAX_NAME_LENGTH}).`
    );
  }
  // Angle brackets are how every Discord mention is written. Letting them
  // through would let a hand-typed value forge a role or channel mention in a
  // message this project composes.
  if (/[<>@#\n\r]/.test(name)) {
    throw new DiscordError(
      `"${name}" is not a Discord handle. For a real ping, paste the numeric ` +
        "user id instead: turn on Settings > Advanced > Developer Mode, then " +
        "right-click the person and Copy User ID."
    );
  }
  return { kind: "name", name };
}

/**
 * The stored form of a ref — a bare id, or a bare handle.
 *
 * Round-trips through `parseDiscordRef`: an id re-reads as an id, and a handle
 * that is not all digits re-reads as a handle. Kept as a plain string so the
 * event blob stays readable and needs no migration.
 */
export function formatDiscordRef(ref: DiscordRef): string {
  return ref.kind === "id" ? ref.id : ref.name;
}

/** True once this ref will actually notify somebody. */
export function willPing(stored: string | null): boolean {
  if (!stored) {
    return false;
  }
  try {
    return parseDiscordRef(stored).kind === "id";
  } catch {
    return false;
  }
}

/**
 * Escapes Discord's markdown so a name is shown as written.
 *
 * A participant called `*Gus*` would otherwise italicise itself and take the
 * surrounding bold with it. Underscores are the common real case — plenty of
 * handles contain them, and a pair mid-message turns into italics.
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/([*_~`|\\>])/g, "\\$1");
}

/**
 * How somebody is addressed in a message.
 *
 * Falls back to their bold name whenever a real ping is not available —
 * deliberately *not* to a plain `@handle`, which looks exactly like a mention
 * that failed and invites the reader to conclude the bot is broken.
 */
export function mentionFor(stored: string | null, name: string): string {
  if (stored) {
    try {
      const ref = parseDiscordRef(stored);
      if (ref.kind === "id") {
        return `<@${ref.id}>`;
      }
      return `**${escapeMarkdown(ref.name)}**`;
    } catch {
      // A value that no longer parses must not take the message down with it.
    }
  }
  return `**${escapeMarkdown(name)}**`;
}
