import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventData } from "#lib/participants";
import { testSelfCards } from "@/test-support/cards";

vi.mock("#db/index", async () => await import("@/test-support/database"));

/**
 * The event store, in memory.
 *
 * Mocked rather than pointed at a temp file because the real one resolves its
 * target from NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN — the same two variables
 * the Forms API needs — so a test cannot have both a local file and a working
 * Forms client. That coupling is correct in production (the organiser sets
 * both and gets the real store and the real form), and it leaves nothing
 * untested here: `deleteEventData`, backups included, is covered in
 * `src/lib/store.test.ts`.
 */
let stored: EventData | null = null;
let deletedEventKeys: string[] = [];

/**
 * Makes the deck-build deletion fail on demand, so the ordering invariant can
 * be tested rather than only commented on.
 */
let deckBuildsFail = false;

vi.mock("#lib/deck-builds", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#lib/deck-builds")>();
  const failing = <T extends unknown[], R>(real: (...args: T) => Promise<R>) =>
    async (...args: T): Promise<R> => {
      if (deckBuildsFail) {
        throw new Error("database went away");
      }
      return real(...args);
    };
  return {
    ...actual,
    deleteDeckBuilds: failing(actual.deleteDeckBuilds),
    deleteAllDeckBuilds: failing(actual.deleteAllDeckBuilds),
  };
});

vi.mock("#lib/store", () => ({
  describeTarget: () => "Using a test store",
  readEvent: async () =>
    stored ?? { participants: [], revealedAt: null },
  writeEvent: async (event: EventData) => {
    stored = structuredClone(event);
  },
  deleteEventData: async () => {
    const keys = stored ? ["event.json", "event.backup-1.json"] : [];
    stored = null;
    deletedEventKeys = keys;
    return keys;
  },
}));

const { closeDatabase, freshDatabase } = await import("@/test-support/database");
const { recordSignup, readSignupIdentities } = await import("#lib/signups");
const { readDeckBuild, saveNotes } = await import("#lib/deck-builds");
const { main } = await import("./forget");

const originalEnv = { ...process.env };
const cards = testSelfCards("pool");

/** Ada → Brin → Ada. */
function drawnEvent(): EventData {
  return {
    revealedAt: null,
    participants: ["ada", "brin"].map((id, index, all) => ({
      id,
      name: id[0].toUpperCase() + id.slice(1),
      email: `${id}@example.com`,
      recipientId: all[(index + 1) % all.length],
      token: `token-${id}`,
      colorVeto: "R" as const,
      themeVeto: "mill",
      themeWish: "elves",
      discord: null,
      selfCards: testSelfCards(id),
    })),
  };
}

/**
 * Stands in for the Netlify Forms API.
 *
 * Records the DELETEs so the tests can assert on what was actually removed
 * rather than on the plan that said it would be.
 */
function stubForms(submissions: { id: string; name: string }[]) {
  const deleted: string[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string }) => {
      if (init?.method === "DELETE") {
        deleted.push(url.split("/").pop()!);
        return new Response(null, { status: 204 });
      }
      if (url.includes("/forms") && url.includes("/sites/")) {
        return Response.json([{ id: "form-1", name: "santa-signup" }]);
      }
      if (url.includes("/submissions")) {
        // The spam list is fetched separately and is empty here.
        return Response.json(
          url.includes("state=spam")
            ? []
            : submissions.map((submission) => ({
                id: submission.id,
                created_at: "2026-01-01T00:00:00Z",
                data: { name: submission.name, email: `${submission.name}@example.com` },
              }))
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    })
  );

  return deleted;
}

let log: string[];

