import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReminderState } from "./signup-reminder";

const VALID =
  "https://discord.com/api/webhooks/123456789012345678/abcDEF-ghi_JKL123";

let state: ReminderState | null = null;
let signupNames: string[] = [];
let signupsFail = false;

vi.mock("#lib/store", () => ({
  describeTarget: () => "Using a test store",
  readReminderState: async () => state,
  writeReminderState: async (next: ReminderState) => {
    state = next;
  },
}));

vi.mock("#lib/signups", () => ({
  readSignupIdentities: async () => {
    if (signupsFail) {
      throw new Error("database went away");
    }
    return signupNames.map((name, index) => ({
      id: `s${index}`,
      name,
      email: `${name}@example.com`,
      submittedAt: "2026-09-02T00:00:00Z",
    }));
  },
}));

const { SIGNUPS_CLOSE_AT } = await import("./event");
const { runSignupReminder } = await import("./signup-reminder-run");

const originalEnv = { ...process.env };

function stubDiscord(status = 204) {
  const sent: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)).content);
      return new Response(null, { status });
    })
  );
  return sent;
}

beforeEach(() => {
  state = null;
  signupNames = ["Ada", "Brin", "Cleo"];
  signupsFail = false;
  process.env = { ...originalEnv, DISCORD_WEBHOOK_URL: VALID, URL: "https://santa.example.com" };
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** 8am Eastern on each date, which is when the cron fires. */
const OPENING = new Date("2026-09-01T12:00:00Z");
const FIVE_LEFT = new Date("2026-09-06T12:00:00Z");
const AFTER_CLOSE = new Date("2026-09-13T12:00:00Z");

describe("runSignupReminder", () => {
  it("posts the opening announcement and records it", async () => {
    const sent = stubDiscord();

    const result = await runSignupReminder({ now: OPENING });

    expect(result.posted).toBe(true);
    expect(sent[0]).toContain("@here");
    expect(state?.postedKeys).toEqual(["opening"]);
  });

  it("stays silent on a second run of the same milestone", async () => {
    stubDiscord();
    await runSignupReminder({ now: OPENING });

    const sent = stubDiscord();
    const result = await runSignupReminder({ now: new Date("2026-09-02T12:00:00Z") });

    expect(result.posted).toBe(false);
    expect(sent).toEqual([]);
  });

  it("posts the next milestone when it arrives, keeping the earlier one", async () => {
    stubDiscord();
    await runSignupReminder({ now: OPENING });

    const sent = stubDiscord();
    const result = await runSignupReminder({ now: FIVE_LEFT });

    expect(result.posted).toBe(true);
    expect(sent[0]).toContain("5 days left");
    expect(state?.postedKeys).toEqual([
      "opening",
      `days-5@${SIGNUPS_CLOSE_AT}`,
    ]);
  });

  it("says nothing at all outside the sign-up window", async () => {
    const sent = stubDiscord();

    const result = await runSignupReminder({ now: AFTER_CLOSE });

    expect(result.posted).toBe(false);
    expect(result.message).toBeNull();
    expect(sent).toEqual([]);
  });

  it("counts distinct people, not rows", async () => {
    // A resubmission to fix a typo is a second row for the same person.
    signupNames = ["Ada", "ada", "Brin"];
    const sent = stubDiscord();

    await runSignupReminder({ now: OPENING });

    expect(sent[0]).toContain("2 people have signed up");
  });

  it("still posts when the sign-up count cannot be read", async () => {
    signupsFail = true;
    const sent = stubDiscord();

    const result = await runSignupReminder({ now: OPENING });

    expect(result.posted).toBe(true);
    expect(sent[0]).toContain("@here");
    expect(sent[0]).not.toContain("signed up so far");
  });

  it("does not consume a milestone it failed to send", async () => {
    // Recording it on failure would let that milestone pass in silence.
    stubDiscord(500);

    await expect(runSignupReminder({ now: OPENING })).rejects.toThrow(/500/);

    expect(state).toBeNull();
  });

  it("explains a missing webhook rather than failing", async () => {
    delete process.env.DISCORD_WEBHOOK_URL;
    const sent = stubDiscord();

    const result = await runSignupReminder({ now: OPENING });

    expect(result.posted).toBe(false);
    expect(result.reason).toContain("DISCORD_WEBHOOK_URL");
    expect(sent).toEqual([]);
  });

  it("works everything out and sends nothing on a dry run", async () => {
    const sent = stubDiscord();

    const result = await runSignupReminder({ now: OPENING, dryRun: true });

    expect(result.message).toContain("@here");
    expect(result.posted).toBe(false);
    expect(sent).toEqual([]);
    expect(state).toBeNull();
  });

  it("can repost a spent milestone when explicitly asked", async () => {
    stubDiscord();
    await runSignupReminder({ now: OPENING });

    const sent = stubDiscord();
    const result = await runSignupReminder({ now: OPENING, force: true });

    expect(result.posted).toBe(true);
    expect(sent).toHaveLength(1);
    // Still recorded once.
    expect(state?.postedKeys).toEqual(["opening"]);
  });
});
