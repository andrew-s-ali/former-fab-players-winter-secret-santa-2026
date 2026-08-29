import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HONEYPOT_FIELD,
  SIGNUP_FIELDS,
  SIGNUP_FORM_NAME,
  blankToNull,
  dedupeSignups,
  normalizeSignup,
  parseColorWord,
  resolveSelfCards,
  signupsOpen,
  type ParticipantInput,
  type SignupEntry,
} from "./signup";
import type { Commander } from "./scryfall/types";

/** The fields every valid submission must carry. */
const EMAIL = "ada@example.com";
const REQUIRED = { email: EMAIL };
const PICKS = { selfCard1: "Ada's First", selfCard2: "Ada's Second" };
const PICKED = [
  { commander: "Ada's First", partner: null },
  { commander: "Ada's Second", partner: null },
];

function entry(name: string, submittedAt: string): SignupEntry {
  return {
    input: {
      name,
      email: "someone@example.com",
      colorVeto: null,
      themeVeto: null,
      themeWish: null,
      selfCards: [
        { commander: "First", partner: null },
        { commander: "Second", partner: null },
      ],
    },
    submittedAt,
  };
}

function commander(
  name: string,
  colorIdentity: string[] = [],
  id = name.toLowerCase().replace(/\W+/g, "-")
): Commander {
  return {
    id,
    name,
    manaCost: "{1}{G}",
    typeLine: "Legendary Creature — Elf",
    oracleText: "",
    colorIdentity,
    imageUrl: null,
    scryfallUrl: `https://scryfall.com/card/${id}`,
    hasPartner: false,
    setName: "Test Set",
    rarity: "uncommon",
    canPair: false,
    priceUsd: "1.00",
    priceIsFoil: false,
    pairingRole: null,
  };
}

function input(overrides: Partial<ParticipantInput> = {}): ParticipantInput {
  return {
    name: "Ada",
    email: EMAIL,
    colorVeto: null,
    themeVeto: null,
    themeWish: null,
    selfCards: [
      { commander: "Green One", partner: null },
      { commander: "Blue One", partner: null },
    ],
    ...overrides,
  };
}

describe("blankToNull", () => {
  it("treats blank, whitespace and 'no preference' as unset", () => {
    expect(blankToNull(undefined)).toBeNull();
    expect(blankToNull("   ")).toBeNull();
    expect(blankToNull("No Preference")).toBeNull();
  });

  it("trims anything else", () => {
    expect(blankToNull("  elves ")).toBe("elves");
  });
});

describe("parseColorWord", () => {
  it("maps colour words to codes case-insensitively", () => {
    expect(parseColorWord("Red", "Ada")).toBe("R");
    expect(parseColorWord("blue", "Ada")).toBe("U");
  });

  it("passes null through", () => {
    expect(parseColorWord(null, "Ada")).toBeNull();
  });

  it("names the person in the error, not just the colour", () => {
    expect(() => parseColorWord("Crimson", "Ada")).toThrow(/Crimson/);
    expect(() => parseColorWord("Crimson", "Ada")).toThrow(/Ada/);
  });
});

