import { legalCommanders } from "#lib/commanders";
import { countdownPhase } from "#lib/countdown";
import { EXCHANGE_AT, EXCHANGE_CANDIDATES, SIGNUPS_CLOSE_AT } from "#lib/event";
import {
  describeIllegalPick,
  pickColorIdentity,
  pickName,
  type CommanderPick,
} from "#lib/pairing";
import type { Commander } from "./scryfall/types";

/** One commander choice as a sign-up carries it: names, not resolved cards. */
export type SignupPick = {
  commander: string;
  /** The second half of a partner pair, when they chose one. */
  partner: string | null;
};

/**
 * The shape the draw consumes, whatever the source.
 *
 * Canonical home is here rather than in `scripts/csv.ts` because there are now
 * two producers — the CSV importer and the Netlify Forms importer — plus one
 * consumer in the browser (the sign-up form itself needs the colour list).
 * `scripts/csv.ts` re-exports it so the operator scripts read unchanged.
 */
export type ParticipantInput = {
  name: string;
  /**
   * How the organiser reaches this person — chiefly to send their private
   * link, which is otherwise distributed by hand.
   *
   * Required, so the roster is complete. It is personal data: it reaches the
   * Netlify Forms store, the `signups` table and the event store, and is shown
   * on the Identity-gated organiser console. It is never rendered on any page
   * a participant can see.
   */
  email: string;
  colorVeto: "W" | "U" | "B" | "R" | "G" | null;
  themeVeto: string | null;
  themeWish: string | null;
  /**
   * The two commanders this person puts into their own pool, by card name.
   *
   * Names rather than Scryfall ids because a sign-up passes through two places
   * a human reads before the draw does — the Netlify Forms dashboard and the
   * CSV fallback — and an id tells the organiser nothing when they are trying
   * to work out whether a submission is real. The pool is fetched with
   * `unique=cards`, so a name identifies exactly one commander in it.
   *
   * Unresolvable at sign-up time on purpose: validating a name against the
   * live pool needs a network call, and this module is imported by the browser
   * form. `resolveSelfCards` does that check at draw time instead.
   */
  selfCards: [SignupPick, SignupPick];
  /**
   * The candidate exchange dates in this person's order of preference, best
   * first — always a permutation of `EXCHANGE_CANDIDATES`.
   *
   * An ordering rather than a rank per date, because the ordering is the
   * answer: tallying, comparing and displaying all want "what did they put
   * first", and a rank-per-date shape can represent nonsense (two firsts, no
   * second) that this one cannot.
   *
   * **Null means the question was not answered**, not "no preference". The
   * form requires it, but the form went live before the question existed and
   * the CSV fallback may not carry the columns at all, so a sign-up without
   * one still has to be drawable.
   */
  exchangeRanking: string[] | null;
};

/** How many commanders each person contributes to their own pool. */
export const SELF_CARD_COUNT = 2;

/**
 * Netlify form name. Must be unique per site, and must match the `name`
 * attribute in `public/__forms.html` exactly — Netlify validates submissions
 * against the registered form and silently drops mismatches.
 */
export const SIGNUP_FORM_NAME = "santa-signup";

/**
 * Where the browser POSTs a sign-up.
 *
 * Deliberately the static skeleton file and not `/`. This is a server-rendered
 * Next.js site, so `POST /` is swallowed by Netlify's `___netlify-server-handler`
 * function and never reaches form processing — the submission appears to
 * succeed and is never recorded.
 */
export const SIGNUP_ACTION = "/__forms.html";

/**
 * Honeypot field. Netlify quietly rejects any submission where it is filled,
 * and such rejections appear in neither the verified nor the spam list.
 */
export const HONEYPOT_FIELD = "bot-field";

/**
 * Field names, shared by the rendered form, the skeleton file and the importer.
 *
 * Every one of those three has to agree, and two of them are files a human
 * edits by hand, so they are named once here and referenced everywhere else.
 */
export const SIGNUP_FIELDS = {
  name: "name",
  email: "email",
  colorVeto: "colorVeto",
  themeVeto: "themeVeto",
  themeWish: "themeWish",
  selfCard1: "selfCard1",
  selfCard1Partner: "selfCard1Partner",
  selfCard2: "selfCard2",
  selfCard2Partner: "selfCard2Partner",
  /**
   * One field per candidate date, holding the rank that person gave it.
   *
   * Numbered by the date's position in `EXCHANGE_CANDIDATES`, not by the date
   * itself, so moving a candidate does not rename a registered Netlify form
   * field — which would silently drop every submission until `__forms.html`
   * was updated to match.
   */
  exchangeRank1: "exchangeRank1",
  exchangeRank2: "exchangeRank2",
  exchangeRank3: "exchangeRank3",
} as const;

