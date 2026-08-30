import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { soloPick, type CommanderPick } from "./pairing";
import type { Participant } from "./participants";
import { testCommander } from "@/test-support/cards";

vi.mock("#db/index", async () => await import("@/test-support/database"));

const { sql } = await import("drizzle-orm");
const { getDb } = await import("@/test-support/database");

const { closeDatabase, freshDatabase } = await import("@/test-support/database");
const {
  cashInSecretCard,
  getOrCreateSecretCards,
  getSelectionWorkspace,
  readAllSelections,
  removeSelection,
  saveSelection,
} = await import("./card-selections");

/** Four people in a ring, each with two distinct sign-up choices. */
const people: Participant[] = ["a", "b", "c", "d"].map((id, index, all) => ({
  id,
  name: id.toUpperCase(),
  email: `${id}@example.com`,
  recipientId: all[(index + 1) % all.length],
  token: `tok-${id}`,
  colorVeto: null,
  themeVeto: null,
  themeWish: null,
  discord: null,
  exchangeRanking: null,
  selfCards: [
    soloPick(testCommander(`${id}-own-1`)),
    soloPick(testCommander(`${id}-own-2`)),
  ],
}));

const by = (id: string) => people.find((p) => p.id === id)!;
const card = (id: string): CommanderPick => soloPick(testCommander(id));

/** Everyone picks for everyone, which is what unlocks the exchange. */
async function completeTheWorkshop() {
  for (const selector of people) {
    for (const recipient of people) {
      if (selector.id === recipient.id) continue;
      await saveSelection({
        selector,
        recipient,
        participants: people,
        card: card(`${selector.id}-for-${recipient.id}`),
      });
    }
  }
}

