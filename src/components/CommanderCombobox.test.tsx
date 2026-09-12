import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CommanderCombobox } from "./CommanderCombobox";
import type { CommanderOption } from "@/lib/commanders";

function option(name: string, imageUrl: string | null = `https://img.test/${name}.jpg`): CommanderOption {
  return { id: name, name, colorIdentity: [], imageUrl, pairingRole: null };
}

const OPTIONS = [option("Alena, Kessig Trapper"), option("Halana, Kessig Ranger")];

function mount(options = OPTIONS, onChoose = vi.fn()) {
  render(
    <CommanderCombobox label="Find a partner" onChoose={onChoose} options={options} />
  );
  return onChoose;
}

const openList = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: /find a partner/i }));
  return user;
};

describe("CommanderCombobox", () => {
  it("shows each option's card art beside its name", async () => {
    mount();
    await openList();

    // Names alone make the list unusable for anyone who does not already know
    // the cards, which is most of the point of showing a partner list at all.
    const first = screen.getByRole("option", { name: "Alena, Kessig Trapper" });
    expect(within(first).getByRole("presentation")).toHaveAttribute(
      "src",
      "https://img.test/Alena, Kessig Trapper.jpg"
    );
  });

  it("defers loading the art, because the list can be fifty cards long", async () => {
    mount();
    await openList();

    // Scryfall's art is the full-size image, so an eager list of fifty is
    // several megabytes fetched to show the four rows that are visible.
    for (const image of screen.getAllByRole("presentation")) {
      expect(image).toHaveAttribute("loading", "lazy");
    }
  });

  it("keeps the option's accessible name to the card's name alone", async () => {
    mount();
    await openList();

    // The thumbnail is decoration next to the name it illustrates; announcing
    // it as well would read every option twice.
    expect(screen.getByRole("option", { name: "Alena, Kessig Trapper" })).toBeInTheDocument();
  });

  it("holds the row's shape when a card has no art", async () => {
    mount([option("Artless One", null)]);
    await openList();

    // A missing image must not collapse the row, or the list jumps around as
    // it filters.
    const row = screen.getByRole("option", { name: "Artless One" });
    expect(within(row).queryByRole("presentation")).toBeNull();
    expect(row.querySelector("span[aria-hidden='true']")).toBeInTheDocument();
  });

  it("still chooses an option when its thumbnail is the thing clicked", async () => {
    // The image covers a good part of the row now, and picking has to work
    // wherever in the row the pointer lands.
    const onChoose = mount();
    const user = await openList();

    const row = screen.getByRole("option", { name: "Halana, Kessig Ranger" });
    await user.click(within(row).getByRole("presentation"));

    expect(onChoose).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Halana, Kessig Ranger" })
    );
  });

  it("still commits the highlighted option from the keyboard", async () => {
    const onChoose = mount();
    const user = await openList();

    await user.keyboard("{ArrowDown}{Enter}");

    expect(onChoose).toHaveBeenCalledTimes(1);
  });
});