/** The rank field for each candidate, in `EXCHANGE_CANDIDATES` order. */
export const EXCHANGE_RANK_FIELDS = [
  SIGNUP_FIELDS.exchangeRank1,
  SIGNUP_FIELDS.exchangeRank2,
  SIGNUP_FIELDS.exchangeRank3,
] as const;

/**
 * The self-pick fields in slot order, so callers never hard-code them.
 *
 * Two slots, each a commander plus an optional partner — a pair is one choice
 * and fills one slot, not both.
 */
export const SELF_CARD_FIELDS = [
  { commander: SIGNUP_FIELDS.selfCard1, partner: SIGNUP_FIELDS.selfCard1Partner },
  { commander: SIGNUP_FIELDS.selfCard2, partner: SIGNUP_FIELDS.selfCard2Partner },
] as const;

export const COLOR_CODES: Record<string, ParticipantInput["colorVeto"]> = {
  white: "W",
  blue: "U",
  black: "B",
  red: "R",
  green: "G",
};

/** Colour options in the order the form renders them. */
export const COLOR_CHOICES = [
  { value: "", label: "No preference" },
  { value: "white", label: "White" },
  { value: "blue", label: "Blue" },
  { value: "black", label: "Black" },
  { value: "red", label: "Red" },
  { value: "green", label: "Green" },
] as const;

/** Blank, whitespace, or the literal "no preference" all mean "unset". */
export function blankToNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "" || /^no preference$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/**
 * Turns a colour word into its code.
 *
 * `who` only shapes the error message — an unrecognised colour has to name the
 * person it came from, or the organiser has to grep the submissions by hand.
 */
export function parseColorWord(
  raw: string | null,
  who: string
): ParticipantInput["colorVeto"] {
  if (!raw) {
    return null;
  }

  const code = COLOR_CODES[raw.toLowerCase()] ?? null;
  if (code === null) {
    throw new Error(
      `Unrecognised colour "${raw}" for "${who}". ` +
        `Known colours: ${Object.keys(COLOR_CODES).join(", ")}. ` +
        "Update COLOR_CODES in src/lib/signup.ts to match the form's wording."
    );
  }
  return code;
}

/**
 * Normalises one submission's raw fields.
 *
 * `label` describes where the record came from ("row 4 of the CSV", "the
 * submission from 2026-09-02") so a failure points at something the organiser
 * can actually open and look at.
 */
export function normalizeSignup(
  fields: Record<string, string | undefined>,
  label: string
): ParticipantInput {
  const name = (fields[SIGNUP_FIELDS.name] ?? "").trim();
  if (name === "") {
    throw new Error(`${label} has an empty name.`);
  }

  return {
    name,
    email: parseEmail(fields[SIGNUP_FIELDS.email], name, label),
    colorVeto: parseColorWord(blankToNull(fields[SIGNUP_FIELDS.colorVeto]), name),
    themeVeto: blankToNull(fields[SIGNUP_FIELDS.themeVeto]),
    themeWish: blankToNull(fields[SIGNUP_FIELDS.themeWish]),
    selfCards: parseSelfCards(fields, name, label),
    exchangeRanking: parseExchangeRanking(fields, name, label),
  };
}

/**
 * Reads the preferred order of the candidate exchange dates.
 *
 * Returns null when nothing was answered at all — see
 * `ParticipantInput.exchangeRanking`. Anything *partly* answered is an error
 * rather than a silent null: it means the form or the CSV disagrees with this
 * code about the fields, and quietly discarding half an answer would leave the
 * organiser tallying a vote that some people appear not to have cast.
 */
export function parseExchangeRanking(
  fields: Record<string, string | undefined>,
  who: string,
  label: string
): string[] | null {
  const raw = EXCHANGE_RANK_FIELDS.map((field) => (fields[field] ?? "").trim());
  if (raw.every((value) => value === "")) {
    return null;
  }

  const expected = EXCHANGE_CANDIDATES.length;
  const ranks = raw.map((value) => Number(value));
  const valid = ranks.every(
    (rank) => Number.isInteger(rank) && rank >= 1 && rank <= expected
  );
  if (!valid || new Set(ranks).size !== expected) {
    throw new Error(
      `${label} ("${who}") has an incomplete exchange-date ranking: ` +
        `got [${raw.map((value) => value === "" ? "(blank)" : value).join(", ")}] ` +
        `for ${EXCHANGE_CANDIDATES.join(", ")}. ` +
        `Rank every date exactly once, using 1 to ${expected}.`
    );
  }

  // Rank per date in, preference order out.
  return EXCHANGE_CANDIDATES.map((date, index) => ({ date, rank: ranks[index] }))
    .sort((left, right) => left.rank - right.rank)
    .map((entry) => entry.date);
}

