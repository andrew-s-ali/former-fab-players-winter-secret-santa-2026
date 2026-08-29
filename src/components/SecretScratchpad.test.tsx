import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SecretScratchpad } from "./SecretScratchpad";
import * as actions from "@/app/s/actions";

vi.mock("@/app/s/actions", () => ({
  saveNotesAction: vi.fn(),
}));

const KEY = "secret-santa-scratchpad-tok-1";

/**
 * Comfortably longer than the component's one-second save debounce.
 *
 * Testing Library's default wait is also one second, so anything waiting on
 * the debounce was racing it — passing alone and failing under the load of a
 * full run. The wait has to outlast the thing it is waiting for.
 */
const PAST_DEBOUNCE = { timeout: 4000 };

function notesBox() {
  return screen.getByRole("textbox", { name: /private notes/i });
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(actions.saveNotesAction).mockResolvedValue({ ok: true, message: "Saved" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("SecretScratchpad", () => {
  it("shows the notes already saved against the link", () => {
    render(<SecretScratchpad initialNotes="from the server" token="tok-1" />);

    expect(notesBox()).toHaveValue("from the server");
  });

  it("starts empty when nothing has been saved", () => {
    render(<SecretScratchpad initialNotes="" token="tok-1" />);

    expect(notesBox()).toHaveValue("");
  });

  it("saves to the server a moment after typing stops", async () => {
    const user = userEvent.setup();
    render(<SecretScratchpad initialNotes="" token="tok-1" />);

    await user.type(notesBox(), "elves");

    await waitFor(
      () => expect(actions.saveNotesAction).toHaveBeenCalledWith("tok-1", "elves"),
      PAST_DEBOUNCE
    );
    expect(
      await screen.findByText("Saved to your link", undefined, PAST_DEBOUNCE)
    ).toBeInTheDocument();
  });

  // A debounce long enough to be useful is long enough to lose a paragraph,
  // so every keystroke is mirrored locally until the server confirms.
  it("mirrors keystrokes to a local draft and clears it once saved", async () => {
    const user = userEvent.setup();
    render(<SecretScratchpad initialNotes="" token="tok-1" />);

    await user.type(notesBox(), "wip");
    expect(localStorage.getItem(KEY)).toBe("wip");

    await waitFor(() => expect(localStorage.getItem(KEY)).toBeNull(), PAST_DEBOUNCE);
  });

  it("keeps the draft when the save fails, and says so", async () => {
    vi.mocked(actions.saveNotesAction).mockResolvedValue({
      ok: false,
      error: "Database unreachable.",
    });
    const user = userEvent.setup();
    render(<SecretScratchpad initialNotes="" token="tok-1" />);

    await user.type(notesBox(), "wip");

    expect(
      await screen.findByRole("alert", undefined, PAST_DEBOUNCE)
    ).toHaveTextContent(/Database unreachable/);
    expect(localStorage.getItem(KEY)).toBe("wip");
    expect(notesBox()).toHaveValue("wip");
  });

  it("restores and saves a draft a previous visit never finished saving", async () => {
    localStorage.setItem(KEY, "unsaved paragraph");

    render(<SecretScratchpad initialNotes="older server copy" token="tok-1" />);

    expect(notesBox()).toHaveValue("unsaved paragraph");
    expect(await screen.findByRole("status")).toHaveTextContent(/Restored notes/i);
    await waitFor(() =>
      expect(actions.saveNotesAction).toHaveBeenCalledWith("tok-1", "unsaved paragraph")
    );
  });

  it("does not treat a draft equal to the saved notes as a recovery", () => {
    localStorage.setItem(KEY, "same");

    render(<SecretScratchpad initialNotes="same" token="tok-1" />);

    expect(screen.queryByRole("status")).toBeNull();
    expect(actions.saveNotesAction).not.toHaveBeenCalled();
  });

  it("saves immediately on blur rather than waiting out the debounce", async () => {
    const user = userEvent.setup();
    render(<SecretScratchpad initialNotes="" token="tok-1" />);

    await user.type(notesBox(), "quick");
    await user.tab();

    await waitFor(() =>
      expect(actions.saveNotesAction).toHaveBeenCalledWith("tok-1", "quick")
    );
  });

  it("keeps drafts isolated between tokens", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SecretScratchpad initialNotes="" token="tok-1" />);
    await user.type(notesBox(), "ada");
    unmount();

    render(<SecretScratchpad initialNotes="" token="tok-2" />);
    expect(notesBox()).toHaveValue("");
  });

  it("says where the notes are kept, rather than promising they never travel", () => {
    render(<SecretScratchpad initialNotes="" token="tok-1" />);

    expect(
      screen.getByText(/save against your private link rather than to this browser/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/stored on the server/i)).toBeInTheDocument();
  });

  // The old component promised notes never left the browser. They do now, and
  // nothing in the UI may still claim otherwise.
  it("no longer claims the notes are never sent to a server", async () => {
    const source = await readFile("src/components/SecretScratchpad.tsx", "utf8");

    expect(source).not.toMatch(/never sent to a server/i);
    expect(source).not.toMatch(/stored only in this browser/i);
  });
});
