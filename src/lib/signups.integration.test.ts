import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { soloPick, type CommanderPick } from "./pairing";
import type { ParticipantInput } from "./signup";
import { testCommander } from "@/test-support/cards";

vi.mock("#db/index", async () => await import("@/test-support/database"));

const { closeDatabase, freshDatabase } = await import("@/test-support/database");
const { readSignups, recordSignup } = await import("./signups");

const cards: [CommanderPick, CommanderPick] = [
  soloPick(testCommander("one", { name: "One" })),
  soloPick(testCommander("two", { name: "Two" })),
];

function input(overrides: Partial<ParticipantInput> = {}): ParticipantInput {
  return {
    name: "Ada",
    email: "ada@example.com",
    colorVeto: "R",
    themeVeto: "mill",
    themeWish: "elves",
    selfCards: [
      { commander: "One", partner: null },
      { commander: "Two", partner: null },
    ],
    ...overrides,
  };
}

beforeEach(async () => {
  await freshDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

describe("sign-ups, against a real database", () => {
  it("records a submission and reads it back whole", async () => {
    const { stored } = await recordSignup(input(), cards);
    expect(stored).toBe(true);

    const [row] = await readSignups();
    expect(row.input.name).toBe("Ada");
    expect(row.input.email).toBe("ada@example.com");
    expect(row.input.colorVeto).toBe("R");
    expect(row.cards[0].commander.id).toBe("one");
    expect(row.input.selfCards).toEqual([
      { commander: "One", partner: null },
      { commander: "Two", partner: null },
    ]);
  });

  // Netlify retries a failed platform-event function, and the event carries no
  // submission id — so the payload is the only thing that can tell a retry
  // apart from a real resubmission.
  it("drops a retried delivery of the same answers", async () => {
    const first = await recordSignup(input(), cards);
    const second = await recordSignup(input(), cards);

    expect(first.stored).toBe(true);
    expect(second.stored).toBe(false);
    expect(second.id).toBe(first.id);
    expect(await readSignups()).toHaveLength(1);
  });

  it("keeps a genuine resubmission as its own row", async () => {
    await recordSignup(input(), cards);
    await recordSignup(input({ themeWish: "dragons instead" }), cards);

    const rows = await readSignups();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.input.themeWish)).toContain("dragons instead");
  });

  it("treats a changed partner as a new submission", async () => {
    await recordSignup(input(), cards);
    await recordSignup(input(), [
      {
        commander: testCommander("one", { name: "One", pairingRole: "partner" }),
        partner: testCommander("extra", { name: "Extra", pairingRole: "partner" }),
      },
      cards[1],
    ]);

    expect(await readSignups()).toHaveLength(2);
  });

  it("stores a partner pair intact", async () => {
    await recordSignup(input(), [
      {
        commander: testCommander("alena", { name: "Alena", pairingRole: "partner" }),
        partner: testCommander("halana", { name: "Halana", pairingRole: "partner" }),
      },
      cards[1],
    ]);

    const [row] = await readSignups();
    expect(row.cards[0].partner?.name).toBe("Halana");
    expect(row.input.selfCards[0]).toEqual({ commander: "Alena", partner: "Halana" });
  });

  // dedupeSignups resolves a resubmission by taking the most recent, so the
  // order this returns is load-bearing.
  it("returns rows oldest first", async () => {
    await recordSignup(input({ name: "Ada" }), cards);
    await recordSignup(input({ name: "Bob" }), cards);

    const rows = await readSignups();
    expect(rows.map((r) => r.input.name)).toEqual(["Ada", "Bob"]);
    expect(rows[0].submittedAt <= rows[1].submittedAt).toBe(true);
  });

  it("keeps a null colour veto null rather than a string", async () => {
    await recordSignup(input({ colorVeto: null, themeVeto: null, themeWish: null }), cards);

    const [row] = await readSignups();
    expect(row.input.colorVeto).toBeNull();
    expect(row.input.themeVeto).toBeNull();
    expect(row.input.themeWish).toBeNull();
  });
});
