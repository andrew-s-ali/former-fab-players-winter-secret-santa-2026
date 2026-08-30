import { describe, expect, it } from "vitest";
import {
  describePlan,
  isRedacted,
  isRunnable,
  planForget,
  redactParticipant,
  type SignupRow,
  type SubmissionRow,
} from "./forget";
import type { EventData, Participant } from "./participants";
import { testSelfCards } from "@/test-support/cards";

function participant(name: string, recipientId: string): Participant {
  return {
    id: name.toLowerCase(),
    name,
    email: `${name.toLowerCase()}@example.com`,
    recipientId,
    token: `token-${name.toLowerCase()}`,
    colorVeto: "R",
    themeVeto: "mill",
    themeWish: "elves",
    discord: "185432109876543210",
    selfCards: testSelfCards(name.toLowerCase()),
  };
}

/** Ada → Brin → Cleo → Ada. */
function drawnEvent(): EventData {
  return {
    participants: [
      participant("Ada", "brin"),
      participant("Brin", "cleo"),
      participant("Cleo", "ada"),
    ],
    revealedAt: null,
  };
}

const signups: SignupRow[] = [
  { id: "sign-ada", name: "Ada" },
  { id: "sign-brin", name: "Brin" },
  { id: "sign-cleo", name: "Cleo" },
];

const submissions: SubmissionRow[] = [
  { id: "sub-ada", name: "Ada", createdAt: "2026-01-01T00:00:00Z" },
  { id: "sub-brin", name: "Brin", createdAt: "2026-01-02T00:00:00Z" },
];

const noDraw: EventData = { participants: [], revealedAt: null };

describe("redactParticipant", () => {
  it("removes the personal fields and keeps everything the ring needs", () => {
    const before = participant("Ada", "brin");
    const after = redactParticipant(before);

    expect(after.email).toBe("");
    expect(after.themeVeto).toBeNull();
    expect(after.themeWish).toBeNull();
    // Identifies an account, so it goes with the address.
    expect(after.discord).toBeNull();

    // All load-bearing after a draw: the cycle, the private link, and two
    // cards already sitting in other people's shortlists.
    expect(after.id).toBe(before.id);
    expect(after.name).toBe("Ada");
    expect(after.recipientId).toBe("brin");
    expect(after.token).toBe(before.token);
    expect(after.selfCards).toEqual(before.selfCards);
    expect(isRedacted(after)).toBe(true);
    expect(isRedacted(before)).toBe(false);
  });
});

describe("planForget — one person, before the draw", () => {
  it("deletes their sign-up row and their form submission", () => {
    const plan = planForget({
      event: noDraw,
      signups,
      submissions,
      target: { name: "Ada", redact: false },
    });

    expect(isRunnable(plan)).toBe(true);
    expect(plan.signupIds).toEqual(["sign-ada"]);
    expect(plan.submissionIds).toEqual(["sub-ada"]);
    // Nobody else is touched.
    expect(plan.wipeSignups).toBe(false);
    expect(plan.wipeEventStore).toBe(false);
    expect(plan.redactIds).toEqual([]);
  });

  it("matches the name case-insensitively, as every other lookup here does", () => {
    const plan = planForget({
      event: noDraw,
      signups,
      submissions,
      target: { name: "  aDa  ", redact: false },
    });

    expect(plan.signupIds).toEqual(["sign-ada"]);
  });

  it("removes both rows when somebody submitted twice", () => {
    const plan = planForget({
      event: noDraw,
      signups: [...signups, { id: "sign-ada-2", name: "ada" }],
      submissions,
      target: { name: "Ada", redact: false },
    });

    expect(plan.signupIds).toEqual(["sign-ada", "sign-ada-2"]);
  });

  it("refuses, and names who it does know, when nothing matches", () => {
    const plan = planForget({
      event: drawnEvent(),
      signups,
      submissions,
      target: { name: "Nobody", redact: false },
    });

    expect(isRunnable(plan)).toBe(false);
    expect(plan.refusals[0]).toContain("Ada, Brin, Cleo");
  });
});

