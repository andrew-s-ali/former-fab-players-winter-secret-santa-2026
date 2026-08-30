import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventData } from "./participants";
import {
  deleteEventData,
  describeTarget,
  readEvent,
  readNudgeState,
  writeEvent,
  writeNudgeState,
} from "./store";
import { testSelfCards } from "@/test-support/cards";

const originalEnv = { ...process.env };

function clearNetlifyEnv() {
  delete process.env.NETLIFY_SITE_ID;
  delete process.env.NETLIFY_AUTH_TOKEN;
  delete process.env.NETLIFY_BLOBS_CONTEXT;
  delete process.env.CONTEXT;
}

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("readEvent (local file)", () => {
  beforeEach(() => {
    clearNetlifyEnv();
  });

  it("reads the local file when Netlify credentials are absent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "santa-"));
    const path = join(dir, "event.json");
    await writeFile(
      path,
      JSON.stringify({
        participants: [
          {
            id: "p1",
            name: "Ada",
            email: "someone@example.com",
            recipientId: "p2",
            token: "tok",
            selfCards: testSelfCards(),
            colorVeto: "R",
            themeVeto: "mill",
            themeWish: "elves",
            discord: null,
          },
        ],
      })
    );
    process.env.EVENT_DATA_PATH = path;

    const event = await readEvent();

    expect(event.participants).toHaveLength(1);
    expect(event.participants[0].name).toBe("Ada");
  });

  it("returns an empty event when the local file is missing", async () => {
    process.env.EVENT_DATA_PATH = join(tmpdir(), "does-not-exist-santa.json");

    expect(await readEvent()).toEqual({ participants: [], revealedAt: null });
  });
});

describe("resolveMode misconfiguration", () => {
  beforeEach(() => {
    clearNetlifyEnv();
  });

  it("fails loudly when only NETLIFY_SITE_ID is set", async () => {
    process.env.NETLIFY_SITE_ID = "site-123";
    process.env.EVENT_DATA_PATH = join(tmpdir(), "does-not-exist-santa.json");

    await expect(readEvent()).rejects.toThrow(
      /NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN must be set together/
    );
  });

  it("fails loudly when only NETLIFY_AUTH_TOKEN is set", async () => {
    process.env.NETLIFY_AUTH_TOKEN = "token-abc";
    process.env.EVENT_DATA_PATH = join(tmpdir(), "does-not-exist-santa.json");

    await expect(readEvent()).rejects.toThrow(
      /NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN must be set together/
    );
  });
});

describe("writeEvent (local file) backup on overwrite", () => {
  beforeEach(() => {
    clearNetlifyEnv();
  });

  it("snapshots the existing event before overwriting a non-empty one", async () => {
    const dir = await mkdtemp(join(tmpdir(), "santa-backup-"));
    const path = join(dir, "event.json");
    const original: EventData = {
      participants: [
        {
          id: "p1",
          name: "Ada",
          email: "someone@example.com",
          recipientId: "p2",
          token: "tok-1",
          selfCards: testSelfCards(),
          colorVeto: null,
          themeVeto: null,
          themeWish: null,
          discord: null,
        },
      ],
      revealedAt: null,
    };
    await writeFile(path, JSON.stringify(original));
    process.env.EVENT_DATA_PATH = path;

    const replacement: EventData = {
      participants: [
        {
          id: "p3",
          name: "Bob",
          email: "someone@example.com",
          recipientId: "p4",
          token: "tok-2",
          selfCards: testSelfCards(),
          colorVeto: null,
          themeVeto: null,
          themeWish: null,
          discord: null,
        },
      ],
      revealedAt: null,
    };
    await writeEvent(replacement);

    const current = JSON.parse(await readFile(path, "utf8"));
    expect(current).toEqual(replacement);

    const entries = await readdir(dir);
    const backupFile = entries.find(
      (name) => name.startsWith("event.backup-") && name.endsWith(".json")
    );
    expect(backupFile).toBeDefined();

    const backup = JSON.parse(await readFile(join(dir, backupFile!), "utf8"));
    expect(backup).toEqual(original);
  });

  it("does not create a backup when there was no prior event", async () => {
    const dir = await mkdtemp(join(tmpdir(), "santa-backup-empty-"));
    const path = join(dir, "event.json");
    process.env.EVENT_DATA_PATH = path;

    await writeEvent({ participants: [], revealedAt: null });

    const entries = await readdir(dir);
    const backupFile = entries.find((name) => name.startsWith("event.backup-"));
    expect(backupFile).toBeUndefined();
  });
});

