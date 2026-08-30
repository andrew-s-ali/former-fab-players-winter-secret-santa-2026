import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { soloPick, type CommanderPick } from "./pairing";
import type { ParticipantInput } from "./signup";
import type { Participant } from "./participants";
import { testCommander, testSelfCards } from "@/test-support/cards";

vi.mock("#db/index", async () => await import("@/test-support/database"));

const { closeDatabase, freshDatabase } = await import("@/test-support/database");
const {
  deleteAllSignups,
  deleteSignups,
  readSignupIdentities,
  recordSignup,
} = await import("./signups");
const { deleteAllDeckBuilds, deleteDeckBuilds, readDeckBuild, saveNotes } =
  await import("./deck-builds");
const { deleteAllSelections, readAllSelections, saveSelection } = await import(
  "./card-selections"
);

const cards: [CommanderPick, CommanderPick] = [
  soloPick(testCommander("one", { name: "One" })),
  soloPick(testCommander("two", { name: "Two" })),
];

function input(name: string): ParticipantInput {
  return {
    name,
    email: `${name.toLowerCase()}@example.com`,
    colorVeto: null,
    themeVeto: null,
    themeWish: null,
    selfCards: [
      { commander: "One", partner: null },
      { commander: "Two", partner: null },
    ],
  };
}

/** Ada → Brin → Cleo → Dara → Ada. */
const people: Participant[] = ["ada", "brin", "cleo", "dara"].map((id, index, all) => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  email: `${id}@example.com`,
  recipientId: all[(index + 1) % all.length],
  token: `token-${id}`,
  colorVeto: null,
  themeVeto: null,
  themeWish: null,
  selfCards: testSelfCards(id),
}));

const by = (id: string) => people.find((person) => person.id === id)!;

beforeEach(async () => {
  await freshDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

describe("erasing one person, against a real database", () => {
  it("hands back the row id alongside the name, which is what deletion needs", async () => {
    const { id } = await recordSignup(input("Ada"), cards);

    const [row] = await readSignupIdentities();
    expect(row).toMatchObject({ id, name: "Ada", email: "ada@example.com" });
  });

  it("deletes only the named rows", async () => {
    const ada = await recordSignup(input("Ada"), cards);
    await recordSignup(input("Brin"), cards);

    expect(await deleteSignups([ada.id])).toBe(1);

    const left = await readSignupIdentities();
    expect(left.map((row) => row.name)).toEqual(["Brin"]);
  });

  it("takes the private notes with the builder", async () => {
    await saveNotes("ada", "Brin hates artifacts, ask their partner");
    await saveNotes("brin", "keep");

    expect(await deleteDeckBuilds(["ada"])).toBe(1);

    expect(await readDeckBuild("ada")).toEqual({ decklistUrl: null, notes: "" });
    expect((await readDeckBuild("brin")).notes).toBe("keep");
  });

  it("is a no-op on an empty list rather than deleting everything", async () => {
    // The obvious way to get this wrong is an unfiltered DELETE when the id
    // list happens to be empty — which for someone who never signed up would
    // quietly wipe the event.
    await recordSignup(input("Ada"), cards);
    await saveNotes("ada", "notes");

    expect(await deleteSignups([])).toBe(0);
    expect(await deleteDeckBuilds([])).toBe(0);

    expect(await readSignupIdentities()).toHaveLength(1);
    expect((await readDeckBuild("ada")).notes).toBe("notes");
  });
});

describe("erasing the whole event, against a real database", () => {
  it("empties every table, including rows belonging to nobody in the event", async () => {
    await recordSignup(input("Ada"), cards);
    await recordSignup(input("Withdrew Early"), cards);
    await saveNotes("ada", "notes");
    await saveNotes("someone-who-left", "stale");
    await saveSelection({
      selector: by("ada"),
      recipient: by("brin"),
      participants: people,
      card: soloPick(testCommander("pick", { name: "Pick" })),
    });

    expect(await deleteAllSignups()).toBe(2);
    expect(await deleteAllDeckBuilds()).toBe(2);
    expect(await deleteAllSelections()).toEqual({ selections: 1, secretSets: 0 });

    expect(await readSignupIdentities()).toEqual([]);
    expect(await readAllSelections(people)).toEqual([]);
    expect((await readDeckBuild("ada")).notes).toBe("");
  });

  it("reports zero on an already-empty database instead of failing", async () => {
    // Re-running an erasure after a partial failure is exactly what somebody
    // would do.
    expect(await deleteAllSignups()).toBe(0);
    expect(await deleteAllDeckBuilds()).toBe(0);
    expect(await deleteAllSelections()).toEqual({ selections: 0, secretSets: 0 });
  });
});