describe("normalizeSignup", () => {
  it("normalises a full submission", () => {
    expect(
      normalizeSignup(
        {
          name: " Ada ",
          ...REQUIRED,
          colorVeto: "Red",
          themeWish: "elves",
          themeVeto: "mill",
          selfCard1: "  Llanowar Elf  ",
          selfCard2: "Deep Gnome",
        },
        "test"
      )
    ).toEqual({
      name: "Ada",
      email: EMAIL,
      colorVeto: "R",
      themeVeto: "mill",
      themeWish: "elves",
      selfCards: [
        { commander: "Llanowar Elf", partner: null },
        { commander: "Deep Gnome", partner: null },
      ],
    });
  });

  it("leaves every optional field null when only the required ones are given", () => {
    expect(normalizeSignup({ name: "Ada", ...REQUIRED, ...PICKS }, "test")).toEqual({
      name: "Ada",
      email: EMAIL,
      colorVeto: null,
      themeVeto: null,
      themeWish: null,
      selfCards: PICKED,
    });
  });

  // Required, because a roster without addresses cannot be used to send the
  // private links, which is the whole reason it is collected.
  it("rejects a submission with no email, naming the person and the source", () => {
    expect(() =>
      normalizeSignup({ name: "Ada", ...PICKS }, "Row 4 of the CSV")
    ).toThrow(/Row 4 of the CSV/);
    expect(() => normalizeSignup({ name: "Ada", ...PICKS }, "test")).toThrow(/Ada/);
  });

  it("rejects something that is not shaped like an address", () => {
    expect(() =>
      normalizeSignup({ name: "Ada", email: "ada at example", ...PICKS }, "test")
    ).toThrow(/not shaped like an email/);
  });

  it("trims the address", () => {
    expect(
      normalizeSignup({ name: "Ada", email: "  ada@example.com ", ...PICKS }, "test")
        .email
    ).toBe("ada@example.com");
  });

  it("labels an empty name with where it came from", () => {
    expect(() => normalizeSignup({ name: "  ", ...REQUIRED, ...PICKS }, "Row 4 of the CSV")).toThrow(
      /Row 4 of the CSV/
    );
  });

  // The two card picks are not preferences the organiser can shrug off: a
  // missing one leaves a pool two cards short, which only shows up much later
  // as an exchange that will not unlock.
  it("rejects a submission missing a card pick, naming the person and the source", () => {
    expect(() =>
      normalizeSignup({ name: "Ada", ...REQUIRED, selfCard1: "Only One" }, "Row 4 of the CSV")
    ).toThrow(/Row 4 of the CSV/);
    expect(() =>
      normalizeSignup({ name: "Ada", ...REQUIRED, selfCard1: "Only One" }, "Row 4 of the CSV")
    ).toThrow(/Ada/);
  });

  it("rejects two picks that share a card", () => {
    expect(() =>
      normalizeSignup(
        { name: "Ada", ...REQUIRED, selfCard1: "Llanowar Elf", selfCard2: "llanowar elf" },
        "test"
      )
    ).toThrow(/both of its picks/);
  });

  it("reads a partner alongside its commander", () => {
    expect(
      normalizeSignup(
        {
          name: "Ada",
          ...REQUIRED,
          selfCard1: "Alena",
          selfCard1Partner: "Halana",
          selfCard2: "Deep Gnome",
        },
        "test"
      ).selfCards
    ).toEqual([
      { commander: "Alena", partner: "Halana" },
      { commander: "Deep Gnome", partner: null },
    ]);
  });

  // Overlap, not just exact repetition: the same commander under two pairings
  // would make a four-option shortlist read as two.
  it("rejects picks that share only a partner", () => {
    expect(() =>
      normalizeSignup(
        {
          name: "Ada",
          ...REQUIRED,
          selfCard1: "Alena",
          selfCard1Partner: "Halana",
          selfCard2: "Kediss",
          selfCard2Partner: "halana",
        },
        "test"
      )
    ).toThrow(/both of its picks/);
  });
});

describe("resolveSelfCards", () => {
  const pool = [
    commander("Green One", ["G"]),
    commander("Blue One", ["U"]),
    commander("Zada, Hedron Grinder", ["R"]),
  ];

  it("resolves names to pool cards, case-insensitively", () => {
    expect(
      resolveSelfCards(
        input({
          selfCards: [
            { commander: "green one", partner: null },
            { commander: "BLUE ONE", partner: null },
          ],
        }),
        pool
      )
    ).toEqual([
      { commander: pool[0], partner: null },
      { commander: pool[1], partner: null },
    ]);
  });

  it("rejects a name that is not in the pool", () => {
    expect(() =>
      resolveSelfCards(
        input({
          selfCards: [
            { commander: "Green One", partner: null },
            { commander: "Made Up", partner: null },
          ],
        }),
        pool
      )
    ).toThrow(/Made Up/);
  });

  // Reachable without any bad faith: the form lets you pick a card and then
  // change the veto underneath it.
  it("rejects a pick carrying the person's own vetoed colour", () => {
    expect(() =>
      resolveSelfCards(
        input({
          colorVeto: "G",
          selfCards: [
            { commander: "Green One", partner: null },
            { commander: "Blue One", partner: null },
          ],
        }),
        pool
      )
    ).toThrow(/Green One/);
  });

  it("rejects a banned commander", () => {
    expect(() =>
      resolveSelfCards(
        input({
          selfCards: [
            { commander: "Zada, Hedron Grinder", partner: null },
            { commander: "Blue One", partner: null },
          ],
        }),
        pool
      )
    ).toThrow(/Zada/);
  });
});

