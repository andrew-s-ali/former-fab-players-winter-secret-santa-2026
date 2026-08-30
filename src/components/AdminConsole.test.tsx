import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminConsole } from "./AdminConsole";
import type { EventSummary } from "@/lib/admin";
import type { ExchangeVote } from "@/lib/admin";
import type { NudgeStatus } from "@/lib/nudge";

vi.mock("@/app/admin/actions", () => ({
  nudgeAction: vi.fn(),
  setRevealAction: vi.fn(),
  updateParticipantAction: vi.fn(),
}));

function summary(
  participants: EventSummary["participants"]
): EventSummary {
  return { participantCount: participants.length, revealedAt: null, participants };
}

function person(
  name: string,
  email: string,
  discord: string | null = null
): EventSummary["participants"][number] {
  return { name, email, colorVeto: null, themeVeto: null, themeWish: null, discord };
}

describe("AdminConsole, on an address that has been erased", () => {
  it("says the address is gone rather than linking to nowhere", () => {
    render(
      <AdminConsole
        pools={[]}
        poolsError={null}
        summary={summary([person("Ada", "ada@example.com"), person("Brin", "")])}
      />
    );

    expect(screen.getByRole("link", { name: "ada@example.com" })).toBeInTheDocument();
    expect(screen.getByText(/address erased at their request/i)).toBeInTheDocument();
  });

  it("keeps the erased address out of the email-everyone link", () => {
    render(
      <AdminConsole
        pools={[]}
        poolsError={null}
        summary={summary([person("Ada", "ada@example.com"), person("Brin", "")])}
      />
    );

    const link = screen.getByRole("link", { name: /email to everyone/i });
    // A trailing or doubled comma would put an empty recipient in the Bcc
    // field, which some clients refuse to send at all.
    expect(link).toHaveAttribute(
      "href",
      "mailto:?bcc=ada%40example.com"
    );
  });
});

function nudgeOf(
  outstanding: NudgeStatus["outstanding"],
  participantCount = 4
): NudgeStatus {
  const picksRequired = participantCount * (participantCount - 1);
  return {
    participantCount,
    picksRequired,
    picksIn: picksRequired - outstanding.reduce((sum, e) => sum + e.owed, 0),
    outstanding,
    complete: outstanding.length === 0,
  };
}

describe("AdminConsole, chasing outstanding picks", () => {
  const roster = summary([
    person("Ada", "ada@example.com"),
    person("Brin", "brin@example.com"),
    person("Cleo", ""),
  ]);

  it("counts per person, which is the axis for chasing somebody", () => {
    render(
      <AdminConsole
        nudge={nudgeOf([
          { name: "Brin", owed: 3, discord: null },
          { name: "Cleo", owed: 1, discord: null },
        ])}
        pools={[]}
        poolsError={null}
        summary={roster}
      />
    );

    expect(screen.getByText("8 of 12 picks are in.", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("3 picks to go")).toBeInTheDocument();
    expect(screen.getByText("1 pick to go")).toBeInTheDocument();
  });

  it("mails only the people who owe picks, and skips an erased address", () => {
    render(
      <AdminConsole
        nudge={nudgeOf([
          { name: "Brin", owed: 3, discord: null },
          { name: "Cleo", owed: 1, discord: null },
        ])}
        pools={[]}
        poolsError={null}
        summary={roster}
      />
    );

    const href = screen
      .getByRole("link", { name: /email just these people/i })
      .getAttribute("href")!;

    expect(href).toContain("bcc=brin%40example.com");
    // Ada has finished; Cleo's address was erased at their request.
    expect(href).not.toContain("ada%40example.com");
    expect(href).not.toContain(",,");
    expect(href).not.toMatch(/bcc=[^&]*,(&|$)/);
  });

  it("offers nothing to chase once everybody has finished", () => {
    render(
      <AdminConsole nudge={nudgeOf([])} pools={[]} poolsError={null} summary={roster} />
    );

    expect(screen.getByText(/Everybody has picked/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /post a nudge/i })
    ).not.toBeInTheDocument();
  });

  it("hides the section entirely when the selections could not be read", () => {
    // A database outage must not turn the reveal toggle into a broken page.
    render(
      <AdminConsole
        nudge={null}
        pools={[]}
        poolsError="connection refused"
        summary={roster}
      />
    );

    expect(screen.queryByText(/Who to chase/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /unlock \/reveal/i })).toBeInTheDocument();
  });
});

