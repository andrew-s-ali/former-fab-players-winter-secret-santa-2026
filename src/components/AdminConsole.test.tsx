import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminConsole } from "./AdminConsole";
import type { EventSummary } from "@/lib/admin";
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
