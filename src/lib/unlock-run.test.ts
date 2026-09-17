import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedSelection } from "./card-pool";
import type { EventData, Participant } from "./participants";
import type { UnlockState } from "./unlock";
import { testPick, testSelfCards } from "@/test-support/cards";

const VALID =
  "https://discord.com/api/webhooks/123456789012345678/abcDEF-ghi_JKL123";

let event: EventData;
let rows: SavedSelection[];
let unlockState: UnlockState | null;

vi.mock("#lib/store", () => ({
  readEvent: async () => event,
  readUnlockState: async () => unlockState,
  writeUnlockState: async (state: UnlockState) => {
    unlockState = state;
  },
}));

vi.mock("#lib/card-selections", async () => {
  const pool = await import("./card-pool");
  return {
    readAllSelections: async () => rows,
    selectionsAreReady: pool.selectionsAreReady,
  };
});

const { runUnlockAnnouncement } = await import("./unlock-run");

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
let sent: { content: string; parse: string[] }[];

beforeEach(() => {
  event = eventOf(["Ada", "Brin", "Cleo", "Dara"]);
  rows = [];
  unlockState = null;
  process.env = { ...originalEnv, DISCORD_WEBHOOK_URL: VALID };
  sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      sent.push({ content: body.content, parse: body.allowed_mentions.parse });
      return new Response(null, { status: 204 });
    })
  );
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe("runUnlockAnnouncement", () => {
  it("says nothing while a pick is outstanding", async () => {
    rows = allPicks().slice(1);
    const result = await runUnlockAnnouncement();
    expect(result).toMatchObject({ unlocked: false, posted: false });
    expect(sent).toHaveLength(0);
    expect(unlockState).toBeNull();
  });

  it("says nothing before the draw", async () => {
    event = { participants: [], revealedAt: null };
    const result = await runUnlockAnnouncement();
    expect(result.unlocked).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("posts once, with the role ping allowed, when the last pick is in", async () => {
    rows = allPicks();
    const now = new Date("2026-09-17T12:00:00Z");

    const first = await runUnlockAnnouncement({ now });
    expect(first).toMatchObject({ unlocked: true, announced: true, posted: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].parse).toContain("roles");
    expect(sent[0].content).toContain("Assignments are open");
    expect(unlockState).toEqual({ announcedAt: now.toISOString() });

    const second = await runUnlockAnnouncement();
    expect(second).toMatchObject({ announced: true, posted: false });
    expect(sent).toHaveLength(1);
  });

  it("posts again only when forced", async () => {
    rows = allPicks();
    unlockState = { announcedAt: "2026-09-17T12:00:00Z" };
    await runUnlockAnnouncement({ force: true });
    expect(sent).toHaveLength(1);
  });

  it("sends nothing and records nothing on a dry run", async () => {
    rows = allPicks();
    const result = await runUnlockAnnouncement({ dryRun: true });
    expect(result).toMatchObject({ unlocked: true, announced: false, posted: false });
    expect(result.message).toContain("Assignments are open");
    expect(sent).toHaveLength(0);
    expect(unlockState).toBeNull();
  });

  it("does not record the announcement when the post fails", async () => {
    rows = allPicks();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    await expect(runUnlockAnnouncement()).rejects.toThrow();
    expect(unlockState).toBeNull();
  });

  it("does not claim to have announced without a webhook", async () => {
    rows = allPicks();
    delete process.env.DISCORD_WEBHOOK_URL;
    const result = await runUnlockAnnouncement();
    expect(result).toMatchObject({ announced: false, posted: false });
    expect(unlockState).toBeNull();
  });
});
