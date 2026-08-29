import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CardImage } from "./CardImage";

const SRC = "https://cards.scryfall.io/normal/front/a/b/card.jpg";

/** Replaces the setup-file stub so a touch device can be simulated. */
function setHoverCapable(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CardImage", () => {
  it("renders the card at the size it was asked for", () => {
    render(<CardImage className="w-14" name="Alena" src={SRC} />);

    const img = document.querySelector("img")!;
    expect(img).toHaveAttribute("src", SRC);
    expect(img).toHaveClass("w-14");
  });

  it("shows an enlarged copy on hover and removes it on leave", () => {
    render(<CardImage name="Alena" src={SRC} />);
    const img = document.querySelector("img")!;

    expect(document.querySelectorAll("img")).toHaveLength(1);

    fireEvent.mouseEnter(img, { clientX: 100, clientY: 100 });
    expect(document.querySelectorAll("img")).toHaveLength(2);
    expect(screen.getByAltText("Alena, enlarged")).toBeInTheDocument();

    fireEvent.mouseLeave(img);
    expect(document.querySelectorAll("img")).toHaveLength(1);
  });

  // Several places a card appears sit inside overflow-hidden containers, which
  // would clip a preview rendered in the normal flow.
  it("renders the preview outside the component's own subtree", () => {
    const { container } = render(<CardImage name="Alena" src={SRC} />);

    fireEvent.mouseEnter(container.querySelector("img")!, {
      clientX: 10,
      clientY: 10,
    });

    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(document.body.querySelectorAll("img")).toHaveLength(2);
  });

  it("keeps the preview clear of the pointer", () => {
    render(<CardImage name="Alena" src={SRC} />);

    fireEvent.mouseEnter(document.querySelector("img")!, {
      clientX: 100,
      clientY: 400,
    });

    const preview = screen.getByAltText("Alena, enlarged");
    expect(Number.parseInt(preview.style.left, 10)).toBeGreaterThan(100);
  });

  // Otherwise a card near the right edge would hang off the window.
  it("flips to the left of the cursor when there is no room on the right", () => {
    window.innerWidth = 900;
    render(<CardImage name="Alena" src={SRC} />);

    fireEvent.mouseEnter(document.querySelector("img")!, {
      clientX: 880,
      clientY: 300,
    });

    const preview = screen.getByAltText("Alena, enlarged");
    expect(Number.parseInt(preview.style.left, 10)).toBeLessThan(880);
  });

  it("follows the cursor", () => {
    render(<CardImage name="Alena" src={SRC} />);
    const img = document.querySelector("img")!;

    fireEvent.mouseEnter(img, { clientX: 100, clientY: 200 });
    const first = screen.getByAltText("Alena, enlarged").style.left;

    fireEvent.mouseMove(img, { clientX: 300, clientY: 200 });
    expect(screen.getByAltText("Alena, enlarged").style.left).not.toBe(first);
  });

  it("never covers the pointer, so clicks still reach the card", () => {
    render(<CardImage name="Alena" src={SRC} />);

    fireEvent.mouseEnter(document.querySelector("img")!, {
      clientX: 100,
      clientY: 100,
    });

    expect(screen.getByAltText("Alena, enlarged")).toHaveClass("pointer-events-none");
  });

  // These images sit inside buttons on the browser grid, so they are tabbable.
  it("previews on focus too, anchored to the element", () => {
    render(<CardImage name="Alena" src={SRC} />);
    const img = document.querySelector("img")!;

    fireEvent.focus(img);
    expect(screen.getByAltText("Alena, enlarged")).toBeInTheDocument();

    fireEvent.blur(img);
    expect(screen.queryByAltText("Alena, enlarged")).toBeNull();
  });

  // On a touch screen the first tap fires the hover handlers, and the card
  // would be left floating with nothing to dismiss it.
  it("offers no preview where hovering is not a real thing", () => {
    setHoverCapable(false);
    render(<CardImage name="Alena" src={SRC} />);

    fireEvent.mouseEnter(document.querySelector("img")!, {
      clientX: 100,
      clientY: 100,
    });

    expect(screen.queryByAltText("Alena, enlarged")).toBeNull();
  });

  it("hides the enlarged copy from screen readers when the card is unnamed", () => {
    render(<CardImage src={SRC} />);

    fireEvent.mouseEnter(document.querySelector("img")!, {
      clientX: 50,
      clientY: 50,
    });

    const previews = document.body.querySelectorAll("img[aria-hidden='true']");
    expect(previews).toHaveLength(1);
  });
});