describe("planForget — one person, after the draw", () => {
  it("refuses a plain delete and says who would be left with nobody", () => {
    const plan = planForget({
      event: drawnEvent(),
      signups,
      submissions,
      target: { name: "Brin", redact: false },
    });

    expect(isRunnable(plan)).toBe(false);
    // Ada builds for Brin, so Ada is the one stranded.
    expect(plan.refusals[0]).toContain("Ada");
    expect(plan.refusals[0]).toContain("--redact");
    // A refused plan must not carry work with it.
    expect(describePlan(plan)[0]).toContain("✖");
  });

  it("redacts in place, and takes the sign-up, submission and notes with it", () => {
    const plan = planForget({
      event: drawnEvent(),
      signups,
      submissions,
      target: { name: "Brin", redact: true },
    });

    expect(isRunnable(plan)).toBe(true);
    expect(plan.redactIds).toEqual(["brin"]);
    expect(plan.signupIds).toEqual(["sign-brin"]);
    expect(plan.submissionIds).toEqual(["sub-brin"]);
    // The free-text notes are the one thing whose contents cannot be reasoned
    // about, so the whole row goes.
    expect(plan.deckBuildIds).toEqual(["brin"]);
    // The ring survives.
    expect(plan.wipeEventStore).toBe(false);
    expect(plan.wipeSelections).toBe(false);
  });

  it("says plainly that the name stays", () => {
    const plan = planForget({
      event: drawnEvent(),
      signups,
      submissions,
      target: { name: "Brin", redact: true },
    });

    expect(plan.notes.join(" ")).toContain("name");
    expect(plan.notes.join(" ")).toContain("--everyone");
  });
});

describe("planForget — the whole event", () => {
  it("wipes every table and every copy of the event file", () => {
    const plan = planForget({
      event: drawnEvent(),
      signups,
      submissions,
      target: { everyone: true },
    });

    expect(isRunnable(plan)).toBe(true);
    expect(plan.wipeEventStore).toBe(true);
    expect(plan.wipeSignups).toBe(true);
    expect(plan.wipeDeckBuilds).toBe(true);
    expect(plan.wipeSelections).toBe(true);
    expect(plan.submissionIds).toEqual(["sub-ada", "sub-brin"]);
  });

  it("empties the tables rather than listing ids, so orphans go too", () => {
    // A withdrawn sign-up and a stale deck build belong to nobody in the
    // event; an id list built from the participants could never reach them.
    const plan = planForget({
      event: drawnEvent(),
      signups: [...signups, { id: "sign-ghost", name: "Withdrew Early" }],
      submissions,
      target: { everyone: true },
    });

    expect(plan.wipeSignups).toBe(true);
    expect(plan.signupIds).toEqual([]);
  });

  it("warns that the private links stop working", () => {
    const plan = planForget({
      event: drawnEvent(),
      signups,
      submissions,
      target: { everyone: true },
    });

    expect(plan.notes.join(" ")).toContain("private link");
  });
});

describe("planForget — Netlify Forms", () => {
  it("warns loudly when Forms was never checked", () => {
    const plan = planForget({
      event: noDraw,
      signups,
      submissions: null,
      target: { name: "Ada", redact: false },
    });

    // Still runnable — the rest is worth deleting — but the operator has to
    // know the copy that outlives all of this was not touched.
    expect(isRunnable(plan)).toBe(true);
    const notes = plan.notes.join(" ");
    expect(notes).toContain("NOT checked");
    expect(notes).toContain("Netlify UI > Forms > santa-signup");
    expect(notes).toContain("Spam");
  });

  it("stays quiet when Forms was checked and held nothing of theirs", () => {
    const plan = planForget({
      event: noDraw,
      signups,
      submissions: [],
      target: { name: "Ada", redact: false },
    });

    expect(plan.notes.join(" ")).not.toContain("NOT checked");
    expect(plan.submissionIds).toEqual([]);
  });

  it("still finds somebody who exists only as a submission", () => {
    // Akismet held their sign-up back, so it never reached the database.
    const plan = planForget({
      event: noDraw,
      signups: [],
      submissions: [
        { id: "sub-ghost", name: "Held Back", createdAt: "2026-01-03T00:00:00Z" },
      ],
      target: { name: "Held Back", redact: false },
    });

    expect(isRunnable(plan)).toBe(true);
    expect(plan.submissionIds).toEqual(["sub-ghost"]);
  });
});

describe("describePlan", () => {
  it("lists each step and does not claim more than the plan does", () => {
    const lines = describePlan(
      planForget({
        event: drawnEvent(),
        signups,
        submissions,
        target: { name: "Brin", redact: true },
      })
    ).join("\n");

    expect(lines).toContain("Redacting Brin");
    expect(lines).toContain("signups");
    expect(lines).toContain("deck_builds");
    expect(lines).toContain("Netlify Forms submission");
    expect(lines).not.toContain("event.backup");
  });

  it("names the backups in the full wipe, since they are the easy thing to miss", () => {
    const lines = describePlan(
      planForget({
        event: drawnEvent(),
        signups,
        submissions,
        target: { everyone: true },
      })
    ).join("\n");

    expect(lines).toContain("event.backup-*.json");
  });
});
