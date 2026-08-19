import { render, screen } from "@testing-library/react";
import { readFile } from "node:fs/promises";
import * as navigation from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DemoTokenPage, { metadata } from "./page";
import * as demoLib from "@/lib/demo";

vi.mock("@/lib/demo", () => ({
  readDemoEvent: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

describe("DemoTokenPage", () => {
  const mockDemoEvent = {
    participants: [
      {
        id: "demo-1",
        name: "Alice Adventurer",
        recipientId: "demo-2",
        token: "valid-tok-1",
        colorVeto: "W" as const,
        themeVeto: "Infect",
        themeWish: "Dragons",
      },
      {
        id: "demo-2",
        name: "Bob Builder",
        recipientId: "demo-1",
        token: "valid-tok-2",
        colorVeto: "U" as const,
        themeVeto: null,
        themeWish: "Artifacts",
      },
      {
        id: "demo-3",
        name: "Charlie Broken",
        recipientId: "nonexistent-id",
        token: "broken-tok",
        colorVeto: null,
        themeVeto: null,
        themeWish: null,
      },
    ],
    revealedAt: "2026-12-25T00:00:00.000Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(demoLib.readDemoEvent).mockReturnValue(mockDemoEvent);
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
      DemoTokenPage({ params: Promise.resolve({ token: "unknown-token" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(navigation.notFound).toHaveBeenCalled();
  });

  it("calls notFound when recipientId cannot be resolved", async () => {
    await expect(
      DemoTokenPage({ params: Promise.resolve({ token: "broken-tok" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(navigation.notFound).toHaveBeenCalled();
  });

  it("renders DemoBadge, giver greeting, RevealDetails, CommanderBrowser, RulesSummary, and back link", async () => {
    const jsx = await DemoTokenPage({
      params: Promise.resolve({ token: "valid-tok-1" }),
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

    // Commander browser loaded
    expect(await screen.findByText("Solphim, Mayhem Dominus")).toBeInTheDocument();

    // RulesSummary heading
    expect(
      screen.getByRole("heading", { level: 2, name: /^rules$/i })
    ).toBeInTheDocument();

    // SecretScratchpad
    expect(
      screen.getByRole("textbox", { name: /private notes/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/saved to this browser/i)).toBeInTheDocument();

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
