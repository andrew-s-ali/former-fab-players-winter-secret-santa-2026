import { render, screen } from "@testing-library/react";
import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DemoRevealPage, { metadata } from "./page";
import * as demoLib from "@/lib/demo";

vi.mock("@/lib/demo", () => ({
  readDemoEvent: vi.fn(),
}));

describe("DemoRevealPage", () => {
  const mockRevealedEvent = {
    participants: [
      {
        id: "demo-1",
        name: "Alice Adventurer",
        recipientId: "demo-2",
        token: "demo-tok-1",
        colorVeto: null,
        themeVeto: null,
        themeWish: null,
      },
      {
        id: "demo-2",
        name: "Bob Builder",
        recipientId: "demo-1",
        token: "demo-tok-2",
        colorVeto: null,
        themeVeto: null,
        themeWish: null,
      },
    ],
    revealedAt: "2026-12-25T00:00:00.000Z",
  };

  const mockLockedEvent = {
    participants: [
      {
        id: "demo-1",
        name: "Alice Adventurer",
        recipientId: "demo-2",
        token: "demo-tok-1",
        colorVeto: null,
        themeVeto: null,
        themeWish: null,
      },
      {
        id: "demo-2",
        name: "Bob Builder",
        recipientId: "demo-1",
        token: "demo-tok-2",
        colorVeto: null,
        themeVeto: null,
        themeWish: null,
      },
    ],
    revealedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports appropriate metadata for demo reveal page", () => {
    expect(metadata).toEqual({
      title: "Demo reveal",
      robots: { index: false, follow: false },
    });
  });

  it("renders locked explanation when reveal day is locked instead of 404ing", () => {
    vi.mocked(demoLib.readDemoEvent).mockReturnValue(mockLockedEvent);

    render(<DemoRevealPage />);

    expect(
      screen.getByText(/Demo — invented people, not the real draw/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: /reveal day is locked/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/re-seed with/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/npm run seed:demo -- --revealed/i)
    ).toBeInTheDocument();
  });

  it("renders the DemoBadge, heading, RevealRing, and back link when revealed", () => {
    vi.mocked(demoLib.readDemoEvent).mockReturnValue(mockRevealedEvent);

    render(<DemoRevealPage />);

    expect(
      screen.getByText(/Demo — invented people, not the real draw/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: /who had who/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reveal the next one/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /← back to the demo links/i })
    ).toHaveAttribute("href", "/demo");
  });

  it("strictly does not import store or netlify blobs", async () => {
    const pageSource = await readFile("src/app/demo/reveal/page.tsx", "utf8");
    const forbiddenRegex = /import\s+.*from\s+["'].*(?:store|@netlify\/blobs).*["']/g;
    expect(pageSource.match(forbiddenRegex)).toBeNull();
  });
});
