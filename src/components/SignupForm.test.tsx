import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignupForm } from "./SignupForm";
import { SIGNUP_ACTION } from "@/lib/signup";

const option = (id: string, name: string, colorIdentity: string[] = ["G"]) => ({
  id,
  name,
  colorIdentity,
  imageUrl: null,
});

const OPTIONS = [
  option("a", "Anara, Wolvid Familiar", ["G"]),
  option("b", "Selvala, Explorer Returned", ["G", "W"]),
  option("c", "Zurgo Bellstriker", ["R"]),
];

/**
 * One mock for both callers: the form GETs the legal-commander list on mount,
 * and POSTs the sign-up to the Netlify skeleton file.
 */
function mockFetch(commanders = OPTIONS) {
  const fetchMock = vi.fn((url: string, _init?: RequestInit) =>
    Promise.resolve(
      url === SIGNUP_ACTION
        ? new Response("", { status: 200 })
        : new Response(JSON.stringify({ commanders }), { status: 200 })
    )
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Types into the combobox and commits the named option. */
async function pick(user: ReturnType<typeof userEvent.setup>, name: string) {
  const input = await screen.findByRole("combobox", { name: /find your/i });
  await user.clear(input);
  await user.type(input, name.slice(0, 6));
  await user.click(await screen.findByRole("option", { name }));
}

function submittedFields(fetchMock: ReturnType<typeof mockFetch>) {
  const call = fetchMock.mock.calls.find(([url]) => url === SIGNUP_ACTION);
  return new URLSearchParams(call?.[1]?.body as string);
}

beforeEach(() => {
  mockFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SignupForm", () => {
  it("offers every legal commander before anything is typed", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    await user.click(await screen.findByRole("combobox", { name: /find your/i }));

    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getAllByRole("option")).toHaveLength(OPTIONS.length);
  });

  it("filters the list by what is typed", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    await user.type(
      await screen.findByRole("combobox", { name: /find your/i }),
      "selv"
    );

    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Selvala, Explorer Returned");
  });

  it("can be driven entirely from the keyboard", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    const input = await screen.findByRole("combobox", { name: /find your/i });
    await user.type(input, "anara");
    // ArrowDown moves the active option; Enter commits it.
    await user.keyboard("{ArrowDown}{Enter}");

    expect(screen.getByText("Anara, Wolvid Familiar")).toBeInTheDocument();
  });

  it("will not submit until two commanders are chosen", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    expect(screen.getByRole("button", { name: "Sign me up" })).toBeDisabled();

    await pick(user, "Anara, Wolvid Familiar");
    expect(screen.getByRole("button", { name: "Sign me up" })).toBeDisabled();

    await pick(user, "Selvala, Explorer Returned");
    expect(screen.getByRole("button", { name: "Sign me up" })).toBeEnabled();
  });

  it("sends both picks as card names, alongside the rest of the form", async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    render(<SignupForm />);

    await user.type(screen.getByLabelText(/Your name/), "Ada");
    await user.type(screen.getByLabelText(/Your email/), "ada@example.com");
    await pick(user, "Anara, Wolvid Familiar");
    await pick(user, "Selvala, Explorer Returned");
    await user.click(screen.getByRole("button", { name: "Sign me up" }));

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());

    const fields = submittedFields(fetchMock);
    expect(fields.get("name")).toBe("Ada");
    expect(fields.get("email")).toBe("ada@example.com");
    expect(fields.get("selfCard1")).toBe("Anara, Wolvid Familiar");
    expect(fields.get("selfCard2")).toBe("Selvala, Explorer Returned");
    // Without this Netlify does not attribute the submission and drops it.
    expect(fields.get("form-name")).toBe("santa-signup");
  });

  it("stops offering a card once it has been picked", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    await pick(user, "Anara, Wolvid Familiar");
    await user.click(screen.getByRole("combobox", { name: /find your/i }));

    const names = within(screen.getByRole("listbox"))
      .getAllByRole("option")
      .map((node) => node.textContent);
    expect(names).not.toContain("Anara, Wolvid Familiar");
  });

  it("hides the picker once two are chosen, and shows it again after a removal", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    await pick(user, "Anara, Wolvid Familiar");
    await pick(user, "Selvala, Explorer Returned");
    expect(screen.queryByRole("combobox", { name: /find your/i })).toBeNull();

    await user.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    expect(
      await screen.findByRole("combobox", { name: /find your/i })
    ).toBeInTheDocument();
  });

  // Picking a card and then changing the veto underneath it is an ordinary
  // thing to do on a form; the draw would otherwise reject the submission
  // hours later, with nobody around to ask.
  it("drops a pick that the newly chosen colour veto forbids", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    await pick(user, "Anara, Wolvid Familiar");
    await pick(user, "Zurgo Bellstriker");

    await user.selectOptions(
      screen.getByLabelText(/colour you.d rather not receive/i),
      "red"
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      /Zurgo Bellstriker was removed/
    );
    expect(screen.getByRole("button", { name: "Sign me up" })).toBeDisabled();
  });

  it("drops vetoed colours out of the dropdown without refetching", async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    render(<SignupForm />);

    await screen.findByRole("combobox", { name: /find your/i });
    const before = fetchMock.mock.calls.length;

    await user.selectOptions(
      screen.getByLabelText(/colour you.d rather not receive/i),
      "red"
    );
    await user.click(screen.getByRole("combobox", { name: /find your/i }));

    const names = within(screen.getByRole("listbox"))
      .getAllByRole("option")
      .map((node) => node.textContent);
    expect(names).not.toContain("Zurgo Bellstriker");
    // The whole point of filtering client-side: no second request.
    expect(fetchMock.mock.calls).toHaveLength(before);
  });

  it("links to the full browser in a new tab so the form is not lost", async () => {
    render(<SignupForm />);

    const link = await screen.findByRole("link", {
      name: /browse every legal commander/i,
    });
    expect(link).toHaveAttribute("href", "/commanders");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("says so when the card list cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("", { status: 500 })))
    );
    render(<SignupForm />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Couldn.t load the card list/
    );
  });
});
