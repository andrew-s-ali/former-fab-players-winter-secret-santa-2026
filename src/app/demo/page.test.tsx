import { render, screen } from "@testing-library/react";
import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DemoIndexPage, { metadata } from "./page";
import * as demoLib from "@/lib/demo";

vi.mock("@/lib/demo", () => ({
  readDemoEvent: vi.fn(),
}));

describe("DemoIndexPage", () => {
  const mockDemoEvent = {
    participants: [
      {
        id: "demo-1",
        name: "Alice Adventurer",
        recipientId: "demo-2",
        token: "demo-tok-1",
        colorVeto: "W" as const,
        themeVeto: null,
        themeWish: "Tokens",
      },
      {
        id: "demo-2",
        name: "Bob Builder 🎄",
        recipientId: "demo-1",
        token: "demo-tok-2",
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
    expect(
      screen.getByText(/Each link is what one participant would receive privately/i)
    ).toBeInTheDocument();
  });

  it("renders participant links pointing to /demo/s/[token]", () => {
    render(<DemoIndexPage />);

    const aliceLink = screen.getByRole("link", { name: /alice adventurer/i });
    expect(aliceLink).toHaveAttribute("href", "/demo/s/demo-tok-1");

    const bobLink = screen.getByRole("link", { name: /bob builder 🎄/i });
    expect(bobLink).toHaveAttribute("href", "/demo/s/demo-tok-2");
  });

  it("renders a link to the demo reveal day", () => {
    render(<DemoIndexPage />);

    const revealLink = screen.getByRole("link", {
      name: /see the demo reveal day →/i,
    });
    expect(revealLink).toHaveAttribute("href", "/demo/reveal");
  });

  it("strictly does not import store or netlify blobs", async () => {
    const pageSource = await readFile("src/app/demo/page.tsx", "utf8");
    const forbiddenRegex = /import\s+.*from\s+["'].*(?:store|@netlify\/blobs).*["']/g;
    expect(pageSource.match(forbiddenRegex)).toBeNull();
  });
});
