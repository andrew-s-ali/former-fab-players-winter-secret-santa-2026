import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventData } from "./participants";
import { readEvent, writeEvent } from "./store";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("readEvent (local file)", () => {
  beforeEach(() => {
    delete process.env.NETLIFY_SITE_ID;
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
            recipientId: "p2",
            token: "tok",
            colorVeto: "R",
            themeVeto: "mill",
            themeWish: "elves",
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

    expect(await readEvent()).toEqual({ participants: [] });
  });
});

const blobs = vi.hoisted(() => ({
  get: vi.fn(),
  setJSON: vi.fn(),
  getStore: vi.fn(),
}));

vi.mock("@netlify/blobs", () => ({
  getStore: blobs.getStore.mockReturnValue({
    get: blobs.get,
    setJSON: blobs.setJSON,
  }),
}));

describe("readEvent on Netlify", () => {
  beforeEach(() => {
    process.env.NETLIFY_SITE_ID = "site-123";
    blobs.get.mockReset();
    blobs.setJSON.mockReset();
    blobs.getStore.mockClear();
  });

  it("reads the event from the secret-santa store", async () => {
    const event = { participants: [{ id: "p1", name: "Ada" }] };
    blobs.get.mockResolvedValue(event);

    await expect(readEvent()).resolves.toEqual(event);
    expect(blobs.getStore).toHaveBeenCalledWith("secret-santa");
    expect(blobs.get).toHaveBeenCalledWith("event.json", { type: "json" });
  });

  it("returns an empty event when the blob does not exist yet", async () => {
    blobs.get.mockResolvedValue(null);

    await expect(readEvent()).resolves.toEqual({ participants: [] });
  });

  it("writes the event back as JSON under the same key", async () => {
    const event: EventData = { participants: [] };

    await writeEvent(event);

    expect(blobs.setJSON).toHaveBeenCalledWith("event.json", event);
  });
});
