export type Row = Record<string, string>;

export type ParticipantInput = {
  name: string;
  colorVeto: "W" | "U" | "B" | "R" | "G" | null;
  themeVeto: string | null;
  themeWish: string | null;
};

/**
 * Google Form column headers. Confirm these against the real CSV export —
 * they are the only thing to change if the form's wording differs.
 */
const COLUMN_MAP = {
  name: "Your name",
  colorVeto: "Colour to avoid",
  themeVeto: "Theme to avoid",
  themeWish: "Theme you'd like",
} as const;

const COLOR_CODES: Record<string, ParticipantInput["colorVeto"]> = {
  white: "W",
  blue: "U",
  black: "B",
  red: "R",
  green: "G",
};

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

function blankToNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "" || /^no preference$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/** Maps raw CSV rows onto participant inputs. */
export function toParticipantInputs(rows: Row[]): ParticipantInput[] {
  const inputs = rows.map((row, index) => {
    if (!(COLUMN_MAP.name in row)) {
      throw new Error(
        `CSV has no "${COLUMN_MAP.name}" column. Found: ${Object.keys(row).join(", ")}. ` +
          "Update COLUMN_MAP in scripts/csv.ts to match the form."
      );
    }

    const name = (row[COLUMN_MAP.name] ?? "").trim();
    if (name === "") {
      // +2: one for the header row, one to convert to 1-based numbering.
      throw new Error(`Row ${index + 2} of the CSV has an empty name.`);
    }

    const rawColor = blankToNull(row[COLUMN_MAP.colorVeto]);
    let colorVeto: ParticipantInput["colorVeto"] = null;

    if (rawColor) {
      colorVeto = COLOR_CODES[rawColor.toLowerCase()] ?? null;

      if (colorVeto === null) {
        throw new Error(
          `Unrecognised colour "${rawColor}" for "${name}". ` +
            `Known colours: ${Object.keys(COLOR_CODES).join(", ")}. ` +
            "Update COLOR_CODES in scripts/csv.ts to match the form's wording."
        );
      }
    }

    return {
      name,
      colorVeto,
      themeVeto: blankToNull(row[COLUMN_MAP.themeVeto]),
      themeWish: blankToNull(row[COLUMN_MAP.themeWish]),
    };
  });

  const seen = new Set<string>();
  for (const input of inputs) {
    const key = input.name.toLowerCase();
    if (seen.has(key)) {
      throw new Error(
        `Two participants are both named "${input.name}". ` +
          "Names identify people when correcting entries later, so make them " +
          "distinct in the CSV (for example \"Dave K.\") and draw again."
      );
    }
    seen.add(key);
  }

  return inputs;
}
