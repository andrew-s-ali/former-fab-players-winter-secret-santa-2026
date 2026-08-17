import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommanderBrowser } from "./CommanderBrowser";

const card = (id: string, name: string, colorIdentity: string[] = ["G"]) => ({
  id,
  name,
  manaCost: "{1}{G}",
  typeLine: "Legendary Creature — Elf",
  oracleText: "Text.",
  colorIdentity,
  imageUrl: null,
  scryfallUrl: `https://scryfall.com/${id}`,
  hasPartner: false,
  canPair: false,
  setName: "Test Set",
  rarity: "uncommon",
});

function mockFetch(commanders: ReturnType<typeof card>[]) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ commanders }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  mockFetch([card("a", "Anara"), card("b", "Selvala")]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CommanderBrowser", () => {
  it("loads a sample on mount", async () => {
    render(<CommanderBrowser lockedExclude={null} />);

    expect(await screen.findByText("Anara")).toBeInTheDocument();
    expect(screen.getByText("Selvala")).toBeInTheDocument();
  });

  it("asks for nine cards and no filters by default", async () => {
    const fetchMock = mockFetch([card("a", "Anara")]);
    render(<CommanderBrowser lockedExclude={null} />);

    await screen.findByText("Anara");

    expect(fetchMock.mock.calls[0][0]).toContain("n=9");
    expect(fetchMock.mock.calls[0][0]).not.toContain("exclude=");
  });

  it("refetches with the colour when a pip is selected", async () => {
    const fetchMock = mockFetch([card("a", "Anara")]);
    render(<CommanderBrowser lockedExclude={null} />);
    await screen.findByText("Anara");

    await userEvent.click(screen.getByRole("button", { name: /green/i }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.at(-1)![0]).toContain("colors=G");
    });
  });

  it("always sends the locked exclusion", async () => {
    const fetchMock = mockFetch([card("a", "Anara")]);
    render(<CommanderBrowser lockedExclude="R" />);

    await screen.findByText("Anara");

    expect(fetchMock.mock.calls[0][0]).toContain("exclude=R");
  });

  it("disables the locked colour's pip", async () => {
    render(<CommanderBrowser lockedExclude="R" />);
    await screen.findByText("Anara");

    expect(screen.getByRole("button", { name: /red/i })).toBeDisabled();
  });

  it("asks only for pairable commanders when the toggle is on", async () => {
    const fetchMock = mockFetch([card("a", "Anara")]);
    render(<CommanderBrowser lockedExclude={null} />);
    await screen.findByText("Anara");

    await userEvent.click(screen.getByRole("button", { name: /can pair/i }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.at(-1)![0]).toContain("pairs=1");
    });
  });

  it("does not send the pairs flag when the toggle is off", async () => {
    const fetchMock = mockFetch([card("a", "Anara")]);
    render(<CommanderBrowser lockedExclude={null} />);

    await screen.findByText("Anara");

    expect(fetchMock.mock.calls[0][0]).not.toContain("pairs=");
  });

  it("opens the detail panel for a chosen card", async () => {
    render(<CommanderBrowser lockedExclude={null} />);
    await screen.findByText("Anara");

    await userEvent.click(screen.getByRole("button", { name: /Anara/ }));

    expect(await screen.findByRole("region", { name: "Anara" })).toBeInTheDocument();
  });

  it("says so when nothing matches", async () => {
    mockFetch([]);
    render(<CommanderBrowser lockedExclude={null} />);

    expect(await screen.findByText(/no commanders match/i)).toBeInTheDocument();
  });

  it("shows an error when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 500 }))
    );
    render(<CommanderBrowser lockedExclude={null} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load/i);
  });
});
