import { BANNED_PAIRS } from "#lib/rules";
import type { Commander, PairingRole, ScryfallCard } from "#lib/scryfall/types";

/**
 * The least a card must carry for the pairing rules to apply to it.
 *
 * Stated structurally so the same rules run against a full `Commander` on the
 * server and against the trimmed `CommanderOption` the pickers hold in the
 * browser — one implementation, not two that can disagree.
 */
export type PairableCard = {
  id: string;
  name: string;
  colorIdentity: string[];
  pairingRole: PairingRole | null;
};

/**
 * Commander pairing: which cards can be partnered, and with what.
 *
 * Pure and free of any storage or framework import, so the sign-up form, the
 * card workshop, the importers and the draw all apply one set of rules.
 */

/**
 * Works out how a card pairs, from the card alone.
 *
 * Order matters. A Background is identified by its type line and never has the
 * Partner keyword; "Choose a Background" is an ability on an otherwise normal
 * commander. Anything carrying "Partner with <name>" is deliberately rejected
 * rather than treated as a plain Partner — that variant only pairs with one
 * specific card, and treating it as generic would offer 29 illegal partners.
 */
export function pairingRoleOf(card: {
  typeLine: string;
  oracleText: string;
  keywords?: string[];
}): PairingRole | null {
  if (/\bBackground\b/.test(card.typeLine)) {
    return "background";
  }
  if (/choose a background/i.test(card.oracleText)) {
    return "choose-background";
  }
  if (/^partner with /im.test(card.oracleText)) {
    return null;
  }
  if (card.keywords?.includes("Partner") || /^partner$/im.test(card.oracleText)) {
    return "partner";
  }
  return null;
}

/** The same, straight off a raw Scryfall card, for the normaliser. */
export function pairingRoleOfScryfallCard(card: ScryfallCard): PairingRole | null {
  const front = card.card_faces?.[0];
  return pairingRoleOf({
    typeLine: card.type_line,
    oracleText: card.oracle_text ?? front?.oracle_text ?? "",
    keywords: card.keywords,
  });
}

/**
 * Whether a card may be somebody's commander on its own.
 *
 * A Background cannot: it is only ever the second half of a pair, so it must
 * not be offered as a standalone pick.
 */
export function canBePrimary(card: PairableCard): boolean {
  return card.pairingRole !== "background";
}

/** Whether a card may take a partner at all. */
export function canTakePartner(card: PairableCard): boolean {
  return card.pairingRole === "partner" || card.pairingRole === "choose-background";
}

/** Whether this exact pairing is on the event's banned-together list. */
export function isBannedPair(first: PairableCard, second: PairableCard): boolean {
  return BANNED_PAIRS.some(
    ([left, right]) =>
      (left === first.name && right === second.name) ||
      (left === second.name && right === first.name)
  );
}

/**
 * Whether `partner` is a legal second half for `commander`.
 *
 * Plain Partner goes with plain Partner; "Choose a Background" goes with a
 * Background. Nothing else pairs, a card never pairs with itself, and a
 * combination on the event's banned list is refused even though each half is
 * individually legal.
 */
export function canPairWith(commander: PairableCard, partner: PairableCard): boolean {
  if (commander.id === partner.id) {
    return false;
  }
  if (isBannedPair(commander, partner)) {
    return false;
  }
  if (commander.pairingRole === "partner") {
    return partner.pairingRole === "partner";
  }
  if (commander.pairingRole === "choose-background") {
    return partner.pairingRole === "background";
  }
  return false;
}

/** Every legal partner for a commander, in name order. */
export function partnersFor<T extends PairableCard>(commander: T, pool: T[]): T[] {
  return pool
    .filter((candidate) => canPairWith(commander, candidate))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * One commander choice: a commander, and optionally the partner beside it.
 *
 * A pair is a single choice, not two — it occupies one slot in a pool and one
 * place on a shortlist, because it is one deck's worth of commander.
 */
export type PickOf<T> = {
  commander: T;
  partner: T | null;
};

export type CommanderPick = PickOf<Commander>;

/** Wraps a lone commander as a pick. */
export function soloPick<T>(commander: T): PickOf<T> {
  return { commander, partner: null };
}

/** Both halves, or just the one. */
export function pickCards<T>(pick: PickOf<T>): T[] {
  return pick.partner ? [pick.commander, pick.partner] : [pick.commander];
}

/**
 * Stable identity for a pick, used to decide whether two picks are the same.
 *
 * Order-independent: whichever half someone chose first, "A + B" and "B + A"
 * are one option and must not both count toward a pool's four unique cards.
 */
export function pickId(pick: PickOf<{ id: string }>): string {
  return pickCards(pick)
    .map((card) => card.id)
    .sort()
    .join("+");
}

/** Display name: "Commander + Partner", or just the commander. */
export function pickName(pick: PickOf<{ name: string }>): string {
  return pickCards(pick)
    .map((card) => card.name)
    .join(" + ");
}

/** The combined colour identity, which is what a veto has to be checked against. */
export function pickColorIdentity(pick: PickOf<{ colorIdentity: string[] }>): string[] {
  return [...new Set(pickCards(pick).flatMap((card) => card.colorIdentity))];
}

/**
 * Whether a pick is legal on its own terms: a commander that can lead a deck,
 * plus a partner that is allowed beside it.
 */
export function isLegalPick(pick: PickOf<PairableCard>): boolean {
  if (!canBePrimary(pick.commander)) {
    return false;
  }
  return pick.partner === null || canPairWith(pick.commander, pick.partner);
}

/** Explains why a pick is not legal, for an error a person has to act on. */
export function describeIllegalPick(pick: PickOf<PairableCard>): string | null {
  if (!canBePrimary(pick.commander)) {
    return `${pick.commander.name} is a Background, which can only be the second half of a pair — it cannot be a commander on its own.`;
  }
  if (pick.partner === null) {
    return null;
  }
  if (pick.commander.id === pick.partner.id) {
    return `${pick.commander.name} cannot be partnered with itself.`;
  }
  if (isBannedPair(pick.commander, pick.partner)) {
    return `${pick.commander.name} and ${pick.partner.name} are banned as a pair, although each is legal with a different partner.`;
  }
  if (!canTakePartner(pick.commander)) {
    return `${pick.commander.name} cannot take a partner.`;
  }
  if (!canPairWith(pick.commander, pick.partner)) {
    return `${pick.partner.name} is not a legal partner for ${pick.commander.name}.`;
  }
  return null;
}
