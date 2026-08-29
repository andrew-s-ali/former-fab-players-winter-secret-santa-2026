import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SecretCardChoices } from "./SecretCardChoices";
import { cashInCardAction } from "@/app/s/actions";
import type { Commander } from "@/lib/scryfall/types";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/app/s/actions", () => ({
  cashInCardAction: vi.fn(),
}));

function card(id: string): Commander {
  return {
    id,
    name: `Commander ${id}`,
    manaCost: "",
    typeLine: "Legendary Creature",
    oracleText: "",
    colorIdentity: [],
    imageUrl: null,
    scryfallUrl: `https://example.com/${id}`,
    hasPartner: false,
    canPair: false,
    setName: "Test",
    rarity: "uncommon",
    priceUsd: null,
    priceIsFoil: false,
  };
}

describe("SecretCardChoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cashInCardAction).mockResolvedValue({ ok: true, message: "done" });
  });

  it("requires confirmation before spending the one-time cash-in", async () => {
    render(
      <SecretCardChoices
        cards={[card("one"), card("two"), card("three")]}
        cashInUsed={false}
        token="private-token"
      />
    );

    expect(screen.getByText(/fourth card stays completely hidden/i)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: /trade this card/i })[1]);
    expect(cashInCardAction).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /use my one cash-in/i }));
    expect(cashInCardAction).toHaveBeenCalledWith("private-token", 1);
    expect(refresh).toHaveBeenCalled();
  });

  it("removes every trade control after the cash-in is used", () => {
    render(
      <SecretCardChoices
        cards={[card("one"), card("two"), card("four")]}
        cashInUsed
        token="private-token"
      />
    );
    expect(screen.queryByRole("button", { name: /trade this card/i })).not.toBeInTheDocument();
    expect(screen.getByText(/final three choices/i)).toBeInTheDocument();
  });
});