const blobs = vi.hoisted(() => ({
  get: vi.fn(),
  setJSON: vi.fn(),
  getStore: vi.fn(),
  getDeployStore: vi.fn(),
}));

vi.mock("@netlify/blobs", () => ({
  getStore: blobs.getStore.mockReturnValue({
    get: blobs.get,
    setJSON: blobs.setJSON,
  }),
  getDeployStore: blobs.getDeployStore.mockReturnValue({
    get: blobs.get,
    setJSON: blobs.setJSON,
  }),
}));

describe("readEvent on Netlify (explicit credentials)", () => {
  beforeEach(() => {
    clearNetlifyEnv();
    process.env.NETLIFY_SITE_ID = "site-123";
    process.env.NETLIFY_AUTH_TOKEN = "token-abc";
    blobs.get.mockReset();
    blobs.setJSON.mockReset();
    blobs.getStore.mockClear();
    blobs.getDeployStore.mockClear();
  });

  it("calls getStore with an explicit siteID/token object, not a bare string", async () => {
    // Simulates older stored data that predates both revealedAt and the
    // per-participant discord field; withDefaults() must fill both in on the
    // way out, so nothing downstream ever sees `undefined` where the type
    // promises `string | null`.
    const event = { participants: [{ id: "p1", name: "Ada" }] };
    blobs.get.mockResolvedValue(event);

    await expect(readEvent()).resolves.toEqual({
      participants: [{ id: "p1", name: "Ada", discord: null }],
      revealedAt: null,
    });
    expect(blobs.getStore).toHaveBeenCalledWith({
      name: "secret-santa",
      siteID: "site-123",
      token: "token-abc",
    });
    expect(blobs.get).toHaveBeenCalledWith("event.json", { type: "json" });
  });

  it("returns an empty event when the blob does not exist yet", async () => {
    blobs.get.mockResolvedValue(null);

    await expect(readEvent()).resolves.toEqual({
      participants: [],
      revealedAt: null,
    });
  });

  it("writes the event back as JSON under the same key", async () => {
    blobs.get.mockResolvedValue(null);
    const event: EventData = { participants: [], revealedAt: null };

    await writeEvent(event);

    expect(blobs.setJSON).toHaveBeenCalledWith("event.json", event);
  });

  it("snapshots the existing blob before overwriting a non-empty one", async () => {
    const existing: EventData = {
      participants: [
        {
          id: "p1",
          name: "Ada",
          email: "someone@example.com",
          recipientId: "p2",
          token: "tok-1",
          selfCards: testSelfCards(),
          colorVeto: null,
          themeVeto: null,
          themeWish: null,
          discord: null,
        },
      ],
      revealedAt: null,
    };
    blobs.get.mockResolvedValue(existing);

    await writeEvent({ participants: [], revealedAt: null });

    expect(blobs.setJSON).toHaveBeenCalledWith(
      expect.stringMatching(/^event\.backup-.*\.json$/),
      existing
    );
    expect(blobs.setJSON).toHaveBeenCalledWith("event.json", {
      participants: [],
      revealedAt: null,
    });
  });

  it("describeTarget reports the explicit site", () => {
    expect(describeTarget()).toBe(
      "Using Netlify Blobs (site site-123, explicit credentials)"
    );
  });
});

