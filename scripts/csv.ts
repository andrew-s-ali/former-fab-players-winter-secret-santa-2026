import {
  SIGNUP_FIELDS,
  dedupeSignups,
  normalizeSignup,
  type ParticipantInput,
} from "#lib/signup";

export type Row = Record<string, string>;

/**
 * CSV import, kept as the fallback path now that Netlify Forms is the primary
 * source. Still the way in for a Google Form export, a hand-written sheet, or
 * a rescue after something goes wrong with the live form.
 *
 * Validation, colour parsing and duplicate handling all live in
 * `src/lib/signup.ts` so both sources behave identically — this file is only
 * responsible for turning a CSV's column headings into canonical field names.
 */

/**
 * Google Form column headers. Confirm these against the real CSV export —
 * they are the only thing to change if the form's wording differs.
 */
const COLUMN_MAP = {
  [SIGNUP_FIELDS.name]: "Your name",
  [SIGNUP_FIELDS.colorVeto]: "Colour to avoid",
  [SIGNUP_FIELDS.themeVeto]: "Theme to avoid",
  [SIGNUP_FIELDS.themeWish]: "Theme you'd like",
} as const;

export { COLOR_CODES } from "#lib/signup";
export type { ParticipantInput } from "#lib/signup";

/** Minimal RFC 4180 parser: handles quotes, embedded commas and newlines. */
export function parseCsv(input: string): Row[] {
  // Google Sheets exports are often BOM-prefixed. Left in place, the BOM binds
  // to the first header name and makes it silently fail to match COLUMN_MAP —
  // producing an error where the "missing" and "found" names look identical.
  const text = input.startsWith("﻿") ? input.slice(1) : input;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") {
        i++;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...body] = rows;
  return body
    .filter((cells) => cells.some((cell) => cell.trim() !== ""))
    .map((cells) =>
      Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]))
    );
}

/** Maps raw CSV rows onto participant inputs. */
export function toParticipantInputs(rows: Row[]): ParticipantInput[] {
  const entries = rows.map((row, index) => {
    if (!(COLUMN_MAP[SIGNUP_FIELDS.name] in row)) {
      throw new Error(
        `CSV has no "${COLUMN_MAP[SIGNUP_FIELDS.name]}" column. Found: ${Object.keys(row).join(", ")}. ` +
          "Update COLUMN_MAP in scripts/csv.ts to match the form."
      );
    }

    const fields = Object.fromEntries(
      Object.entries(COLUMN_MAP).map(([field, header]) => [field, row[header]])
    );

    return {
      // +2: one for the header row, one to convert to 1-based numbering.
      input: normalizeSignup(fields, `Row ${index + 2} of the CSV`),
      // A CSV carries no submission time. Row order stands in for it, which is
      // only ever used to break ties, and a CSV should not contain any.
      submittedAt: String(index).padStart(6, "0"),
    };
  });

  return dedupeSignups(entries).inputs;
}
