import { describe, expect, it } from "vitest";
import { parseCsv, toParticipantInputs } from "./csv";

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
    const csv = '﻿Your name,Colour to avoid\nAda,Red\n';

    const rows = parseCsv(csv);

    expect(Object.keys(rows[0])[0]).toBe("Your name");
    expect(toParticipantInputs(rows)).toEqual([
      { name: "Ada", colorVeto: "R", themeVeto: null, themeWish: null },
    ]);
  });
});

describe("toParticipantInputs", () => {
  const rows = [
    {
      "Your name": "Ada",
      "Colour to avoid": "Red",
      "Theme to avoid": "Mill",
      "Theme you'd like": "Elves",
    },
  ];

  it("maps form columns onto participant fields", () => {
    expect(toParticipantInputs(rows)).toEqual([
      { name: "Ada", colorVeto: "R", themeVeto: "Mill", themeWish: "Elves" },
    ]);
  });

  it("treats blank and 'no preference' answers as null", () => {
    const blank = [
      {
        "Your name": "Bob",
        "Colour to avoid": "No preference",
        "Theme to avoid": "",
        "Theme you'd like": "   ",
      },
    ];

    expect(toParticipantInputs(blank)).toEqual([
      { name: "Bob", colorVeto: null, themeVeto: null, themeWish: null },
    ]);
  });

  it("throws listing the real headers when the name column is missing", () => {
    expect(() => toParticipantInputs([{ Nickname: "Ada" }])).toThrow(/Nickname/);
  });

  it("throws on an unrecognised colour rather than dropping the veto", () => {
    const rows = [{ "Your name": "Ada", "Colour to avoid": "Crimson" }];

    expect(() => toParticipantInputs(rows)).toThrow(/Crimson/);
  });

  it("throws on an empty name, naming the row", () => {
    const rows = [{ "Your name": "   ", "Colour to avoid": "Red" }];

    expect(() => toParticipantInputs(rows)).toThrow(/Row 2/);
  });

  it("throws when two participants share a name", () => {
    const rows = [{ "Your name": "Dave" }, { "Your name": "dave" }];

    expect(() => toParticipantInputs(rows)).toThrow(/both named/i);
  });
});