beforeEach(async () => {
  await freshDatabase();
  stored = null;
  deletedEventKeys = [];
  deckBuildsFail = false;

  process.env = { ...originalEnv };
  process.env.NETLIFY_SITE_ID = "site-1";
  process.env.NETLIFY_AUTH_TOKEN = "token-1";

  log = [];
  vi.spyOn(console, "log").mockImplementation((...args) => {
    log.push(args.join(" "));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
  process.exitCode = undefined;
});

afterAll(async () => {
  await closeDatabase();
});

const output = () => log.join("\n");

function storedEvent(): EventData {
  if (!stored) {
    throw new Error("The event was expected to still exist.");
  }
  return stored;
}

async function signup(name: string) {
  return recordSignup(
    {
      name,
      email: `${name.toLowerCase()}@example.com`,
      colorVeto: null,
      themeVeto: null,
      themeWish: null,
      selfCards: [
        { commander: cards[0].commander.name, partner: null },
        { commander: cards[1].commander.name, partner: null },
      ],
    },
    cards
  );
}

describe("npm run forget", () => {
  it("changes nothing without --yes", async () => {
    stored = drawnEvent();
    await signup("Ada");
    const deleted = stubForms([{ id: "sub-ada", name: "Ada" }]);

    await main(["Ada", "--redact"]);

    expect(output()).toContain("Re-run with --yes");
    expect(deleted).toEqual([]);
    expect(await readSignupIdentities()).toHaveLength(1);
    expect(storedEvent().participants[0].email).toBe("ada@example.com");
  });

  it("refuses to remove somebody who has already been drawn", async () => {
    stored = drawnEvent();
    await signup("Ada");
    const deleted = stubForms([{ id: "sub-ada", name: "Ada" }]);

    await main(["Ada", "--yes"]);

    expect(output()).toContain("--redact");
    expect(process.exitCode).toBe(1);
    expect(deleted).toEqual([]);
    expect(await readSignupIdentities()).toHaveLength(1);
  });

  it("redacts a drawn participant and leaves the ring working", async () => {
    stored = drawnEvent();
    await signup("Ada");
    await signup("Brin");
    await saveNotes("ada", "Brin hates artifacts");
    await saveNotes("brin", "keep this");
    const deleted = stubForms([
      { id: "sub-ada", name: "Ada" },
      { id: "sub-brin", name: "Brin" },
    ]);

    await main(["Ada", "--redact", "--yes"]);

    const event = storedEvent();
    const ada = event.participants.find((p) => p.name === "Ada")!;
    expect(ada.email).toBe("");
    expect(ada.themeVeto).toBeNull();
    expect(ada.themeWish).toBeNull();
    // The cycle and the private links are untouched, so nobody else's page
    // breaks and no link already sent stops working.
    expect(ada.token).toBe("token-ada");
    expect(ada.recipientId).toBe("brin");
    expect(event.participants.find((p) => p.name === "Brin")!.email).toBe(
      "brin@example.com"
    );

    expect(deleted).toEqual(["sub-ada"]);
    expect((await readSignupIdentities()).map((row) => row.name)).toEqual(["Brin"]);
    expect((await readDeckBuild("ada")).notes).toBe("");
    expect((await readDeckBuild("brin")).notes).toBe("keep this");
  });

  it("removes a sign-up outright when no draw has run", async () => {
    await signup("Ada");
    await signup("Brin");
    const deleted = stubForms([
      { id: "sub-ada", name: "Ada" },
      { id: "sub-brin", name: "Brin" },
    ]);

    await main(["Ada", "--yes"]);

    expect(deleted).toEqual(["sub-ada"]);
    expect((await readSignupIdentities()).map((row) => row.name)).toEqual(["Brin"]);
  });

  it("wipes everything with --everyone", async () => {
    stored = drawnEvent();
    await signup("Ada");
    await saveNotes("ada", "notes");
    const deleted = stubForms([{ id: "sub-ada", name: "Ada" }]);

    await main(["--everyone", "--yes"]);

    expect(stored).toBeNull();
    // The snapshots go with it — they are complete copies of the address book.
    expect(deletedEventKeys).toContain("event.backup-1.json");
    expect(deleted).toEqual(["sub-ada"]);
    expect(await readSignupIdentities()).toEqual([]);
    expect((await readDeckBuild("ada")).notes).toBe("");
    expect(output()).toContain("Done.");
  });

  it("warns when Netlify Forms could not be checked", async () => {
    delete process.env.NETLIFY_SITE_ID;
    delete process.env.NETLIFY_AUTH_TOKEN;
    await signup("Ada");

    await main(["Ada"]);

    expect(output()).toContain("Netlify Forms was NOT checked");
    expect(output()).toContain("santa-signup");
  });

  it("keeps event.json until last, so a failure part-way can be re-run", async () => {
    // event.json is the only thing mapping a random participant id back to a
    // person. If it went first and a later step failed, the rows it was meant
    // to reach could no longer be identified and re-running would not help.
    stored = drawnEvent();
    await signup("Ada");
    await saveNotes("ada", "notes");
    stubForms([{ id: "sub-ada", name: "Ada" }]);
    deckBuildsFail = true;

    await expect(main(["--everyone", "--yes"])).rejects.toThrow(/database went away/);

    expect(stored).not.toBeNull();
    expect(stored!.participants.map((p) => p.name)).toEqual(["Ada", "Brin"]);

    // And re-running once the database is back finishes the job.
    deckBuildsFail = false;
    await main(["--everyone", "--yes"]);
    expect(stored).toBeNull();
    expect((await readDeckBuild("ada")).notes).toBe("");
  });

  it("insists on exactly one name", async () => {
    await expect(main(["Ada", "Brin", "--yes"])).rejects.toThrow(/one person at a time/);
    await expect(main(["--yes"])).rejects.toThrow(/Name somebody/);
  });
});
