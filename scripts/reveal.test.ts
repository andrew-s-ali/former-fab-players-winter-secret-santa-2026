import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventData } from "#lib/participants";
import { readEvent } from "#lib/store";
import { main, reveal } from "./reveal";

const originalEnv = { ...process.env };

function sampleEvent(revealedAt: string | null = null): EventData {
  return {
    participants: [
      {
        id: "p1",
        name: "Ada",
        recipientId: "p2",
        token: "tok-ada",
        colorVeto: "R",
        themeVeto: "mill",
        themeWish: "elves",
      },
      {
        id: "p2",
        name: "Bob",
        recipientId: "p1",
        token: "tok-bob",
        colorVeto: null,
        themeVeto: null,
        themeWish: null,
      },
    ],
    revealedAt,
  };
}

describe("reveal script", () => {
  let tempDir: string;
  let eventFilePath: string;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    delete process.env.NETLIFY_SITE_ID;
    delete process.env.NETLIFY_AUTH_TOKEN;
    delete process.env.NETLIFY_BLOBS_CONTEXT;

    tempDir = await mkdtemp(join(tmpdir(), "reveal-test-"));
    eventFilePath = join(tempDir, "event.json");
    process.env.EVENT_DATA_PATH = eventFilePath;
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("no-event case", () => {
    it("throws when no event file exists", async () => {
      await expect(reveal()).rejects.toThrow(
        "No draw exists yet — nothing to reveal."
      );
    });

    it("throws when event has zero participants", async () => {
      await writeFile(
        eventFilePath,
        JSON.stringify({ participants: [], revealedAt: null })
      );

      await expect(reveal()).rejects.toThrow(
        "No draw exists yet — nothing to reveal."
      );
    });
  });

  describe("reveal case", () => {
    it("unlocks an unrevealed event by setting revealedAt to an ISO timestamp", async () => {
      const initial = sampleEvent(null);
      await writeFile(eventFilePath, JSON.stringify(initial));

      const before = new Date().toISOString();
      const result = await reveal();
      const after = new Date().toISOString();

      expect(result.revealedAt).not.toBeNull();
      expect(typeof result.revealedAt).toBe("string");
      expect(result.revealedAt! >= before).toBe(true);
      expect(result.revealedAt! <= after).toBe(true);
      expect(result.message).toBe(
        `Unlocked at ${result.revealedAt}. /reveal is now public.`
      );

      const updated = await readEvent();
      expect(updated.revealedAt).toBe(result.revealedAt);
      expect(updated.participants).toEqual(initial.participants);
    });
  });

  describe("undo case", () => {
    it("locks a revealed event by setting revealedAt back to null", async () => {
      const initial = sampleEvent("2026-12-25T12:00:00.000Z");
      await writeFile(eventFilePath, JSON.stringify(initial));

      const result = await reveal({ undo: true });

      expect(result.revealedAt).toBeNull();
      expect(result.message).toBe("Locked. /reveal now 404s.");

      const updated = await readEvent();
      expect(updated.revealedAt).toBeNull();
      expect(updated.participants).toEqual(initial.participants);
    });

    it("leaves revealedAt as null when undo is called on an already locked event", async () => {
      const initial = sampleEvent(null);
      await writeFile(eventFilePath, JSON.stringify(initial));

      const result = await reveal({ undo: true });

      expect(result.revealedAt).toBeNull();
      expect(result.message).toBe("Locked. /reveal now 404s.");

      const updated = await readEvent();
      expect(updated.revealedAt).toBeNull();
    });
  });

  describe("already revealed case", () => {
    it("updates timestamp when reveal is called on an already revealed event", async () => {
      const priorTimestamp = "2026-01-01T00:00:00.000Z";
      const initial = sampleEvent(priorTimestamp);
      await writeFile(eventFilePath, JSON.stringify(initial));

      const result = await reveal();

      expect(result.revealedAt).not.toBeNull();
      expect(result.revealedAt).not.toBe(priorTimestamp);
      expect(result.message).toBe(
        `Unlocked at ${result.revealedAt}. /reveal is now public.`
      );

      const updated = await readEvent();
      expect(updated.revealedAt).toBe(result.revealedAt);
    });
  });

  describe("main CLI runner", () => {
    it("runs reveal when invoked without --undo flag", async () => {
      const initial = sampleEvent(null);
      await writeFile(eventFilePath, JSON.stringify(initial));

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await main([]);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Using local file")
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^Unlocked at .*\. \/reveal is now public\.$/)
      );

      const updated = await readEvent();
      expect(updated.revealedAt).not.toBeNull();
    });

    it("runs undo when invoked with --undo flag", async () => {
      const initial = sampleEvent("2026-12-25T12:00:00.000Z");
      await writeFile(eventFilePath, JSON.stringify(initial));

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await main(["--undo"]);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Using local file")
      );
      expect(logSpy).toHaveBeenCalledWith("Locked. /reveal now 404s.");

      const updated = await readEvent();
      expect(updated.revealedAt).toBeNull();
    });
  });
});