beforeEach(async () => {
  await freshDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

describe("card selections, against a real database", () => {
  it("starts with an empty workspace and nothing ready", async () => {
    const workspace = await getSelectionWorkspace(by("a"), people);

    expect(workspace.completedSlots).toBe(0);
    expect(workspace.totalSlots).toBe(12);
    expect(workspace.ready).toBe(false);
    expect(workspace.peerCards).toEqual({ b: null, c: null, d: null });
  });

  it("saves a pick and reads it back for that recipient only", async () => {
    await saveSelection({
      selector: by("a"),
      recipient: by("b"),
      participants: people,
      card: card("for-b"),
    });

    const workspace = await getSelectionWorkspace(by("a"), people);
    expect(workspace.peerCards.b?.commander.id).toBe("for-b");
    expect(workspace.peerCards.c).toBeNull();
    expect(workspace.completedSlots).toBe(1);
  });

  // One row per (selector, recipient): choosing again replaces rather than adds.
  it("replaces an earlier pick for the same person", async () => {
    for (const id of ["first", "second"]) {
      await saveSelection({
        selector: by("a"),
        recipient: by("b"),
        participants: people,
        card: card(id),
      });
    }

    const workspace = await getSelectionWorkspace(by("a"), people);
    expect(workspace.peerCards.b?.commander.id).toBe("second");
    expect(workspace.completedSlots).toBe(1);
  });

  it("stores a partner pair intact", async () => {
    await saveSelection({
      selector: by("a"),
      recipient: by("b"),
      participants: people,
      card: {
        commander: testCommander("alena", { pairingRole: "partner" }),
        partner: testCommander("halana", { pairingRole: "partner" }),
      },
    });

    const [row] = await readAllSelections(people);
    expect(row.card.commander.id).toBe("alena");
    expect(row.card.partner?.id).toBe("halana");
  });

  it("removes a pick", async () => {
    await saveSelection({
      selector: by("a"),
      recipient: by("b"),
      participants: people,
      card: card("x"),
    });

    await removeSelection({
      selector: by("a"),
      recipientId: "b",
      participants: people,
    });

    expect((await getSelectionWorkspace(by("a"), people)).peerCards.b).toBeNull();
  });

  // The application refuses this, but so does the database now — a self row
  // would silently add a card to somebody's own pool, and application code is
  // not the only thing that can write here.
  it("refuses a self row at the database, not just in the application", async () => {
    // Drizzle wraps the driver error as "Failed query: …", so the constraint
    // name is on the cause rather than the message.
    const insert = getDb().execute(
      sql`insert into card_selections (selector_id, recipient_id, card)
          values ('a', 'a', '{"commander":{"id":"x"},"partner":null}'::jsonb)`
    );

    await expect(insert).rejects.toThrow();
    const failure = await insert.catch((error: unknown) => error);
    expect(JSON.stringify(failure instanceof Error ? failure.cause : failure)).toMatch(
      /card_selections_not_self/
    );
  });

  it("allows one row per ordered pair and replaces on conflict", async () => {
    await saveSelection({
      selector: by("a"),
      recipient: by("b"),
      participants: people,
      card: card("one"),
    });
    await saveSelection({
      selector: by("b"),
      recipient: by("a"),
      participants: people,
      card: card("two"),
    });

    // Both directions coexist; the primary key is the pair, not the person.
    expect(await readAllSelections(people)).toHaveLength(2);
  });

  it("refuses a pick for yourself: those came from sign-up", async () => {
    await expect(
      saveSelection({
        selector: by("a"),
        recipient: by("a"),
        participants: people,
        card: card("x"),
      })
    ).rejects.toThrow(/chosen at sign-up/);

    expect(await readAllSelections(people)).toEqual([]);
  });

  it("becomes ready only once every slot is filled", async () => {
    await completeTheWorkshop();

    const workspace = await getSelectionWorkspace(by("a"), people);
    expect(workspace.completedSlots).toBe(12);
    expect(workspace.ready).toBe(true);
  });

  // The lock exists so nobody can edit a pool after the shortlists are fixed.
  it("locks every further change once ready", async () => {
    await completeTheWorkshop();

    await expect(
      saveSelection({
        selector: by("a"),
        recipient: by("b"),
        participants: people,
        card: card("too-late"),
      })
    ).rejects.toThrow(/locked/);

    await expect(
      removeSelection({
        selector: by("a"),
        recipientId: "b",
        participants: people,
      })
    ).rejects.toThrow(/locked/);
  });

  it("draws a stable four-card shortlist and hands back three", async () => {
    await completeTheWorkshop();

    const first = await getOrCreateSecretCards(by("a"), by("b"), people);
    const second = await getOrCreateSecretCards(by("a"), by("b"), people);

    expect(first?.cards).toHaveLength(3);
    // Drawn once and stored: a reload must not reshuffle it.
    expect(second?.cards.map((p) => p.commander.id)).toEqual(
      first?.cards.map((p) => p.commander.id)
    );
    expect(first?.cashInUsed).toBe(false);
  });

  it("never shows a giver their own recommendation", async () => {
    await completeTheWorkshop();

    const shortlist = await getOrCreateSecretCards(by("a"), by("b"), people);

    expect(
      shortlist?.cards.some((pick) => pick.commander.id === "a-for-b")
    ).toBe(false);
  });

  it("returns nothing while the workshop is unfinished", async () => {
    await saveSelection({
      selector: by("a"),
      recipient: by("b"),
      participants: people,
      card: card("x"),
    });

    expect(await getOrCreateSecretCards(by("a"), by("b"), people)).toBeNull();
  });

  it("swaps in the hidden fourth on the cash-in, once", async () => {
    await completeTheWorkshop();
    const before = await getOrCreateSecretCards(by("a"), by("b"), people);

    await cashInSecretCard(by("a"), 1);

    const after = await getOrCreateSecretCards(by("a"), by("b"), people);
    expect(after?.cashInUsed).toBe(true);
    expect(after?.cards).toHaveLength(3);
    // The traded card is gone and something new is in the row.
    const traded = before!.cards[1].commander.id;
    expect(after?.cards.some((pick) => pick.commander.id === traded)).toBe(false);

    await expect(cashInSecretCard(by("a"), 0)).rejects.toThrow(/already been used/);
  });

  it("refuses to trade a card that is not on the shortlist", async () => {
    await completeTheWorkshop();
    await getOrCreateSecretCards(by("a"), by("b"), people);

    await expect(cashInSecretCard(by("a"), 3)).rejects.toThrow(/one of the three/);
  });
});
