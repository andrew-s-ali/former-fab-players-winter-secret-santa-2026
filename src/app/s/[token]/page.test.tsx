import { render, screen } from "@testing-library/react";
import * as navigation from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RevealPage, { dynamic, metadata } from "./page";
import * as store from "@/lib/store";

vi.mock("@/lib/store", () => ({
  readEvent: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

describe("RevealPage (/s/[token])", () => {
  const mockEvent = {
    participants: [
      {
        id: "p-1",
        name: "Alice",
        recipientId: "p-2",
        token: "tok-alice",
        colorVeto: "W" as const,
        themeVeto: "Infect",
        themeWish: "Dragons",
      },
      {
        id: "p-2",
        name: "Bob",
        recipientId: "p-1",
        token: "tok-bob",
        colorVeto: "U" as const,
        themeVeto: null,
        themeWish: "Artifacts",
      },
      {
        id: "p-3",
        name: "Charlie",
        recipientId: "nonexistent-id",
        token: "tok-broken",
        colorVeto: null,
        themeVeto: null,
        themeWish: null,
      },
    ],
    revealedAt: "2026-12-25T00:00:00.000Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(store.readEvent).mockResolvedValue(mockEvent);
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

  it("exports dynamic = 'force-dynamic' and robots noindex metadata", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(metadata).toEqual({
      title: "Your Secret Santa",
      robots: { index: false, follow: false },
    });
  });

  it("calls notFound when token is not found in event", async () => {
    await expect(
      RevealPage({ params: Promise.resolve({ token: "unknown-token" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(navigation.notFound).toHaveBeenCalled();
  });

  it("calls notFound when recipientId cannot be resolved", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      RevealPage({ params: Promise.resolve({ token: "tok-broken" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(navigation.notFound).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("renders giver greeting, RevealDetails, SecretScratchpad, CommanderBrowser, and RulesSummary", async () => {
    const jsx = await RevealPage({
      params: Promise.resolve({ token: "tok-alice" }),
    });
    render(jsx);

    // Greeting
    expect(
      screen.getByRole("heading", { level: 1, name: /hi alice/i })
    ).toBeInTheDocument();

    // RevealDetails contains recipient name and theme info
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Artifacts")).toBeInTheDocument();

    // SecretScratchpad
    expect(
      screen.getByRole("textbox", { name: /private notes/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/saved to this browser/i)).toBeInTheDocument();

    // Commander browser loaded
    expect(await screen.findByText("Solphim, Mayhem Dominus")).toBeInTheDocument();

    // RulesSummary heading
    expect(
      screen.getByRole("heading", { level: 2, name: /^rules$/i })
    ).toBeInTheDocument();
  });
});