describe("AdminConsole, showing who can actually be pinged", () => {
  it("distinguishes a pinging id from a handle from nothing at all", () => {
    render(
      <AdminConsole
        nudge={null}
        pools={[]}
        poolsError={null}
        summary={summary([
          person("Ada", "ada@example.com", "185432109876543210"),
          person("Brin", "brin@example.com", "brin_the_builder"),
          person("Cleo", "cleo@example.com"),
        ])}
      />
    );

    expect(screen.getByText(/185432109876543210 — will ping/)).toBeInTheDocument();
    expect(
      screen.getByText(/@brin_the_builder — handle only, will not ping/)
    ).toBeInTheDocument();
    expect(screen.getByText(/no Discord set/)).toBeInTheDocument();
  });

  it("offers a Discord box that says how to get an id that pings", () => {
    render(
      <AdminConsole nudge={null} pools={[]} poolsError={null} summary={summary([])} />
    );

    expect(screen.getByRole("textbox", { name: /discord/i })).toBeInTheDocument();
    expect(screen.getByText(/Developer Mode/)).toBeInTheDocument();
  });
});

describe("AdminConsole, the exchange-date vote", () => {
  const vote: ExchangeVote = {
    answered: 3,
    unanswered: ["Gus"],
    tallies: [
      { date: "2026-12-12", firsts: 2, points: 8, averageRank: 1.33 },
      { date: "2026-12-05", firsts: 1, points: 6, averageRank: 2 },
      { date: "2026-12-19", firsts: 0, points: 4, averageRank: 2.67 },
    ],
    winner: "2026-12-12",
  };

  it("shows both first choices and points, since the two can disagree", () => {
    render(
      <AdminConsole
        exchangeVote={vote}
        nudge={null}
        pools={[]}
        poolsError={null}
        summary={summary([person("Ada", "ada@example.com")])}
      />
    );

    expect(screen.getByRole("columnheader", { name: /1st choices/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /points/i })).toBeInTheDocument();
    expect(screen.getByText("12 December 2026")).toBeInTheDocument();
    expect(screen.getByText(/12 December 2026 is ahead/)).toBeInTheDocument();
  });

  it("names who did not rank, and says they count toward nothing", () => {
    render(
      <AdminConsole
        exchangeVote={vote}
        nudge={null}
        pools={[]}
        poolsError={null}
        summary={summary([person("Ada", "ada@example.com")])}
      />
    );

    expect(screen.getByText(/Did not rank: Gus/)).toBeInTheDocument();
  });

  it("says plainly when nothing is ahead, rather than picking a date", () => {
    render(
      <AdminConsole
        exchangeVote={{ ...vote, winner: null }}
        nudge={null}
        pools={[]}
        poolsError={null}
        summary={summary([person("Ada", "ada@example.com")])}
      />
    );

    expect(screen.getByText(/No date is clearly ahead/)).toBeInTheDocument();
  });

  it("hides the section entirely before a draw", () => {
    render(
      <AdminConsole
        exchangeVote={null}
        nudge={null}
        pools={[]}
        poolsError={null}
        summary={summary([])}
      />
    );

    expect(screen.queryByText(/Exchange date/)).not.toBeInTheDocument();
  });
});

describe("AdminConsole, the Discord box", () => {
  function box() {
    render(
      <AdminConsole nudge={null} pools={[]} poolsError={null} summary={summary([])} />
    );
    return screen.getByRole("textbox", { name: /discord/i });
  }

  it("says how to find the numeric id before anything is typed", () => {
    box();

    expect(screen.getByText(/Developer Mode/)).toBeInTheDocument();
    expect(screen.getByText(/Copy User ID/)).toBeInTheDocument();
    // A concrete example, so the shape is recognisable.
    expect(screen.getByText(/185432109876543210/)).toBeInTheDocument();
  });

  it("confirms a user id will ping", async () => {
    const user = userEvent.setup();
    await user.type(box(), "185432109876543210");

    expect(screen.getByText(/this will ping them/i)).toBeInTheDocument();
  });

  it("warns that a handle will not notify anybody", async () => {
    // The mistake is invisible afterwards: a handle saves cleanly, looks right
    // in the roster, and silently fails on the day it matters.
    const user = userEvent.setup();
    await user.type(box(), "ada_lovelace");

    const warning = screen.getByRole("alert");
    expect(warning).toHaveTextContent(/is a handle, not an id/i);
    expect(warning).toHaveTextContent(/will not notify them/i);
  });

  it("accepts a pasted mention and shows the id it will store", async () => {
    const user = userEvent.setup();
    await user.type(box(), "<@185432109876543210>");

    expect(screen.getByText(/User id 185432109876543210/)).toBeInTheDocument();
  });

  it("explains what none does", async () => {
    const user = userEvent.setup();
    await user.type(box(), "none");

    expect(screen.getByText(/Clears their Discord/i)).toBeInTheDocument();
  });

  it("rejects something that is neither, before it can be saved", async () => {
    const user = userEvent.setup();
    await user.type(box(), "<@&123456789012345678>");

    expect(screen.getByRole("alert")).toHaveTextContent(/not a Discord handle/i);
  });
});
