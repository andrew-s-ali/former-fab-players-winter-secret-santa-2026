import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedSelection } from "./card-pool";
import type { NudgeState } from "./nudge";
import type { EventData, Participant } from "./participants";
import { testPick, testSelfCards } from "@/test-support/cards";

const VALID =
  "https://discord.com/api/webhooks/123456789012345678/abcDEF-ghi_JKL123";

let event: EventData;
let rows: SavedSelection[];
let nudgeState: NudgeState | null;

vi.mock("#lib/store", () => ({
  readEvent: async () => event,
  readNudgeState: async () => nudgeState,
  writeNudgeState: async (state: NudgeState) => {
    nudgeState = state;
  },
}));

vi.mock("#lib/card-selections", () => ({
  readAllSelections: async () => rows,
}));

const { runNudge } = await import("./nudge-run");

function eventOf(names: string[]): EventData {
  const participants: Participant[] = names.map((name, index) => ({
    id: name.toLowerCase(),
    name,
    email: `${name.toLowerCase()}@example.com`,
    recipientId: names[(index + 1) % names.length].toLowerCase(),
    token: `token-${name.toLowerCase()}`,
    colorVeto: null,
    themeVeto: null,
    themeWish: null,
    discord: null,
    exchangeRanking: null,
    selfCards: testSelfCards(name.toLowerCase()),
  }));
  return { participants, revealedAt: null };
}

function allPicks(): SavedSelection[] {
  return event.participants.flatMap((selector) =>
    event.participants
      .filter((recipient) => recipient.id !== selector.id)
      .map((recipient) => ({
        selectorId: selector.id,
        recipientId: recipient.id,
        card: testPick(`${selector.id}-${recipient.id}`),
      }))
  );
}

const originalEnv = { ...process.env };

beforeEach(() => {
  event = eventOf(["Ada", "Brin", "Cleo", "Dara"]);
  rows = [];
  nudgeState = null;
  process.env = { ...originalEnv, DISCORD_WEBHOOK_URL: VALID };
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

type Sent = { content: string; parse: string[] };

function stubDiscord(status = 204) {
  const sent: Sent[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      sent.push({ content: body.content, parse: body.allowed_mentions.parse });
      return new Response(null, { status });
    })
  );
  return sent;
}

describe("runNudge", () => {
  it("posts when people still owe picks, and remembers that it did", async () => {
    const sent = stubDiscord();

    const result = await runNudge();

    expect(result.posted).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].content).toContain("**Ada**");
    expect(nudgeState).not.toBeNull();
  });

  it("stays quiet on a second run with nothing changed", async () => {
    stubDiscord();
    await runNudge({ now: new Date("2026-02-10T12:00:00Z") });

    const sent = stubDiscord();
    const result = await runNudge({ now: new Date("2026-02-10T23:00:00Z") });

    expect(result.posted).toBe(false);
    expect(sent).toEqual([]);
  });

  it("speaks up again as soon as somebody picks", async () => {
    stubDiscord();
    await runNudge({ now: new Date("2026-02-10T12:00:00Z") });

    rows = allPicks().filter((row) => row.selectorId === "ada");
    const sent = stubDiscord();
    const result = await runNudge({ now: new Date("2026-02-10T13:00:00Z") });

    expect(result.posted).toBe(true);
    expect(sent[0].content).not.toContain("**Ada**");
  });

  it("says nothing at all once everybody has finished", async () => {
    rows = allPicks();
    const sent = stubDiscord();

    const result = await runNudge();

    expect(result.message).toBeNull();
    expect(result.posted).toBe(false);
    expect(sent).toEqual([]);
  });

  it("will not post an empty nudge even when forced", async () => {
    rows = allPicks();
    const sent = stubDiscord();

    const result = await runNudge({ force: true });

    expect(result.posted).toBe(false);
    expect(sent).toEqual([]);
  });

  it("posts inside the quiet period when explicitly asked", async () => {
    stubDiscord();
    await runNudge({ now: new Date("2026-02-10T12:00:00Z") });

    const sent = stubDiscord();
    const result = await runNudge({
      force: true,
      now: new Date("2026-02-10T13:00:00Z"),
    });

    expect(result.posted).toBe(true);
    expect(sent).toHaveLength(1);
  });

  it("works everything out and sends nothing on a dry run", async () => {
    const sent = stubDiscord();

    const result = await runNudge({ dryRun: true });

    expect(result.message).toContain("**Ada**");
    expect(result.posted).toBe(false);
    expect(sent).toEqual([]);
    expect(nudgeState).toBeNull();
  });

  it("explains a missing webhook rather than failing", async () => {
    delete process.env.DISCORD_WEBHOOK_URL;
    const sent = stubDiscord();

    const result = await runNudge();

    expect(result.posted).toBe(false);
    expect(result.reason).toContain("DISCORD_WEBHOOK_URL");
    expect(result.message).not.toBeNull();
    expect(sent).toEqual([]);
  });

  it("does not record a nudge it failed to send", async () => {
    // Recording the digest on a failure would mute the bot for the whole quiet
    // period having said nothing at all.
    stubDiscord(500);

    await expect(runNudge()).rejects.toThrow(/500/);

    expect(nudgeState).toBeNull();
  });

  it("does nothing before a draw has run", async () => {
    event = { participants: [], revealedAt: null };
    const sent = stubDiscord();

    const result = await runNudge();

    expect(result.posted).toBe(false);
    expect(sent).toEqual([]);
  });
});

describe("runNudge, how it notifies people", () => {
  it("pings the individuals who owe picks, by name tag", async () => {
    event = eventOf(["Ada", "Brin", "Cleo", "Dara"]);
    event.participants[0].discord = "185432109876543210";
    const sent = stubDiscord();

    await runNudge();

    expect(sent[0].content).toContain("<@185432109876543210>");
    // `users` is what makes an <@id> mention actually notify somebody.
    expect(sent[0].parse).toContain("users");
  });

  it("never alerts the whole channel", async () => {
    // @here belongs to the sign-up reminders, which go to everyone because
    // anyone might still join. This one is addressed to the specific people
    // holding the exchange up, and pinging the channel for it would train the
    // group to mute the bot before the messages that concern them arrive.
    const sent = stubDiscord();

    await runNudge();

    expect(sent[0].parse).toEqual(["users"]);
    expect(sent[0].parse).not.toContain("everyone");
    expect(sent[0].content).not.toContain("@here");
    expect(sent[0].content).not.toContain("@everyone");
  });
});
