/**
 * Validation for a builder's private workspace — no storage attached.
 *
 * Split from `deck-builds.ts` for the same reason `card-pool.ts` is split from
 * `card-selections.ts`: that module imports the database client, and anything
 * a `"use client"` component imports is pulled into the browser bundle. The
 * scratchpad needs the length limit, and importing it from the storage module
 * dragged `pg` into the client build and broke it outright.
 */

/** Longest URL accepted, which is far beyond any real deck-site link. */
export const MAX_URL_LENGTH = 2048;

/**
 * Longest note accepted.
 *
 * Generous — several pages of typing — but bounded, because this is a
 * free-text field written straight to a column by an endpoint anyone holding a
 * link can call.
 */
export const MAX_NOTES_LENGTH = 20_000;

/**
 * Validates a decklist link, or explains why it was refused.
 *
 * Only http(s). A `javascript:` or `data:` URL stored here would come back out
 * as an href on the builder's own page, so the scheme is checked rather than
 * assumed — this is a free-text field whose value is rendered as a link.
 */
export function normalizeDecklistUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") {
    throw new Error("Paste a link, or use Remove to clear the one saved.");
  }
  if (trimmed.length > MAX_URL_LENGTH) {
    throw new Error("That link is too long to save.");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(
      "That doesn't look like a link. Paste the whole address, including https://."
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http:// and https:// links can be saved.");
  }
  return url.toString();
}

/**
 * Trims a note to something storable, or explains why it was refused.
 *
 * Only length is checked. The text is rendered as text, never as markup, so
 * there is nothing to sanitise — and stripping characters out of somebody's
 * private notes would be worse than storing them.
 */
export function normalizeNotes(raw: string): string {
  if (raw.length > MAX_NOTES_LENGTH) {
    throw new Error(
      `Those notes are too long to save (limit ${MAX_NOTES_LENGTH.toLocaleString()} characters).`
    );
  }
  return raw;
}
