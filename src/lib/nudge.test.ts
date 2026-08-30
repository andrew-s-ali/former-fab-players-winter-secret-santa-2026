import { describe, expect, it } from "vitest";
import type { SavedSelection } from "./card-pool";
import {
  DISCORD_CONTENT_LIMIT,
  nudgeDigest,
  nudgeMessage,
  nudgeStatus,
  shouldPost,
  type NudgeState,
} from "./nudge";
import type { EventData, Participant } from "./participants";
import { testPick, testSelfCards } from "@/test-support/cards";

function eventOf(
  names: string[],
  discord: Record<string, string | null> = {}
): EventData {
  const participants: Participant[] = names.map((name, index) => ({
    id: name.toLowerCase(),
    name,
    email: `${name.toLowerCase()}@example.com`,
    recipientId: names[(index + 1) % names.length].toLowerCase(),
    token: `secret-token-${name.toLowerCase()}`,
    colorVeto: null,
    themeVeto: null,
    themeWish: null,
    discord: discord[name] ?? null,
    selfCards: testSelfCards(name.toLowerCase()),
  }));
  return { participants, revealedAt: null };
}

/** Every pick that would be owed if nobody had done anything. */
function allPicks(event: EventData): SavedSelection[] {
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

const event = eventOf(["Ada", "Brin", "Cleo", "Dara"]);

describe("nudgeStatus", () => {
  it("counts what each person still owes, not what each pool is missing", () => {
    // Ada has done one of her three; nobody else has started.
    const rows = allPicks(event).filter(
      (row) => row.selectorId === "ada" && row.recipientId === "brin"
    );

    const status = nudgeStatus(event, rows);

    expect(status.picksIn).toBe(1);
    expect(status.picksRequired).toBe(12);
    expect(status.outstanding).toEqual([
      { name: "Brin", owed: 3, discord: null },
      { name: "Cleo", owed: 3, discord: null },
      { name: "Dara", owed: 3, discord: null },
      { name: "Ada", owed: 2, discord: null },
    ]);
    expect(status.complete).toBe(false);
  });

  it("is complete when every pick is in", () => {
    const status = nudgeStatus(event, allPicks(event));

    expect(status.complete).toBe(true);
    expect(status.outstanding).toEqual([]);
    expect(status.picksIn).toBe(12);
  });

  it("is not complete for an event with nobody in it", () => {
    const status = nudgeStatus({ participants: [], revealedAt: null }, []);

    expect(status.complete).toBe(false);
    expect(status.participantCount).toBe(0);
  });

  it("ignores rows for people who are not in the event", () => {
    const rows: SavedSelection[] = [
      ...allPicks(event).filter((row) => row.selectorId === "ada"),
      // Left over from a redraw.
      { selectorId: "ghost", recipientId: "brin", card: testPick("x") },
      { selectorId: "ada", recipientId: "ghost", card: testPick("y") },
    ];

    const status = nudgeStatus(event, rows);

    // Ada is done: three real picks. The ghost row must not credit her a
    // fourth, and must not appear as somebody to chase.
    expect(status.picksIn).toBe(3);
    expect(status.outstanding.map((entry) => entry.name)).toEqual([
      "Brin",
      "Cleo",
      "Dara",
    ]);
  });

  it("ignores a self row left behind by an earlier version", () => {
    const rows: SavedSelection[] = [
      { selectorId: "ada", recipientId: "ada", card: testPick("stale") },
    ];

    expect(nudgeStatus(event, rows).picksIn).toBe(0);
  });
});

describe("nudgeMessage", () => {
  it("names who is holding things up and how much they owe", () => {
    const rows = allPicks(event).filter((row) => row.selectorId !== "dara");
    const message = nudgeMessage(nudgeStatus(event, rows))!;

    expect(message).toContain("**Dara**");
    expect(message).toContain("3 picks");
    expect(message).toContain("9 of 12 picks are in");
    expect(message).toContain("Waiting on 1 person");
  });

  it("says nothing at all once everybody has finished", () => {
    // A bot that only speaks when something needs doing keeps getting read.
    expect(nudgeMessage(nudgeStatus(event, allPicks(event)))).toBeNull();
  });

  it("says nothing before a draw has run", () => {
    expect(
      nudgeMessage(nudgeStatus({ participants: [], revealedAt: null }, []))
    ).toBeNull();
  });

  it("never puts a reveal token in a message bound for a public channel", () => {
    const message = nudgeMessage(nudgeStatus(event, []))!;

    for (const participant of event.participants) {
      expect(message).not.toContain(participant.token);
    }
  });

  it("never says who is building for whom", () => {
    const message = nudgeMessage(nudgeStatus(event, []))!;

    // The one thing the whole site exists to keep secret. Assignments are not
    // even an input to nudgeStatus, and this is the assertion that keeps it
    // that way if somebody widens the type later.
    expect(message).not.toMatch(/for (Ada|Brin|Cleo|Dara)\b/);
    expect(message).not.toContain("→");
  });

  it("singularises one pick", () => {
    const rows = allPicks(event).filter(
      (row) => !(row.selectorId === "dara" && row.recipientId === "ada")
    );
    const message = nudgeMessage(nudgeStatus(event, rows))!;

    expect(message).toContain("1 pick\n\n");
    expect(message).not.toContain("1 picks");
  });

  it("takes an injectable mention resolver", () => {
    const message = nudgeMessage(nudgeStatus(event, []), {
      mention: (entry) => `<@id-${entry.name.toLowerCase()}>`,
    })!;

    expect(message).toContain("<@id-ada>");
    expect(message).not.toContain("**Ada**");
  });

  it("stays inside Discord's length limit for an absurd party", () => {
    const huge = eventOf(
      Array.from({ length: 200 }, (_, index) => `Participant${index}`)
    );
    const message = nudgeMessage(nudgeStatus(huge, []))!;

    expect(message.length).toBeLessThanOrEqual(DISCORD_CONTENT_LIMIT);
    expect(message).toContain("more");
  });
});

describe("shouldPost", () => {
  const waiting = nudgeStatus(event, []);
  const state = (digest: string, postedAt: string): NudgeState => ({
    digest,
    postedAt,
  });
  const now = new Date("2026-02-10T12:00:00Z");

  it("posts the first time", () => {
    expect(shouldPost(waiting, null, now).post).toBe(true);
  });

  it("posts when somebody has picked since the last nudge", () => {
    const before = state("someone:1", "2026-02-10T11:00:00Z");

    expect(shouldPost(waiting, before, now).post).toBe(true);
  });

  it("stays quiet when nothing has changed and it was recent", () => {
    const before = state(nudgeDigest(waiting), "2026-02-09T12:00:00Z");

    const decision = shouldPost(waiting, before, now);
    expect(decision.post).toBe(false);
    expect(decision.reason).toContain("Nothing has changed");
  });

  it("speaks up again once the quiet period is over", () => {
    const before = state(nudgeDigest(waiting), "2026-02-05T12:00:00Z");

    expect(shouldPost(waiting, before, now).post).toBe(true);
  });

  it("is not silenced forever by a timestamp from the future", () => {
    // A clock skew or a hand-edited blob must not mute the bot for good.
    const before = state(nudgeDigest(waiting), "2027-01-01T00:00:00Z");

    expect(shouldPost(waiting, before, now).post).toBe(true);
  });

  it("never posts when everybody has finished, however long it has been", () => {
    const done = nudgeStatus(event, allPicks(event));
    const before = state("stale", "2020-01-01T00:00:00Z");

    expect(shouldPost(done, before, now).post).toBe(false);
  });

  it("never posts before a draw", () => {
    const none = nudgeStatus({ participants: [], revealedAt: null }, []);

    expect(shouldPost(none, null, now).post).toBe(false);
  });
});

describe("nudgeMessage, addressing people in Discord", () => {
  it("pings a real user id", () => {
    const withIds = eventOf(["Ada", "Brin", "Cleo", "Dara"], {
      Ada: "185432109876543210",
    });

    const message = nudgeMessage(nudgeStatus(withIds, []))!;

    expect(message).toContain("<@185432109876543210>");
    expect(message).not.toContain("**Ada**");
  });

  it("falls back to the bold name for a handle, never a fake @mention", () => {
    // An `@handle` in message text notifies nobody and highlights nothing — it
    // reads as a ping that failed, which is worse than not trying.
    const withHandle = eventOf(["Ada", "Brin", "Cleo", "Dara"], {
      Ada: "ada_lovelace",
    });

    const message = nudgeMessage(nudgeStatus(withHandle, []))!;

    expect(message).toContain("**ada\\_lovelace**");
    expect(message).not.toContain("<@");
    expect(message).not.toContain("• @ada_lovelace");
  });

  it("falls back to the plain name when no Discord is set", () => {
    const message = nudgeMessage(nudgeStatus(event, []))!;

    expect(message).toContain("**Ada**");
  });

  it("mixes pinged and unpinged people in one message", () => {
    const mixed = eventOf(["Ada", "Brin", "Cleo", "Dara"], {
      Ada: "185432109876543210",
      Brin: "brin",
    });

    const message = nudgeMessage(nudgeStatus(mixed, []))!;

    expect(message).toContain("<@185432109876543210>");
    expect(message).toContain("**brin**");
    expect(message).toContain("**Cleo**");
  });

  it("keeps the digest stable when only a handle changes", () => {
    // Filling in somebody's Discord is admin, not progress; it must not
    // trigger a repeat post saying exactly the same thing.
    const before = nudgeDigest(nudgeStatus(event, []));
    const after = nudgeDigest(
      nudgeStatus(eventOf(["Ada", "Brin", "Cleo", "Dara"], { Ada: "1854321098765432" }), [])
    );

    expect(after).toBe(before);
  });
});
