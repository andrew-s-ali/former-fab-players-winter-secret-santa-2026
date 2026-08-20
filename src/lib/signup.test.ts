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
  signupsOpen,
  type SignupEntry,
} from "./signup";

function entry(name: string, submittedAt: string): SignupEntry {
  return {
    input: { name, colorVeto: null, themeVeto: null, themeWish: null },
    submittedAt,
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
        { name: " Ada ", colorVeto: "Red", themeWish: "elves", themeVeto: "mill" },
        "test"
      )
    ).toEqual({ name: "Ada", colorVeto: "R", themeVeto: "mill", themeWish: "elves" });
  });

  it("leaves every optional field null when the form was left empty", () => {
    expect(normalizeSignup({ name: "Ada" }, "test")).toEqual({
      name: "Ada",
      colorVeto: null,
      themeVeto: null,
      themeWish: null,
    });
  });

  it("labels an empty name with where it came from", () => {
    expect(() => normalizeSignup({ name: "  " }, "Row 4 of the CSV")).toThrow(
      /Row 4 of the CSV/
    );
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
      input: { name: "Ada", colorVeto: "R", themeVeto: null, themeWish: null },
      submittedAt: "2026-09-01",
    };
    const second: SignupEntry = {
      input: { name: "Ada", colorVeto: "G", themeVeto: null, themeWish: null },
      submittedAt: "2026-09-02",
    };

    const { inputs, superseded } = dedupeSignups([first, second], { latestWins: true });

    expect(inputs).toEqual([second.input]);
    expect(superseded).toHaveLength(1);
    expect(superseded[0]).toContain("2026-09-01");
  });

  it("keeps the newest even when submissions arrive out of order", () => {
    const newer: SignupEntry = {
      input: { name: "Ada", colorVeto: "G", themeVeto: null, themeWish: null },
      submittedAt: "2026-09-05",
    };

    const { inputs } = dedupeSignups(
      [newer, entry("Ada", "2026-09-01")],
      { latestWins: true }
    );

    expect(inputs).toEqual([newer.input]);
  });
});

describe("signupsOpen", () => {
  it("is open well before the closing date", () => {
    expect(signupsOpen(new Date("2026-08-19T12:00:00Z"))).toBe(true);
  });

  it("is closed once the closing date has passed", () => {
    expect(signupsOpen(new Date("2026-09-19T00:00:00Z"))).toBe(false);
  });

  it("agrees with the home page countdown rather than using its own date rule", () => {
    // The form and the countdown must never disagree about the same instant;
    // both derive from countdownPhase, so this pins the boundary they share:
    // the closing date is the last day someone can sign up, all day.
    expect(signupsOpen(new Date("2026-09-18T00:00:01Z"))).toBe(true);
    expect(signupsOpen(new Date("2026-09-18T23:59:00Z"))).toBe(true);
    expect(signupsOpen(new Date("2026-09-19T00:00:01Z"))).toBe(false);
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
