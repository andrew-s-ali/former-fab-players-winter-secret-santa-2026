import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import RevealDayPage, { dynamic, metadata } from "./page";
import * as store from "@/lib/store";
import * as navigation from "next/navigation";

vi.mock("@/lib/store", () => ({
  readEvent: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

describe("RevealDayPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports dynamic = 'force-dynamic' and correct metadata", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(metadata).toEqual({ title: "Reveal day" });
  });

  it("calls notFound when event is not revealed", async () => {
    vi.mocked(store.readEvent).mockResolvedValue({
      participants: [
        {
          id: "1",
          name: "Alice",
          recipientId: "2",
          token: "tok-1",
          colorVeto: null,
          themeVeto: null,
          themeWish: null,
        },
        {
          id: "2",
          name: "Bob",
          recipientId: "1",
          token: "tok-2",
          colorVeto: null,
          themeVeto: null,
          themeWish: null,
        },
      ],
      revealedAt: null,
    });

    await expect(RevealDayPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(navigation.notFound).toHaveBeenCalled();
  });

  it("calls notFound when event is revealed but has fewer than 2 participants", async () => {
    vi.mocked(store.readEvent).mockResolvedValue({
      participants: [],
      revealedAt: "2026-12-25T00:00:00.000Z",
    });

    await expect(RevealDayPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(navigation.notFound).toHaveBeenCalled();
  });

  it("renders the page with title, explanation, RevealRing, and back link when revealed", async () => {
    vi.mocked(store.readEvent).mockResolvedValue({
      participants: [
        {
          id: "1",
          name: "Alice",
          recipientId: "2",
          token: "tok-1",
          colorVeto: null,
          themeVeto: null,
          themeWish: null,
        },
        {
          id: "2",
          name: "Bob",
          recipientId: "1",
          token: "tok-2",
          colorVeto: null,
          themeVeto: null,
          themeWish: null,
        },
      ],
      revealedAt: "2026-12-25T00:00:00.000Z",
    });

    const jsx = await RevealDayPage();
    render(jsx);

    expect(
      screen.getByRole("heading", { level: 1, name: /former fab players winter secret santa 2026/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /who had who/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/one gift chain, all the way round\. reveal them one at a time\./i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reveal the next one/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /← back to the rules/i })
    ).toHaveAttribute("href", "/");
  });
});
