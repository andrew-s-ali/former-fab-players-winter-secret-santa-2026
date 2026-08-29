import { describe, expect, it } from "vitest";
import { parseCsv, toParticipantInputs } from "./csv";

/** The two card columns every valid row carries. */
const PICKS = {
  "First commander for your pool": "Llanowar Elf",
  "Second commander for your pool": "Deep Gnome",
};
const EMAIL = "ada@example.com";
const REQUIRED = { "Your email": EMAIL };
const PICKED = [
  { commander: "Llanowar Elf", partner: null },
  { commander: "Deep Gnome", partner: null },
];

describe("parseCsv", () => {
  it("handles quoted fields containing commas and newlines", () => {
    const csv = 'Name,Wish\n"Ada","elves, tokens\nand counters"\n';

    expect(parseCsv(csv)).toEqual([
      { Name: "Ada", Wish: "elves, tokens\nand counters" },
    ]);
  });

  it("handles escaped double quotes", () => {
    const csv = 'Name,Wish\n"Ada","she said ""hi"""\n';

    expect(parseCsv(csv)[0].Wish).toBe('she said "hi"');
  });

  it("strips a UTF-8 BOM so the first header still matches", () => {
    const csv =
      '﻿Your name,Your email,Colour to avoid,First commander for your pool,' +
      "Second commander for your pool\nAda,ada@example.com,Red,Llanowar Elf,Deep Gnome\n";

    const rows = parseCsv(csv);

    expect(Object.keys(rows[0])[0]).toBe("Your name");
    expect(toParticipantInputs(rows)).toEqual([
      {
        name: "Ada",
        email: EMAIL,
        colorVeto: "R",
        themeVeto: null,
        themeWish: null,
        selfCards: PICKED,
      },
    ]);
  });
});

describe("toParticipantInputs", () => {
  const rows = [
    {
      "Your name": "Ada",
      ...REQUIRED,
      "Colour to avoid": "Red",
      "Theme to avoid": "Mill",
      "Theme you'd like": "Elves",
      ...PICKS,
    },
  ];

  it("maps form columns onto participant fields", () => {
    expect(toParticipantInputs(rows)).toEqual([
      {
        name: "Ada",
        email: EMAIL,
        colorVeto: "R",
        themeVeto: "Mill",
        themeWish: "Elves",
        selfCards: PICKED,
      },
    ]);
  });

  it("treats blank and 'no preference' answers as null", () => {
    const blank = [
      {
        "Your name": "Bob",
        ...REQUIRED,
        "Colour to avoid": "No preference",
        "Theme to avoid": "",
        "Theme you'd like": "   ",
        ...PICKS,
      },
    ];

    expect(toParticipantInputs(blank)).toEqual([
      {
        name: "Bob",
        email: EMAIL,
        colorVeto: null,
        themeVeto: null,
        themeWish: null,
        selfCards: PICKED,
      },
    ]);
  });

  it("throws listing the real headers when the name column is missing", () => {
    expect(() => toParticipantInputs([{ Nickname: "Ada" }])).toThrow(/Nickname/);
  });

  it("throws on an unrecognised colour rather than dropping the veto", () => {
    const rows = [{ "Your name": "Ada", ...REQUIRED, "Colour to avoid": "Crimson", ...PICKS }];

    expect(() => toParticipantInputs(rows)).toThrow(/Crimson/);
  });

  it("throws on an empty name, naming the row", () => {
    const rows = [{ "Your name": "   ", ...REQUIRED, "Colour to avoid": "Red", ...PICKS }];

    expect(() => toParticipantInputs(rows)).toThrow(/Row 2/);
  });

  it("throws when two participants share a name", () => {
    const rows = [
      { "Your name": "Dave", ...REQUIRED, ...PICKS },
      { "Your name": "dave", ...REQUIRED, ...PICKS },
    ];

    expect(() => toParticipantInputs(rows)).toThrow(/both named/i);
  });

  // A Google Form that predates the card question exports without those
  // columns; every row then fails for the same reason, which should say what
  // is missing rather than looking like eight unrelated bad sign-ups.
  it("throws naming the row when the card columns are absent", () => {
    const rows = [{ "Your name": "Ada", ...REQUIRED, "Colour to avoid": "Red" }];

    expect(() => toParticipantInputs(rows)).toThrow(/Row 2/);
    expect(() => toParticipantInputs(rows)).toThrow(/commander picks/);
  });
});
