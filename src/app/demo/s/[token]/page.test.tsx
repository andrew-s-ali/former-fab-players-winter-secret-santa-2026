import { render, screen } from "@testing-library/react";
import { readFile } from "node:fs/promises";
import * as navigation from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DemoTokenPage, { metadata } from "./page";
import * as demoLib from "@/lib/demo";
import { soloPick } from "@/lib/pairing";
import { testCommander, testSelfCards } from "@/test-support/cards";

vi.mock("@/lib/demo", () => ({
  readDemoEvent: vi.fn(),
  readDemoSelections: vi.fn(),
  readDemoWorkspace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  // The demo now renders the real SecretCardChoices, which uses the router.
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("DemoTokenPage", () => {
  const mockDemoEvent = {
    participants: [
      {
        id: "demo-1",
        name: "Alice Adventurer",
        email: "someone@example.com",
        recipientId: "demo-2",
        token: "valid-tok-1",
        selfCards: testSelfCards("alice"),
        colorVeto: "W" as const,
        themeVeto: "Infect",
        themeWish: "Dragons",
        discord: null,
      },
      {
        id: "demo-2",
        name: "Bob Builder",
        email: "someone@example.com",
        recipientId: "demo-1",
        token: "valid-tok-2",
        selfCards: testSelfCards("bob"),
        colorVeto: "U" as const,
        themeVeto: null,
        themeWish: "Artifacts",
        discord: null,
      },
      {
        id: "demo-3",
        name: "Charlie Broken",
        email: "someone@example.com",
        recipientId: "nonexistent-id",
        token: "broken-tok",
        selfCards: testSelfCards("charlie"),
        colorVeto: null,
        themeVeto: null,
        themeWish: null,
        discord: null,
      },
      {
        id: "demo-4",
        name: "Dana Drafter",
        email: "someone@example.com",
        recipientId: "demo-1",
        token: "valid-tok-4",
        selfCards: testSelfCards("dana"),
        colorVeto: null,
        themeVeto: null,
        themeWish: null,
        discord: null,
      },
    ],
    revealedAt: "2026-12-25T00:00:00.000Z",
  };

  /**
   * Enough for Alice's view of Bob's pool: Bob's two sign-up cards, plus a
   * pick from everyone except Bob and Alice herself — four unique, which is
   * what `pickSecretCards` requires.
   */
  const mockSelections = [
    { selectorId: "demo-3", recipientId: "demo-2", card: soloPick(testCommander("from-charlie")) },
    { selectorId: "demo-4", recipientId: "demo-2", card: soloPick(testCommander("from-dana")) },
    // Alice's own pick for Bob, which must never come back to her.
    { selectorId: "demo-1", recipientId: "demo-2", card: soloPick(testCommander("from-alice")) },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(demoLib.readDemoEvent).mockReturnValue(mockDemoEvent);
    vi.mocked(demoLib.readDemoSelections).mockReturnValue(mockSelections);
    vi.mocked(demoLib.readDemoWorkspace).mockReturnValue({ decklistUrl: null, notes: "" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            commanders: [
              {
                id: "card-1",
                name: "Solphim, Mayhem Dominus",
                manaCost: "{2}{R}{R}",
                typeLine: "Legendary Creature — Phyrexian Dominus",
                oracleText: "Effect.",
                colorIdentity: ["R"],
                imageUrl: null,
                scryfallUrl: "https://scryfall.com/card-1",
                hasPartner: false,
                canPair: false,
                setName: "Phyrexia",
                rarity: "uncommon",
                priceUsd: null,
                priceIsFoil: false,
              },
            ],
          }),
          { status: 200 }
        )
      )
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports appropriate metadata for demo token reveal page", () => {
    expect(metadata).toEqual({
      title: "Demo reveal page",
      robots: { index: false, follow: false },
    });
  });

  it("calls notFound when token is not found in demo event", async () => {
    await expect(
      DemoTokenPage({
      params: Promise.resolve({ token: "unknown-token" }),
      searchParams: Promise.resolve({}),
    })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(navigation.notFound).toHaveBeenCalled();
  });

  it("calls notFound when recipientId cannot be resolved", async () => {
    await expect(
      DemoTokenPage({
      params: Promise.resolve({ token: "broken-tok" }),
      searchParams: Promise.resolve({}),
    })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(navigation.notFound).toHaveBeenCalled();
  });

  it("renders the badge, greeting, sign-up recap, recipient, shortlist, browser link, rules and back link", async () => {
    const jsx = await DemoTokenPage({
      params: Promise.resolve({ token: "valid-tok-1" }),
      searchParams: Promise.resolve({}),
    });
    render(jsx);

    // Demo badge
    expect(
      screen.getByText(/Demo — invented people, not the real draw/i)
    ).toBeInTheDocument();

    // Greeting
    expect(
      screen.getByRole("heading", { level: 1, name: /hi alice adventurer/i })
    ).toBeInTheDocument();

    // RevealDetails contains recipient name and theme info
    expect(screen.getByText("Bob Builder")).toBeInTheDocument();
    expect(screen.getByText("Artifacts")).toBeInTheDocument();

    // The giver's own sign-up answers, collapsed.
    expect(
      screen.getByText(/what you chose when you signed up/i)
    ).toBeInTheDocument();

    // The shortlist, drawn by the real pickSecretCards over the demo
    // selections and rendered by the real SecretCardChoices.
    expect(
      screen.getByRole("heading", { level: 2, name: /build around one of these/i })
    ).toBeInTheDocument();
    // A giver is never shown their own recommendation.
    expect(screen.queryByText("Card from-alice")).toBeNull();

    // The browser is a link now, matching the real reveal page, which never
    // embedded one either.
    expect(
      screen.getByRole("link", { name: /browse every legal commander/i })
    ).toHaveAttribute("href", "/commanders");

    // The decklist box previews the real one but cannot save.
    expect(screen.getByRole("textbox", { name: "" })).toBeDisabled();

    // RulesSummary heading
    expect(
      screen.getByRole("heading", { level: 2, name: /^rules$/i })
    ).toBeInTheDocument();

    // Private notes: read-only here, because the demo never reaches the
    // database the real ones are saved to.
    const notes = screen.getByRole("textbox", { name: /private notes/i });
    expect(notes).toBeInTheDocument();
    expect(notes).toHaveAttribute("readonly");
    // Both the decklist box and the notes box say it.
    expect(screen.getAllByText(/Read-only in the demo/i)).toHaveLength(2);

    // Back link
    expect(
      screen.getByRole("link", { name: /← back to the demo links/i })
    ).toHaveAttribute("href", "/demo");
  });

  it("strictly does not import store or netlify blobs", async () => {
    const pageSource = await readFile("src/app/demo/s/[token]/page.tsx", "utf8");
    const forbiddenRegex = /import\s+.*from\s+["'].*(?:store|@netlify\/blobs).*["']/g;
    expect(pageSource.match(forbiddenRegex)).toBeNull();
  });
});
