import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DiscordError,
  escapeMarkdown,
  formatDiscordRef,
  isWebhookUrl,
  mentionFor,
  parseDiscordRef,
  postToDiscord,
  webhookFromEnv,
  willPing,
} from "./discord";

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

const ID = "185432109876543210";

describe("parseDiscordRef", () => {
  it("reads a bare user id", () => {
    expect(parseDiscordRef(ID)).toEqual({ kind: "id", id: ID });
    expect(parseDiscordRef(`  ${ID}  `)).toEqual({ kind: "id", id: ID });
  });

  it("reads a mention copied out of a chat", () => {
    // Both forms are what you actually get from copying a mention.
    expect(parseDiscordRef(`<@${ID}>`)).toEqual({ kind: "id", id: ID });
    expect(parseDiscordRef(`<@!${ID}>`)).toEqual({ kind: "id", id: ID });
  });

  it("reads a handle, with or without the leading @", () => {
    expect(parseDiscordRef("ada_lovelace")).toEqual({
      kind: "name",
      name: "ada_lovelace",
    });
    expect(parseDiscordRef("@ada_lovelace")).toEqual({
      kind: "name",
      name: "ada_lovelace",
    });
  });

  it("refuses input that could forge a mention", () => {
    // allowed_mentions already blocks role and @everyone pings, but a value
    // that can inject angle brackets has no business reaching the message.
    expect(() => parseDiscordRef("<@&123456789012345678>")).toThrow(
      /not a Discord handle/
    );
    expect(() => parseDiscordRef("everyone> <@&99")).toThrow(/not a Discord handle/);
  });

  it("points at Developer Mode when the input cannot ping", () => {
    // The one thing an organiser needs to know and will not guess.
    expect(() => parseDiscordRef("Ada <ada@example.com>")).toThrow(
      /Developer Mode/
    );
  });

  it("refuses empty, bare-@ and over-long input", () => {
    expect(() => parseDiscordRef("   ")).toThrow(/user id or handle/);
    expect(() => parseDiscordRef("@")).toThrow(/just an @/);
    expect(() => parseDiscordRef("a".repeat(41))).toThrow(/too long/);
  });

  it("round-trips through the stored form", () => {
    for (const raw of [ID, `<@${ID}>`, "@ada_lovelace", "ada_lovelace"]) {
      const stored = formatDiscordRef(parseDiscordRef(raw));
      expect(formatDiscordRef(parseDiscordRef(stored))).toBe(stored);
    }
    expect(formatDiscordRef(parseDiscordRef(`<@${ID}>`))).toBe(ID);
  });
});

describe("willPing", () => {
  it("is true only for a user id", () => {
    expect(willPing(ID)).toBe(true);
    expect(willPing("ada_lovelace")).toBe(false);
    expect(willPing(null)).toBe(false);
    expect(willPing("")).toBe(false);
  });

  it("does not throw on a value that no longer parses", () => {
    expect(willPing("<@&123>")).toBe(false);
  });
});

describe("mentionFor", () => {
  it("renders a real ping for an id", () => {
    expect(mentionFor(ID, "Ada")).toBe(`<@${ID}>`);
  });

  it("renders a handle as a bold name, not a fake @mention", () => {
    expect(mentionFor("ada_lovelace", "Ada")).toBe("**ada\\_lovelace**");
  });

  it("falls back to the participant's name when nothing is set", () => {
    expect(mentionFor(null, "Ada")).toBe("**Ada**");
  });

  it("survives a stored value that no longer parses", () => {
    // Never take a message down over one bad field.
    expect(mentionFor("<@&123>", "Ada")).toBe("**Ada**");
  });
});

describe("escapeMarkdown", () => {
  it("stops a name reformatting the message around it", () => {
    expect(escapeMarkdown("gus_the_third")).toBe("gus\\_the\\_third");
    expect(escapeMarkdown("*Gus*")).toBe("\\*Gus\\*");
    expect(escapeMarkdown("Ada")).toBe("Ada");
  });
});
