import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PartnerPicker } from "./PartnerPicker";
import type { ColorCode, CommanderOption } from "@/lib/commanders";

type Role = CommanderOption["pairingRole"];

function card(
  name: string,
  pairingRole: Role,
  colorIdentity: ColorCode[] = [],
): CommanderOption {
  return {
    id: name,
    name,
    colorIdentity,
    imageUrl: `https://img.test/${name}.jpg`,
    pairingRole,
  };
}

const PARTNER = card("Alena, Kessig Trapper", "partner", ["R"]);
const OTHER_PARTNER = card("Halana, Kessig Ranger", "partner", ["G"]);
const BLACK_PARTNER = card("Ikra Shidiqi, the Usurper", "partner", ["B"]);
const BACKGROUND = card("Criminal Past", "background", ["B"]);
const CHOOSES_BACKGROUND = card("Abdel Adrian", "choose-background", ["W"]);
const PLAIN = card("Solphim, Mayhem Dominus", null, ["R"]);

function mount({
  primary = PARTNER,
  options = [OTHER_PARTNER, BLACK_PARTNER, BACKGROUND, PLAIN],
  colorVeto = null as ColorCode | null,
} = {}) {
  const onChoose = vi.fn();
  const onSkip = vi.fn();
  render(
    <PartnerPicker
      colorVeto={colorVeto}
      onChoose={onChoose}
      onSkip={onSkip}
      options={options}
      primary={primary}
      skipLabel={`Save ${primary.name} on its own`}
    />
  );
  return { onChoose, onSkip };
}

async function openList(kind = "partner") {
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: new RegExp(`find a ${kind}`, "i") }));
  return user;
}

describe("PartnerPicker", () => {
  it("offers a partner step only for a card that can take one", () => {
    mount({ primary: PLAIN });

    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("shows the art of every partner it offers", async () => {
    mount();
    await openList();

    // The list is names on their own otherwise, which is no use to anybody who
    // does not already know the cards — and knowing them is exactly what
    // picking a partner for somebody else requires.
    const row = screen.getByRole("option", { name: OTHER_PARTNER.name });
    expect(within(row).getByRole("presentation")).toHaveAttribute(
      "src",
      `https://img.test/${OTHER_PARTNER.name}.jpg`
    );
  });

  it("offers only cards that legally pair with this one", async () => {
    mount();
    await openList();

    // A Background is not a partner, and a card with no pairing role is
    // neither. An illegal pair should never be offered rather than being
    // refused when it is saved.
    expect(screen.getByRole("option", { name: OTHER_PARTNER.name })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: BACKGROUND.name })).toBeNull();
    expect(screen.queryByRole("option", { name: PLAIN.name })).toBeNull();
  });

  it("pairs a Choose a Background commander with Backgrounds, and says so", async () => {
    mount({ primary: CHOOSES_BACKGROUND, options: [BACKGROUND, OTHER_PARTNER] });

    expect(screen.getByText(/can take a Background/i)).toBeInTheDocument();
    await openList("Background");

    expect(screen.getByRole("option", { name: BACKGROUND.name })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: OTHER_PARTNER.name })).toBeNull();
  });

  it("drops a partner carrying the recipient's vetoed colour", async () => {
    // A partner's colours join the commander's, so a legal pair can still hand
    // somebody the one colour they asked not to receive.
    mount({ colorVeto: "B" });
    await openList();

    expect(screen.getByRole("option", { name: OTHER_PARTNER.name })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: BLACK_PARTNER.name })).toBeNull();
  });

  it("hands back the chosen partner", async () => {
    const { onChoose } = mount();
    const user = await openList();

    await user.click(screen.getByRole("option", { name: OTHER_PARTNER.name }));

    expect(onChoose).toHaveBeenCalledWith(
      expect.objectContaining({ name: OTHER_PARTNER.name })
    );
  });

  it("always allows saving the commander alone", async () => {
    const { onSkip } = mount();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /on its own/i }));

    expect(onSkip).toHaveBeenCalled();
  });

  it("says so, and still offers the skip, when nothing legal is left", () => {
    // Every candidate vetoed away. Without the skip there would be no way out
    // of the partner step at all.
    mount({ options: [BLACK_PARTNER], colorVeto: "B" });

    expect(screen.getByText(/No legal partner is available/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("button", { name: /on its own/i })).toBeInTheDocument();
  });
});