describe("readEvent on Netlify (automatic context, production)", () => {
  beforeEach(() => {
    clearNetlifyEnv();
    process.env.NETLIFY_BLOBS_CONTEXT = "base64-context-blob";
    process.env.CONTEXT = "production";
    blobs.get.mockReset();
    blobs.setJSON.mockReset();
    blobs.getStore.mockClear();
    blobs.getDeployStore.mockClear();
  });

  it("calls getStore with a bare store name, relying on NETLIFY_BLOBS_CONTEXT", async () => {
    blobs.get.mockResolvedValue(null);

    await expect(readEvent()).resolves.toEqual({
      participants: [],
      revealedAt: null,
    });
    expect(blobs.getStore).toHaveBeenCalledWith("secret-santa");
    expect(blobs.getDeployStore).not.toHaveBeenCalled();
  });

  it("describeTarget reports the production store", () => {
    expect(describeTarget()).toBe(
      "Using Netlify Blobs (automatic Netlify runtime context, production store)"
    );
  });
});

describe("deploy-context isolation", () => {
  // getStore is scoped to the site, so it is shared by every deploy. Only
  // production may touch it: otherwise a public Deploy Preview would serve the
  // real event, and the organiser console on that preview would write to it.
  beforeEach(() => {
    clearNetlifyEnv();
    process.env.NETLIFY_BLOBS_CONTEXT = "base64-context-blob";
    blobs.get.mockReset();
    blobs.setJSON.mockReset();
    blobs.getStore.mockClear();
    blobs.getDeployStore.mockClear();
  });

  for (const context of ["deploy-preview", "branch-deploy", "dev"]) {
    it(`uses a deploy-scoped store when CONTEXT is "${context}"`, async () => {
      process.env.CONTEXT = context;
      blobs.get.mockResolvedValue(null);

      await readEvent();

      expect(blobs.getDeployStore).toHaveBeenCalledWith("secret-santa");
      expect(blobs.getStore).not.toHaveBeenCalled();
    });
  }

  it("writes from a preview go to the deploy-scoped store, never the shared one", async () => {
    process.env.CONTEXT = "deploy-preview";
    blobs.get.mockResolvedValue(null);

    await writeEvent({ participants: [], revealedAt: null });

    expect(blobs.getDeployStore).toHaveBeenCalledWith("secret-santa");
    expect(blobs.getStore).not.toHaveBeenCalled();
    expect(blobs.setJSON).toHaveBeenCalledWith("event.json", {
      participants: [],
      revealedAt: null,
    });
  });

  it("fails closed when CONTEXT is missing entirely", async () => {
    // An empty production site is loud and fixed in minutes; a preview quietly
    // writing to live event data is not. So an unknown context is not
    // production.
    blobs.get.mockResolvedValue(null);

    await readEvent();

    expect(blobs.getDeployStore).toHaveBeenCalledWith("secret-santa");
    expect(blobs.getStore).not.toHaveBeenCalled();
  });

  it("describeTarget names the context so a wrong resolution is visible", () => {
    process.env.CONTEXT = "deploy-preview";

    expect(describeTarget()).toContain("deploy-scoped store");
    expect(describeTarget()).toContain("CONTEXT=deploy-preview");
  });

  it("describeTarget says so when CONTEXT is unset", () => {
    expect(describeTarget()).toContain("CONTEXT=(unset)");
  });

  it("explicit credentials still reach the real store regardless of context", () => {
    // The operator's CLI runs with no CONTEXT at all; it must not be
    // downgraded to a deploy store.
    process.env.CONTEXT = "deploy-preview";
    process.env.NETLIFY_SITE_ID = "site-123";
    process.env.NETLIFY_AUTH_TOKEN = "token-abc";

    expect(describeTarget()).toBe(
      "Using Netlify Blobs (site site-123, explicit credentials)"
    );
  });
});

