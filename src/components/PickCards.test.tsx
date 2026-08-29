import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PickCards, PickName } from "./PickCards";
import { soloPick } from "@/lib/pairing";
import { testCommander } from "@/test-support/cards";

const alena = testCommander("alena", {
  name: "Alena",
  imageUrl: "https://cards.scryfall.io/normal/a.jpg",
});
const halana = testCommander("halana", {
  name: "Halana",
  imageUrl: "https://cards.scryfall.io/normal/h.jpg",
});
const pair = { commander: alena, partner: halana };

describe("PickCards", () => {
  it("draws a lone commander as one image", () => {
    const { container } = render(<PickCards pick={soloPick(alena)} />);

    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("draws both halves of a pair", () => {
    const { container } = render(<PickCards pick={pair} />);

    expect(container.querySelectorAll("img")).toHaveLength(2);
  });

  // A pair is one choice, so it must not take two choices' worth of room in a
  // row of options.
  it("keeps a pair inside a single card's footprint", () => {
    const { container } = render(<PickCards pick={pair} />);

    const box = container.firstElementChild!;
    expect(box).toHaveClass("relative", "aspect-[5/7]", "w-full");

    const halves = [...container.querySelectorAll("img")];
    expect(halves).toHaveLength(2);
    for (const half of halves) {
      // Each half is inset, so the two together fill exactly the one box.
      expect(half).toHaveClass("absolute");
      expect(half.style.width).toBe("86%");
    }
  });

  // Offset upward rather than tucked under the bottom corner, so the partner's
  // title bar stays visible and both cards can be named at a glance.
  it("offsets the partner so its title is not hidden", () => {
    const { container } = render(<PickCards pick={pair} />);
    const [behind, front] = container.querySelectorAll("img");

    expect(behind).toHaveClass("top-0", "right-0");
    expect(front).toHaveClass("bottom-0", "left-0", "z-10");
    // The commander is the one drawn in front.
    expect(front).toHaveAttribute("src", alena.imageUrl!);
  });

  it("uses the small footprint for a thumbnail", () => {
    const { container } = render(<PickCards pick={pair} size="thumb" />);

    expect(container.firstElementChild).toHaveClass("w-14", "aspect-[5/7]");
  });

  it("falls back to a placeholder when a card has no art", () => {
    const artless = testCommander("none", { name: "No Art", imageUrl: null });
    const { container } = render(<PickCards pick={soloPick(artless)} />);

    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.firstElementChild).toHaveClass("bg-slate-500/20");
  });
});

describe("PickName", () => {
  it("names a lone commander plainly", () => {
    const { container } = render(<PickName pick={soloPick(alena)} />);

    expect(container.textContent).toBe("Alena");
  });

  it("names both halves and marks them as partners", () => {
    const { container } = render(<PickName pick={pair} />);

    expect(container.textContent).toContain("Alena");
    expect(container.textContent).toContain("Halana");
    expect(container.textContent).toContain("partners");
  });
});
