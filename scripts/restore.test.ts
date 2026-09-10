import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventData } from "#lib/participants";
import { testSelfCards } from "@/test-support/cards";

let event: EventData;
let snapshots: Record<string, EventData>;
const written: EventData[] = [];

vi.mock("#lib/store", () => ({
  describeTarget: () => "Using a test store",
  readEvent: async () => event,
  writeEvent: async (next: EventData) => {
    written.push(next);
  },
  listBackupKeys: async () => Object.keys(snapshots).sort(),
  readBackup: async (key: string) => snapshots[key] ?? null,
}));

const { main } = await import("./restore");

function ring(names: string[], token = (name: string) => `tok-${name}`): EventData {
  return {
    participants: names.map((name, index) => ({
      id: name,
      name,
      email: `${name}@example.com`,
      recipientId: names[(index + 1) % names.length],
      token: token(name),
      colorVeto: null,
      themeVeto: null,
      themeWish: null,
      discord: null,
      exchangeRanking: null,
      selfCards: testSelfCards(name),
    })),
    revealedAt: null,
  };
}

const GOOD = "event.backup-2026-09-11T04-12-33-119Z.json";
const OLDER = "event.backup-2026-09-11T03-00-00-000Z.json";

let log: string[];

beforeEach(() => {
  event = ring(["a", "b", "c", "d"]);
  snapshots = { [GOOD]: ring(["a", "b", "c", "d"]), [OLDER]: ring(["a", "b", "c"]) };
  written.length = 0;
  log = [];
  vi.spyOn(console, "log").mockImplementation((...args) => {
    log.push(args.join(" "));
  });
  vi.spyOn(console, "warn").mockImplementation((...args) => {
    log.push(args.join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const output = () => log.join("\n");

describe("restoring a snapshot", () => {
  it("lists what is there and writes nothing", async () => {
    await main([]);

    expect(output()).toContain(GOOD);
    expect(output()).toContain(OLDER);
    expect(output()).toContain("4 participants · ring closes");
    expect(written).toHaveLength(0);
  });

  it("prints no tokens in the listing", async () => {
    await main([]);

    // The whole point of a snapshot is that it holds the private links. A
    // listing of them must not be a second place those links exist.
    expect(output()).not.toContain("tok-");
  });

  it("shows one snapshot without restoring it", async () => {
    await main([GOOD]);

    expect(output()).toContain("Nothing has been written");
    expect(written).toHaveLength(0);
  });

  it("writes only when told to", async () => {
    await main([GOOD, "--yes"]);

    expect(written).toHaveLength(1);
    expect(written[0].participants.map((p) => p.name)).toEqual(["a", "b", "c", "d"]);
  });

  it("refuses --yes with no snapshot named", async () => {
    // Otherwise the flag reads as "yes, do the thing" against a list, and the
    // thing it would do is ambiguous.
    await expect(main(["--yes"])).rejects.toThrow(/needs a snapshot/i);
    expect(written).toHaveLength(0);
  });

  it("refuses a key that is not in this store, and says why it might not be", async () => {
    await expect(main(["event.backup-2020-01-01T00-00-00-000Z.json", "--yes"])).rejects.toThrow(
      /No snapshot called/
    );
    expect(written).toHaveLength(0);
  });

  it("refuses an empty snapshot rather than erasing the event with it", async () => {
    snapshots[GOOD] = { participants: [], revealedAt: null };

    await expect(main([GOOD, "--yes"])).rejects.toThrow(/no participants/i);
    expect(written).toHaveLength(0);
  });

  it("warns about a damaged snapshot but still restores it", async () => {
    // Two disjoint pairs — four people, no ring. When the live event is
    // already gone, a broken copy of it beats nothing at all.
    snapshots[GOOD] = {
      participants: ring(["a", "b", "c", "d"]).participants.map((p, i) => ({
        ...p,
        recipientId: ["b", "a", "d", "c"][i],
      })),
      revealedAt: null,
    };

    await main([GOOD, "--yes"]);

    expect(output()).toContain("RING BROKEN");
    expect(output()).toContain("damaged");
    expect(written).toHaveLength(1);
  });

  it("refuses an option it does not recognise", async () => {
    // Same reasoning as the draw: silently dropping `--ys` would turn a
    // command typed to restore into one that only lists, or worse.
    await expect(main([GOOD, "--ys"])).rejects.toThrow(/Unrecognised option/);
    expect(written).toHaveLength(0);
  });

  it("refuses a second stray argument rather than picking one", async () => {
    await expect(main([GOOD, OLDER, "--yes"])).rejects.toThrow(/at most one snapshot/i);
    expect(written).toHaveLength(0);
  });

  it("says so plainly when there are no snapshots yet", async () => {
    snapshots = {};

    await main([]);

    expect(output()).toContain("No snapshots");
    expect(written).toHaveLength(0);
  });
});
