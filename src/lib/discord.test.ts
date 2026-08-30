import { afterEach, describe, expect, it, vi } from "vitest";
import { DiscordError, isWebhookUrl, postToDiscord, webhookFromEnv } from "./discord";

const VALID =
  "https://discord.com/api/webhooks/123456789012345678/abcDEF-ghi_JKL123";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isWebhookUrl", () => {
  it("accepts the real thing, on every host Discord serves it from", () => {
    expect(isWebhookUrl(VALID)).toBe(true);
    expect(isWebhookUrl(VALID.replace("discord.com", "discordapp.com"))).toBe(true);
    expect(isWebhookUrl(VALID.replace("discord.com", "canary.discord.com"))).toBe(true);
  });

  it("rejects anything that is not one", () => {
    // The payload is a roster of real people. A typo'd variable that still
    // parsed as a URL would POST it to whatever host was in there.
    expect(isWebhookUrl("https://evil.example.com/api/webhooks/1/abc")).toBe(false);
    expect(isWebhookUrl("http://discord.com/api/webhooks/1/abc")).toBe(false);
    expect(isWebhookUrl("https://discord.com/channels/1/2")).toBe(false);
    expect(isWebhookUrl("https://discord.com/api/webhooks/notanid/abc")).toBe(false);
    expect(isWebhookUrl("not a url")).toBe(false);
    expect(isWebhookUrl("")).toBe(false);
  });
});

describe("webhookFromEnv", () => {
  it("returns null when it is simply not set", () => {
    expect(webhookFromEnv({})).toBeNull();
    expect(webhookFromEnv({ DISCORD_WEBHOOK_URL: "  " })).toBeNull();
  });

  it("throws, rather than posting anywhere, when it is set to nonsense", () => {
    expect(() =>
      webhookFromEnv({ DISCORD_WEBHOOK_URL: "https://example.com/hook" })
    ).toThrow(/not a Discord webhook URL/);
  });

  it("returns the URL when it is right", () => {
    expect(webhookFromEnv({ DISCORD_WEBHOOK_URL: ` ${VALID} ` })).toBe(VALID);
  });
});

describe("postToDiscord", () => {
  it("sends the message as JSON and does not ping roles or everyone", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) => new Response(null, { status: 204 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await postToDiscord(VALID, "hello");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(VALID);
    const body = JSON.parse(String(init.body));
    expect(body.content).toBe("hello");
    expect(body.allowed_mentions).toEqual({ parse: ["users"] });
  });

  it("explains a deleted webhook rather than reporting a bare 404", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 404 }));

    await expect(postToDiscord(VALID, "hi")).rejects.toThrow(
      /Server Settings > Integrations > Webhooks/
    );
  });

  it("reports how long to wait when rate limited", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ retry_after: 4.2 }), {
          status: 429,
          headers: { "content-type": "application/json" },
        })
    );

    await expect(postToDiscord(VALID, "hi")).rejects.toThrow(/4.2s/);
  });

  it("never puts the webhook URL in an error, since the URL is the credential", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response("something went wrong", { status: 500 })
    );

    const error = await postToDiscord(VALID, "hi").catch((e: DiscordError) => e);

    expect(error).toBeInstanceOf(DiscordError);
    expect(String(error)).not.toContain("abcDEF-ghi_JKL123");
    expect(String(error)).toContain("500");
  });
});
