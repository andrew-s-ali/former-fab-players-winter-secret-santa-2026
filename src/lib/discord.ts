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
