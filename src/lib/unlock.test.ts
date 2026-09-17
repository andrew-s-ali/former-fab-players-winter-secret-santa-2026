import { describe, expect, it } from "vitest";
import { unlockEmail, unlockMessage } from "./unlock";

describe("unlockMessage", () => {
  const message = unlockMessage({
    participantCount: 7,
    exchangeAt: "2026-12-12T05:00:00Z",
  });

  it("pings the players' role and says every pick is in", () => {
    expect(message).toContain("<@&1547834110784045076>");
    expect(message).toContain("all 42 commander picks are in");
  });

  it("sends people to their own private link and asks them to confirm", () => {
    expect(message).toMatch(/Open your private link/);
    expect(message).toMatch(/who\s+you are building for/);
    expect(message).toMatch(/three commanders/);
    expect(message).toMatch(/confirm which commander you are building/);
  });

  it("names the exchange day", () => {
    expect(message).toMatch(/Saturday,? 12 December 2026/);
  });

  it("leaves the date out when none is set", () => {
    expect(unlockMessage({ participantCount: 4, exchangeAt: null })).not.toMatch(
      /Decks are due/
    );
  });

  it("links no private page", () => {
    expect(message).not.toMatch(/\/s\//);
  });

  it("fits in one Discord message", () => {
    expect(message.length).toBeLessThanOrEqual(2000);
  });
});

describe("unlockEmail", () => {
  it("greets the person and tells them what to do on their link", () => {
    const email = unlockEmail({ name: "Ada", exchangeAt: "2026-12-12T05:00:00Z" });
    expect(email).toMatch(/^Hi Ada,/);
    expect(email).toMatch(/now unlocked/);
    expect(email).toMatch(/three commanders/);
    expect(email).toMatch(/Saturday,? 12 December 2026/);
    expect(email).not.toMatch(/\/s\//);
  });
});
