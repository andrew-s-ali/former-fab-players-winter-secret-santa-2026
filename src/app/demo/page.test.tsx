import { render, screen } from "@testing-library/react";
import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DemoIndexPage, { metadata } from "./page";
import * as demoLib from "@/lib/demo";
import { soloPick } from "@/lib/pairing";
import { testCommander, testSelfCards } from "@/test-support/cards";

vi.mock("@/lib/demo", () => ({
  readDemoEvent: vi.fn(),
  readDemoSelections: vi.fn(),
  readDemoWorkspace: vi.fn(),
}));

describe("DemoIndexPage", () => {
  const mockDemoEvent = {
    participants: [
      {
        id: "demo-1",
        name: "Alice Adventurer",
        email: "someone@example.com",
        recipientId: "demo-2",
        token: "demo-tok-1",
        selfCards: testSelfCards(),
        colorVeto: "W" as const,
        themeVeto: null,
        themeWish: "Tokens",
        discord: null,
      },
      {
        id: "demo-2",
        name: "Bob Builder 🎄",
        email: "someone@example.com",
        recipientId: "demo-1",
        token: "demo-tok-2",
        selfCards: testSelfCards(),
        colorVeto: null,
        themeVeto: null,
        themeWish: null,
        discord: null,
      },
    ],
    revealedAt: "2026-12-25T00:00:00.000Z",
  };

  const mockSelections = [
    { selectorId: "demo-1", recipientId: "demo-2", card: soloPick(testCommander("x")) },
    { selectorId: "demo-2", recipientId: "demo-1", card: soloPick(testCommander("y")) },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(demoLib.readDemoEvent).mockReturnValue(mockDemoEvent);
    vi.mocked(demoLib.readDemoSelections).mockReturnValue(mockSelections);
    vi.mocked(demoLib.readDemoWorkspace).mockImplementation((id) =>
      id === "demo-1"
        ? { decklistUrl: "https://moxfield.com/decks/demo", notes: "wip" }
        : { decklistUrl: null, notes: "" }
    );
  });

  it("exports appropriate metadata for demo page", () => {
    expect(metadata).toEqual({
      title: "Demo",
      robots: { index: false, follow: false },
    });
  });

  it("renders the DemoBadge, heading, and description", () => {
    render(<DemoIndexPage />);

    expect(
      screen.getByText(/Demo — invented people, not the real draw/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: /demo links/i })
    ).toBeInTheDocument();
    // The index now states which phase of the event is being previewed: a
    // finished workshop with every assignment open.
    expect(
      screen.getByText(/have all signed up, all picked their own two commanders/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/2 recommendations for each other/i)).toBeInTheDocument();
  });

  it("says which participants have saved a decklist", () => {
    render(<DemoIndexPage />);

    expect(screen.getByText(/decklist saved/i)).toBeInTheDocument();
  });

  // Each person now has two links: the workshop stage and the finished
  // assignment, because the private link means different things at each.
  it("links to both stages of each participant's private link", () => {
    render(<DemoIndexPage />);

    const workshops = screen.getAllByRole("link", { name: "workshop" });
    const assignments = screen.getAllByRole("link", { name: "assignment" });

    expect(workshops[0]).toHaveAttribute("href", "/demo/s/demo-tok-1?phase=workshop");
    expect(assignments[0]).toHaveAttribute("href", "/demo/s/demo-tok-1");
    expect(workshops[1]).toHaveAttribute("href", "/demo/s/demo-tok-2?phase=workshop");
    expect(assignments[1]).toHaveAttribute("href", "/demo/s/demo-tok-2");
    expect(screen.getByText("Bob Builder 🎄")).toBeInTheDocument();
  });

  it("renders a link to the demo reveal day", () => {
    render(<DemoIndexPage />);

    const revealLink = screen.getByRole("link", { name: /reveal day →/i });
    expect(revealLink).toHaveAttribute("href", "/demo/reveal");
  });

  it("links on to the sign-up form and the commander browser", () => {
    render(<DemoIndexPage />);

    expect(
      screen.getByRole("link", { name: /the sign-up form →/i })
    ).toHaveAttribute("href", "/signup");
    expect(
      screen.getByRole("link", { name: /the commander browser →/i })
    ).toHaveAttribute("href", "/commanders");
  });

  it("strictly does not import store or netlify blobs", async () => {
    const pageSource = await readFile("src/app/demo/page.tsx", "utf8");
    const forbiddenRegex = /import\s+.*from\s+["'].*(?:store|@netlify\/blobs).*["']/g;
    expect(pageSource.match(forbiddenRegex)).toBeNull();
  });
});
