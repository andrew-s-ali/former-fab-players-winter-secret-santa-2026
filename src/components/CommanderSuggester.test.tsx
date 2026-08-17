import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommanderSuggester } from "./CommanderSuggester";

const suggestion = {
  commander: {
    id: "a",
    name: "Anara, Wolvid Familiar",
    manaCost: "{3}{G}",
    typeLine: "Legendary Creature — Wolf",
    oracleText: "Partner",
    colorIdentity: ["G"],
    imageUrl: "https://cards.scryfall.io/normal/anara.jpg",
    scryfallUrl: "https://scryfall.com/anara",
    hasPartner: true,
    setName: "Commander 2019",
    rarity: "uncommon",
    canPair: true,
  },
  partner: null,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CommanderSuggester", () => {
  it("fetches and shows a commander when clicked", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(suggestion), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<CommanderSuggester colorVeto={null} />);
    await userEvent.click(screen.getByRole("button", { name: /random commander/i }));

    expect(await screen.findByText("Anara, Wolvid Familiar")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/commanders/random");
  });

  it("renders the partner card when the suggestion has one", async () => {
    const withPartner = {
      ...suggestion,
      partner: {
        id: "b",
        name: "Kediss, Emberclaw Familiar",
        manaCost: "{1}{R}",
        typeLine: "Legendary Creature — Devil",
        oracleText: "Partner",
        colorIdentity: ["R"],
        imageUrl: null,
        scryfallUrl: "https://scryfall.com/kediss",
        hasPartner: true,
        setName: "Commander 2019",
        rarity: "uncommon",
        canPair: true,
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(withPartner), { status: 200 })
      )
    );

    render(<CommanderSuggester colorVeto={null} />);
    await userEvent.click(screen.getByRole("button", { name: /random commander/i }));

    expect(await screen.findByText("Anara, Wolvid Familiar")).toBeInTheDocument();
    expect(screen.getByText("Kediss, Emberclaw Familiar")).toBeInTheDocument();
  });

  it("passes the colour veto to the endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(suggestion), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<CommanderSuggester colorVeto="R" />);
    await userEvent.click(screen.getByRole("button", { name: /random commander/i }));

    expect(fetchMock.mock.calls[0][0]).toContain("exclude=R");
  });

  it("shows an error message when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 500 }))
    );

    render(<CommanderSuggester colorVeto={null} />);
    await userEvent.click(screen.getByRole("button", { name: /random commander/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load/i);
  });
});