describe("deleteEventData (local file)", () => {
  beforeEach(() => {
    clearNetlifyEnv();
  });

  function eventWith(name: string): EventData {
    return {
      participants: [
        {
          id: "p1",
          name,
          email: `${name.toLowerCase()}@example.com`,
          recipientId: "p2",
          token: "tok-1",
          selfCards: testSelfCards(),
          colorVeto: null,
          themeVeto: null,
          themeWish: null,
          discord: null,
        },
      ],
      revealedAt: null,
    };
  }

  it("takes the backup snapshots as well as the live file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "santa-forget-"));
    process.env.EVENT_DATA_PATH = join(dir, "event.json");

    // Overwriting leaves a snapshot behind, and each snapshot is a complete
    // copy of the address book. This is the whole reason deleteEventData
    // exists rather than a single unlink. (How many snapshots survive is not
    // the point: `backupKey` is timestamped to the millisecond, so writes this
    // close together can land on the same name.)
    await writeEvent(eventWith("Ada"));
    await writeEvent(eventWith("Brin"));
    await writeEvent(eventWith("Cleo"));
    const before = await readdir(dir);
    expect(before.filter((name) => name.startsWith("event.backup-")).length)
      .toBeGreaterThan(0);

    const deleted = await deleteEventData();

    expect(deleted).toEqual(before.sort());
    expect(await readdir(dir)).toEqual([]);
    expect(await readEvent()).toEqual({ participants: [], revealedAt: null });
  });

  it("takes the nudge state too, because its digest names participants", async () => {
    const dir = await mkdtemp(join(tmpdir(), "santa-forget-"));
    process.env.EVENT_DATA_PATH = join(dir, "event.json");
    await writeEvent(eventWith("Ada"));
    await writeNudgeState({ digest: "ada:3", postedAt: "2026-02-10T12:00:00Z" });

    expect(await deleteEventData()).toContain("nudge.json");
    expect(await readdir(dir)).toEqual([]);
  });

  it("leaves files that are not event data alone", async () => {
    const dir = await mkdtemp(join(tmpdir(), "santa-forget-"));
    process.env.EVENT_DATA_PATH = join(dir, "event.json");
    await writeEvent(eventWith("Ada"));
    await writeFile(join(dir, "notes.txt"), "unrelated");

    await deleteEventData();

    expect(await readdir(dir)).toEqual(["notes.txt"]);
  });

  it("finds the live file even when EVENT_DATA_PATH does not name it event.json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "santa-forget-"));
    process.env.EVENT_DATA_PATH = join(dir, "custom-name.json");
    await writeEvent(eventWith("Ada"));

    expect(await deleteEventData()).toEqual(["custom-name.json"]);
    expect(await readdir(dir)).toEqual([]);
  });

  it("is a no-op, not an error, when there is nothing there", async () => {
    const dir = await mkdtemp(join(tmpdir(), "santa-forget-"));
    process.env.EVENT_DATA_PATH = join(dir, "event.json");

    expect(await deleteEventData()).toEqual([]);
  });
});

describe("nudge state (local file)", () => {
  beforeEach(() => {
    clearNetlifyEnv();
  });

  it("reads as null before anything has been posted", async () => {
    const dir = await mkdtemp(join(tmpdir(), "santa-nudge-"));
    process.env.EVENT_DATA_PATH = join(dir, "event.json");

    expect(await readNudgeState()).toBeNull();
  });

  it("round-trips, and sits beside the event file whatever it is called", async () => {
    const dir = await mkdtemp(join(tmpdir(), "santa-nudge-"));
    process.env.EVENT_DATA_PATH = join(dir, "custom-name.json");
    const state = { digest: "brin:2|cleo:1", postedAt: "2026-02-10T12:00:00Z" };

    await writeNudgeState(state);

    expect(await readNudgeState()).toEqual(state);
    expect(await readdir(dir)).toEqual(["nudge.json"]);
  });
});