describe("dedupeSignups", () => {
  it("keeps distinct names in order", () => {
    const { inputs, superseded } = dedupeSignups([
      entry("Ada", "2026-09-01"),
      entry("Bob", "2026-09-02"),
    ]);

    expect(inputs.map((i) => i.name)).toEqual(["Ada", "Bob"]);
    expect(superseded).toEqual([]);
  });

  it("rejects duplicates by default, naming the person", () => {
    expect(() =>
      dedupeSignups([entry("Ada", "2026-09-01"), entry("ada", "2026-09-02")])
    ).toThrow(/both named/i);
  });

  it("keeps the newest submission per name under --latest-wins", () => {
    const first: SignupEntry = {
      input: input({ colorVeto: "R" }),
      submittedAt: "2026-09-01",
    };
    const second: SignupEntry = {
      input: input({ colorVeto: "G" }),
      submittedAt: "2026-09-02",
    };

    const { inputs, superseded } = dedupeSignups([first, second], { latestWins: true });

    expect(inputs).toEqual([second.input]);
    expect(superseded).toHaveLength(1);
    expect(superseded[0]).toContain("2026-09-01");
  });

  it("keeps the newest even when submissions arrive out of order", () => {
    const newer: SignupEntry = {
      input: input({ colorVeto: "G" }),
      submittedAt: "2026-09-05",
    };

    const { inputs } = dedupeSignups(
      [newer, entry("Ada", "2026-09-01")],
      { latestWins: true }
    );

    expect(inputs).toEqual([newer.input]);
  });
});

describe("dedupeSignups carrying extra fields", () => {
  // The database path attaches its already-resolved commanders to the entry.
  // Without the generic it would have to re-implement this whole policy.
  type WithCards = SignupEntry & { cards: string[] };

  it("returns the winning entry, not just its input", () => {
    const older: WithCards = {
      input: input({ themeWish: "old" }),
      submittedAt: "2026-09-01",
      cards: ["a", "b"],
    };
    const newer: WithCards = {
      input: input({ themeWish: "new" }),
      submittedAt: "2026-09-04",
      cards: ["c", "d"],
    };

    const { entries, inputs } = dedupeSignups<WithCards>([older, newer], {
      latestWins: true,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].cards).toEqual(["c", "d"]);
    // `inputs` stays the same list, projected, so the CSV path is unchanged.
    expect(inputs).toEqual([newer.input]);
  });
});

describe("signupsOpen", () => {
  it("is open well before the closing date", () => {
    expect(signupsOpen(new Date("2026-08-19T12:00:00Z"))).toBe(true);
  });

  it("is closed once the closing date has arrived", () => {
    expect(signupsOpen(new Date("2026-09-18T00:00:00Z"))).toBe(false);
  });

  it("agrees with the home page countdown rather than using its own date rule", () => {
    // The form and the countdown must never disagree about the same instant;
    // both derive from countdownPhase, so this pins the boundary they share.
    expect(signupsOpen(new Date("2026-09-16T23:59:00Z"))).toBe(true);
    expect(signupsOpen(new Date("2026-09-17T00:00:01Z"))).toBe(false);
  });
});

describe("public/__forms.html", () => {
  // Netlify validates a submission's field names against the registered form
  // and drops mismatches without an error — no rejection, no log, the sign-up
  // simply never exists. Nothing else in the stack catches that, so it is
  // pinned here: the skeleton file must declare exactly what the form sends.
  // Resolved from the repo root: Vitest does not give this module a file:
  // URL to walk up from, and it always runs with the project root as cwd.
  const skeleton = readFileSync(
    join(process.cwd(), "public/__forms.html"),
    "utf8"
  );

  const declared = new Set(
    [...skeleton.matchAll(/name="([^"]+)"/g)].map((match) => match[1])
  );

  it("registers the form under the name the importer looks for", () => {
    expect(declared).toContain(SIGNUP_FORM_NAME);
  });

  it("declares every field the rendered form submits", () => {
    for (const field of Object.values(SIGNUP_FIELDS)) {
      expect(declared).toContain(field);
    }
  });

  it("declares the hidden form-name input and the honeypot", () => {
    expect(declared).toContain("form-name");
    expect(declared).toContain(HONEYPOT_FIELD);
  });

  it("marks itself for Netlify's deploy-time scan", () => {
    expect(skeleton).toContain('data-netlify="true"');
    expect(skeleton).toContain(`netlify-honeypot="${HONEYPOT_FIELD}"`);
  });
});