/**
 * Reads the two self-picks, which are required.
 *
 * Unlike the vetoes these are not preferences the organiser can shrug off: a
 * missing one leaves that person's pool two cards short, and because the pool
 * is what everyone else draws from, the shortfall surfaces much later as
 * "the exchange will not unlock" with nothing pointing at who caused it. So a
 * blank fails here, at import, where the message can name the person.
 */
function parseSelfCards(
  fields: Record<string, string | undefined>,
  who: string,
  label: string
): [SignupPick, SignupPick] {
  const picks = SELF_CARD_FIELDS.map((slot) => ({
    commander: (fields[slot.commander] ?? "").trim(),
    partner: blankToNull(fields[slot.partner] ?? ""),
  }));

  const missing = picks.filter((pick) => pick.commander === "").length;
  if (missing > 0) {
    throw new Error(
      `${label} ("${who}") is missing ${missing} of its ${SELF_CARD_COUNT} ` +
        "commander picks. Every sign-up must name both — they are the cards " +
        "that go into that person's pool for everyone else to draw from."
    );
  }

  // Overlap, not just exact repetition: two picks sharing a card would put the
  // same commander into the pool twice under two different pairings, which
  // makes a four-option shortlist read as two.
  const names = picks.map((pick) =>
    [pick.commander, pick.partner]
      .filter((name): name is string => name !== null)
      .map((name) => name.toLowerCase())
  );
  const shared = names[0].filter((name) => names[1].includes(name));
  if (shared.length > 0) {
    throw new Error(
      `${label} ("${who}") used "${shared[0]}" in both of its picks. ` +
        "The two choices must not share a card."
    );
  }

  return [picks[0], picks[1]];
}

/**
 * Resolves a sign-up's card names against the live commander pool.
 *
 * Separate from `normalizeSignup` because it needs the pool, which means a
 * network fetch — this runs once per submission in the Netlify function, or
 * once per draw for the import paths, never in the browser.
 *
 * Applies exactly the rules the card workshop applies to a peer pick, so a
 * choice made at sign-up cannot be one the workshop would have refused: every
 * card must be in the legal pool and unbanned, the commander must be able to
 * lead a deck (so not a bare Background), any partner must be a legal partner
 * for it, and the pair's *combined* colour identity must not include the
 * person's own vetoed colour. That last one is reachable without any bad
 * faith — the form lets you pick, then change your veto underneath it.
 */
export function resolveSelfCards(
  input: ParticipantInput,
  pool: Commander[]
): [CommanderPick, CommanderPick] {
  const byName = new Map(pool.map((card) => [card.name.toLowerCase(), card]));
  const unbanned = new Set(legalCommanders(pool, {}).map((card) => card.id));

  const find = (cardName: string): Commander => {
    const card = byName.get(cardName.toLowerCase());
    if (!card) {
      throw new Error(
        `${input.name} picked "${cardName}", which is not in the legal ` +
          "commander pool. The pool changes when a set is released, so a " +
          "sign-up from before one can name a card that no longer qualifies — " +
          "ask them to pick again, or edit the submission to a legal card."
      );
    }
    if (!unbanned.has(card.id)) {
      throw new Error(`${input.name} picked "${card.name}", which is banned.`);
    }
    return card;
  };

  const resolved = input.selfCards.map((chosen): CommanderPick => {
    const pick: CommanderPick = {
      commander: find(chosen.commander),
      partner: chosen.partner === null ? null : find(chosen.partner),
    };

    const illegal = describeIllegalPick(pick);
    if (illegal) {
      throw new Error(`${input.name}: ${illegal}`);
    }
    if (
      input.colorVeto &&
      pickColorIdentity(pick).includes(input.colorVeto)
    ) {
      throw new Error(
        `${input.name} picked ${pickName(pick)}, whose colour identity ` +
          `includes ${input.colorVeto} — the colour they asked not to receive. ` +
          "Their pool is what other people draw from for them, so it cannot " +
          "contain a card they asked not to get."
      );
    }
    return pick;
  });

  return [resolved[0], resolved[1]];
}

