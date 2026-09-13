import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoCardWorkshop } from "./DemoCardWorkshop";
import * as actions from "@/app/s/actions";
import { soloPick } from "@/lib/pairing";
import { testCommander } from "@/test-support/cards";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/s/actions", () => ({
  saveCardAction: vi.fn(),
  removeCardAction: vi.fn(),
}));

/**
 * Full commanders, because the same mock answers both the name list and the
 * browser's sample grid, and the grid's detail panel reads the whole card.
 *
 * The mock ignores the sample endpoint's `exclude` parameter, which is what
 * makes the veto test possible: the real endpoint would never hand back a
 * vetoed card, so the client-side rule could not otherwise be exercised.
 */
const OPTIONS = [
  testCommander("green", { name: "Green One", colorIdentity: ["G"] }),
  testCommander("black", { name: "Black One", colorIdentity: ["B"] }),
];

const targets = [
  { id: "t1", name: "Bob", colorVeto: null },
  { id: "t2", name: "Cleo", colorVeto: "B" as const },
];

function mountWorkshop(peer: Record<string, ReturnType<typeof soloPick> | null> = {}) {
  return render(
    <DemoCardWorkshop
      initialPeerCards={{ t1: null, t2: null, ...peer }}
      othersCompleted={4}
      targets={targets}
      token="demo"
      totalSlots={6}
    />
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ commanders: OPTIONS }), { status: 200 }))
    )
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("DemoCardWorkshop", () => {
  it("counts what everyone else has done alongside this person's picks", async () => {
    mountWorkshop({ t1: soloPick(testCommander("green", { name: "Green One" })) });

    expect(await screen.findByText(/5 of 6 group picks saved/)).toBeInTheDocument();
  });

  it("removes a saved pick and the count follows", async () => {
    const user = userEvent.setup();
    mountWorkshop({ t1: soloPick(testCommander("green", { name: "Green One" })) });

    await screen.findByText(/5 of 6 group picks saved/);
    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(screen.getByText(/4 of 6 group picks saved/)).toBeInTheDocument()
    );
  });

  // The demo re-implements saving, so it has to apply the same rules the
  // server action does rather than wave anything through.
  it("refuses a card in the recipient's vetoed colour", async () => {
    const user = userEvent.setup();
    mountWorkshop();
    await screen.findByText(/4 of 6 group picks saved/);

    // Cleo vetoes black.
    await user.selectOptions(
      screen.getByRole("combobox", { name: /choose a participant/i }),
      "t2"
    );
    await user.click(await screen.findByRole("button", { name: /Black One/ }));
    await user.click(await screen.findByRole("button", { name: /Save for Cleo/ }));

    // Two alerts appear: the studio's own, and the browser's "couldn't save".
    await waitFor(() =>
      expect(
        screen.getAllByRole("alert").map((node) => node.textContent).join(" ")
      ).toMatch(/includes B, which this participant vetoed/)
    );
    // And nothing was recorded.
    expect(screen.getByText(/4 of 6 group picks saved/)).toBeInTheDocument();
  });

  it("saves a card the recipient has not vetoed", async () => {
    const user = userEvent.setup();
    mountWorkshop();
    await screen.findByText(/4 of 6 group picks saved/);

    await user.selectOptions(
      screen.getByRole("combobox", { name: /choose a participant/i }),
      "t2"
    );
    await user.click(await screen.findByRole("button", { name: /Green One/ }));
    await user.click(await screen.findByRole("button", { name: /Save for Cleo/ }));

    await waitFor(() =>
      expect(screen.getByText(/5 of 6 group picks saved/)).toBeInTheDocument()
    );
  });

  // The one guarantee that matters for a demo route.
  it("never calls the real save or remove actions", async () => {
    const user = userEvent.setup();
    mountWorkshop({ t1: soloPick(testCommander("green", { name: "Green One" })) });

    await screen.findByText(/5 of 6 group picks saved/);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(screen.getByText(/4 of 6 group picks saved/)).toBeInTheDocument()
    );

    expect(actions.saveCardAction).not.toHaveBeenCalled();
    expect(actions.removeCardAction).not.toHaveBeenCalled();
  });

  it("counts this person's own picks separately from the group's", async () => {
    // The group counter moves when other people work, so it cannot tell a
    // reader whether *they* are finished. Both numbers, side by side.
    mountWorkshop({ t1: soloPick(testCommander("green", { name: "Green One" })) });

    expect(await screen.findByText(/5 of 6 group picks saved/)).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 of yours saved/)).toBeInTheDocument();
  });

  it("says so once this person has nothing left to pick", async () => {
    mountWorkshop({
      t1: soloPick(testCommander("green", { name: "Green One" })),
      t2: soloPick(testCommander("other", { name: "Other One" })),
    });

    expect(await screen.findByText(/All of yours are in/)).toBeInTheDocument();
  });

  it("explains what to do and how many picks are owed", async () => {
    mountWorkshop();

    expect(
      await screen.findByRole("heading", { name: /what to do here/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/one commander for each of the 2 other players/i)).toBeInTheDocument();
    // The failure mode nobody can see coming from the controls alone.
    expect(
      screen.getByText(/that pool comes up short and nobody/i)
    ).toBeInTheDocument();
  });

  it("points at the Can pair filter, which is the only way to find pairs", async () => {
    mountWorkshop();

    // The partner offer only appears after committing to a card that happens
    // to take one, so without this the whole feature is discoverable by
    // accident or not at all.
    const step = (await screen.findByText(/Suggesting a pair\?/i)).closest("li")!;

    // Names the control by the label it really carries: rename the button and
    // this fails, rather than leaving the instructions pointing at nothing.
    expect(within(step).getByText("Can pair")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Can pair" })).toBeInTheDocument();
    expect(within(step).getByText(/fills one slot, not two/i)).toBeInTheDocument();
  });

  it("links the full Scryfall search into a new tab", async () => {
    mountWorkshop();

    const link = await screen.findByRole("link", { name: /full legal pool on Scryfall/i });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");

    const url = new URL(link.getAttribute("href")!);
    expect(url.origin + url.pathname).toBe("https://scryfall.com/search");
    expect(url.searchParams.get("q")).toContain("is:commander r:u game:paper");
    // A search that still lists a banned commander is worse than no link.
    expect(url.searchParams.get("q")).toContain('-!"Zada, Hedron Grinder"');
  });

  it("offers every other participant as a target", async () => {
    mountWorkshop();

    const select = await screen.findByRole("combobox", { name: /choose a participant/i });
    expect(
      [...(select as HTMLSelectElement).options].map((o) => o.textContent)
    ).toEqual(["Bob", "Cleo"]);
  });

  it("can be reset to where it started", async () => {
    const user = userEvent.setup();
    mountWorkshop({ t1: soloPick(testCommander("green", { name: "Green One" })) });

    await screen.findByText(/5 of 6 group picks saved/);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(screen.getByText(/4 of 6 group picks saved/)).toBeInTheDocument()
    );

    await user.click(screen.getByRole("button", { name: /reset the demo/i }));

    await waitFor(() =>
      expect(screen.getByText(/5 of 6 group picks saved/)).toBeInTheDocument()
    );
  });
});
