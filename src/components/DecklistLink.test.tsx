import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DecklistLink } from "./DecklistLink";
import * as actions from "@/app/s/actions";

vi.mock("@/app/s/actions", () => ({
  saveDecklistAction: vi.fn(),
  clearDecklistAction: vi.fn(),
}));

const KEY = "secret-santa-decklist-tok-1";
const URL_A = "https://moxfield.com/decks/abc";

function box() {
  return screen.getByRole("textbox", { name: /decklist link/i });
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(actions.saveDecklistAction).mockResolvedValue({ ok: true, message: "Saved" });
  vi.mocked(actions.clearDecklistAction).mockResolvedValue({ ok: true, message: "Removed" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("DecklistLink", () => {
  it("shows the link already saved against the token", () => {
    render(<DecklistLink savedUrl={URL_A} token="tok-1" />);

    expect(box()).toHaveValue(URL_A);
    expect(screen.getByRole("link", { name: URL_A })).toHaveAttribute("href", URL_A);
  });

  // The whole point of the change: pasting a link and clicking away used to
  // lose it silently.
  it("saves when focus leaves the box", async () => {
    const user = userEvent.setup();
    render(<DecklistLink savedUrl={null} token="tok-1" />);

    await user.type(box(), URL_A);
    await user.tab();

    await waitFor(() =>
      expect(actions.saveDecklistAction).toHaveBeenCalledWith("tok-1", URL_A)
    );
    expect(await screen.findByText("Saved to your link")).toBeInTheDocument();
  });

  it("still saves from the button", async () => {
    const user = userEvent.setup();
    render(<DecklistLink savedUrl={null} token="tok-1" />);

    await user.type(box(), URL_A);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(actions.saveDecklistAction).toHaveBeenCalledWith("tok-1", URL_A)
    );
  });

  it("does not save on blur when nothing changed", async () => {
    const user = userEvent.setup();
    render(<DecklistLink savedUrl={URL_A} token="tok-1" />);

    await user.click(box());
    await user.tab();

    expect(actions.saveDecklistAction).not.toHaveBeenCalled();
  });

  // Tabbing out of a half-typed URL is ordinary; it must not fire a doomed
  // request or shout at the participant mid-thought.
  it("reports a half-typed link on blur without calling the server", async () => {
    const user = userEvent.setup();
    render(<DecklistLink savedUrl={null} token="tok-1" />);

    await user.type(box(), "moxfield.com/dec");
    await user.tab();

    expect(await screen.findByRole("alert")).toHaveTextContent(/doesn't look like a link/i);
    expect(actions.saveDecklistAction).not.toHaveBeenCalled();
    expect(box()).toHaveValue("moxfield.com/dec");
  });

  it("refuses a javascript: link", async () => {
    const user = userEvent.setup();
    render(<DecklistLink savedUrl={null} token="tok-1" />);

    await user.type(box(), "javascript:alert(1)");
    await user.tab();

    expect(await screen.findByRole("alert")).toHaveTextContent(/https/i);
    expect(actions.saveDecklistAction).not.toHaveBeenCalled();
  });

  it("explains that emptying the box is not how you remove a saved link", async () => {
    const user = userEvent.setup();
    render(<DecklistLink savedUrl={URL_A} token="tok-1" />);

    await user.clear(box());
    await user.tab();

    expect(await screen.findByRole("status")).toHaveTextContent(/use Remove/i);
    expect(actions.saveDecklistAction).not.toHaveBeenCalled();
  });

  it("removes the saved link on Remove", async () => {
    const user = userEvent.setup();
    render(<DecklistLink savedUrl={URL_A} token="tok-1" />);

    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(actions.clearDecklistAction).toHaveBeenCalledWith("tok-1"));
    expect(screen.queryByRole("link", { name: URL_A })).toBeNull();
  });

  it("mirrors typing to a local draft and clears it once saved", async () => {
    const user = userEvent.setup();
    render(<DecklistLink savedUrl={null} token="tok-1" />);

    await user.type(box(), URL_A);
    expect(localStorage.getItem(KEY)).toBe(URL_A);

    await user.tab();
    await waitFor(() => expect(localStorage.getItem(KEY)).toBeNull());
  });

  it("keeps the draft when the save fails, and says so", async () => {
    vi.mocked(actions.saveDecklistAction).mockResolvedValue({
      ok: false,
      error: "Database unreachable.",
    });
    const user = userEvent.setup();
    render(<DecklistLink savedUrl={null} token="tok-1" />);

    await user.type(box(), URL_A);
    await user.tab();

    expect(await screen.findByRole("alert")).toHaveTextContent(/Database unreachable/);
    expect(localStorage.getItem(KEY)).toBe(URL_A);
    expect(box()).toHaveValue(URL_A);
  });

  it("restores and saves a valid draft a previous visit never finished saving", async () => {
    localStorage.setItem(KEY, URL_A);

    render(<DecklistLink savedUrl={null} token="tok-1" />);

    expect(box()).toHaveValue(URL_A);
    expect(await screen.findByRole("status")).toHaveTextContent(/Restored a link/i);
    await waitFor(() =>
      expect(actions.saveDecklistAction).toHaveBeenCalledWith("tok-1", URL_A)
    );
  });

  // Restoring an unfinished URL should not greet them with an error they did
  // not just cause.
  it("restores a half-typed draft without saving it or erroring", async () => {
    localStorage.setItem(KEY, "moxfield.com/dec");

    render(<DecklistLink savedUrl={null} token="tok-1" />);

    expect(box()).toHaveValue("moxfield.com/dec");
    expect(await screen.findByRole("status")).toHaveTextContent(/Restored a link/i);
    expect(actions.saveDecklistAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps drafts isolated between tokens", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<DecklistLink savedUrl={null} token="tok-1" />);
    await user.type(box(), URL_A);
    unmount();

    render(<DecklistLink savedUrl={null} token="tok-2" />);
    expect(box()).toHaveValue("");
  });
});