/**
 * Checks an address is shaped like one, and no more than that.
 *
 * Deliberately permissive: the only thing a stricter pattern reliably achieves
 * is rejecting somebody's real address. A typo that still parses is caught by
 * the mail bouncing, not here — which is why the organiser console shows every
 * address rather than assuming they are all good.
 */
export function parseEmail(
  raw: string | undefined,
  who: string,
  label: string
): string {
  const email = (raw ?? "").trim();
  if (email === "") {
    throw new Error(
      `${label} ("${who}") has no email address. It is required — it is how ` +
        "the organiser sends that person their private link."
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(
      `${label} ("${who}") gave "${email}", which is not shaped like an email address.`
    );
  }
  return email;
}

/** One normalised sign-up plus when it arrived, for resolving resubmissions. */
export type SignupEntry = {
  input: ParticipantInput;
  /** ISO timestamp. Ordering only — never stored on the participant. */
  submittedAt: string;
};

/**
 * Collapses entries to one per person, case-insensitively by name.
 *
 * Names have to be unique because `update-participant` looks people up by
 * name, not by row. With a CSV that guarantee came from the organiser tidying
 * the export by hand; with a live form it does not — **resubmitting the form
 * is the only way to change a sign-up before the draw**, since nobody has a
 * private link until the draw mints one. So duplicates are expected, and the
 * policy distinguishes the two cases that produce them:
 *
 * - same name **and** the same email — one person changing their answers.
 *   The newest wins and the older is reported as superseded. Erroring here
 *   would make the documented update path fail every draw.
 * - same name, **different** email — two different people. This still stops
 *   the run: collapsing them silently would drop somebody from the exchange
 *   with no symptom until reveal day. Tell them apart by hand ("Dave K.").
 * - `latestWins`: newest wins in both cases, for an organiser who has looked
 *   and knows what they are merging.
 *
 * Generic over the entry type so the database path can carry its already
 * resolved commanders through the winner alongside `input`, rather than
 * needing a second copy of this policy. `inputs` is the same list as
 * `entries`, projected — both are returned so neither caller has to map.
 */
export function dedupeSignups<Entry extends SignupEntry>(
  entries: Entry[],
  { latestWins = false }: { latestWins?: boolean } = {}
): { entries: Entry[]; inputs: ParticipantInput[]; superseded: string[] } {
  const byName = new Map<string, Entry>();
  const superseded: string[] = [];

  const address = (entry: Entry) => entry.input.email.trim().toLowerCase();

  for (const entry of entries) {
    const key = entry.input.name.toLowerCase();
    const existing = byName.get(key);

    if (!existing) {
      byName.set(key, entry);
      continue;
    }

    // Same name *and* same address is one person changing their answers,
    // which is the only way to edit a sign-up before the draw: they fill the
    // form in again. Treating that as an error would make the documented
    // update path fail every draw.
    //
    // Same name, different address is two people, and that still stops the
    // run — silently collapsing them would drop somebody from the exchange
    // with no symptom until reveal day.
    const samePerson = address(entry) === address(existing);

    if (!latestWins && !samePerson) {
      throw new Error(
        `Two sign-ups are both named "${entry.input.name}", with different ` +
          `email addresses (${existing.input.email} and ${entry.input.email}). ` +
          "Names identify people when correcting entries later, so either " +
          'make them distinct (for example "Dave K.") or pass --latest-wins ' +
          "to keep only the most recent submission per name."
      );
    }

    const winner = entry.submittedAt >= existing.submittedAt ? entry : existing;
    const loser = winner === entry ? existing : entry;
    byName.set(key, winner);
    superseded.push(
      `${loser.input.name}${samePerson ? " updated their entry" : ""} ` +
        `(kept ${winner.submittedAt}, dropped ${loser.submittedAt})`
    );
  }

  const winners = [...byName.values()];
  return { entries: winners, inputs: winners.map((e) => e.input), superseded };
}

/**
 * Whether the sign-up form should still accept entries.
 *
 * Derived from the same phase function the home page countdown uses, so the
 * two cannot drift into saying different things about the same day.
 */
export function signupsOpen(now: Date = new Date()): boolean {
  return (
    countdownPhase(now, {
      signupsCloseAt: SIGNUPS_CLOSE_AT,
      exchangeCandidates: EXCHANGE_CANDIDATES,
      exchangeAt: EXCHANGE_AT,
    }).kind === "before-signups"
  );
}
