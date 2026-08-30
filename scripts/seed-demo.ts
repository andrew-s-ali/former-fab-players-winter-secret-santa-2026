import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { SavedSelection } from "#lib/card-pool";
import { selectionsAreReady } from "#lib/card-pool";
import { legalCommanders, sampleCommanders, type ColorCode } from "#lib/commanders";
import {
  canBePrimary,
  canTakePartner,
  partnersFor,
  pickId,
  soloPick,
  type CommanderPick,
} from "#lib/pairing";
import { drawAssignments } from "#lib/draw";
import type { EventData, Participant } from "#lib/participants";
import { fetchCommanderPool } from "#lib/scryfall/pool";
import type { Commander } from "#lib/scryfall/types";
import { mintToken } from "#lib/tokens";

/**
 * Usage: npm run seed:demo [-- --revealed]
 *
 * Writes fake participants to src/demo/demo-event.json for the /demo routes.
 * It never imports the real store, so it cannot read or write real event data.
 * The people are invented, so committing their tokens protects nothing.
 */
const PEOPLE = [
  { name: "Ada Lovelace", exchangeRanking: ["2026-12-12", "2026-12-05", "2026-12-19"], discord: "185432109876543210", email: "ada.lovelace@example.invalid", colorVeto: "R" as const, themeVeto: "mill", themeWish: "elves and tokens" },
  { name: "Bob Ross", exchangeRanking: ["2026-12-12", "2026-12-19", "2026-12-05"], discord: "411223344556677889", email: "bob.ross@example.invalid", colorVeto: null, themeVeto: null, themeWish: null },
  { name: "Cleo Patra", exchangeRanking: ["2026-12-05", "2026-12-12", "2026-12-19"], discord: "cleo.patra", email: "cleo.patra@example.invalid", colorVeto: "G" as const, themeVeto: "stax", themeWish: "artifacts, the more the better" },
  { name: "Dev Patel-Nakamura-Rodriguez", exchangeRanking: ["2026-12-12", "2026-12-05", "2026-12-19"], discord: null, email: "dev.patel.nakamura.rodriguez@example.invalid", colorVeto: "U" as const, themeVeto: null, themeWish: "something with a very long explanation attached, because people do write essays in free-text fields and the layout should survive it" },
  { name: "Eli 🎄", exchangeRanking: ["2026-12-19", "2026-12-12", "2026-12-05"], discord: "732198765432109876", email: "eli@example.invalid", colorVeto: null, themeVeto: "combo", themeWish: "lifegain" },
  { name: "Fay Wray", exchangeRanking: ["2026-12-12", "2026-12-19", "2026-12-05"], discord: null, email: "fay.wray@example.invalid", colorVeto: "B" as const, themeVeto: null, themeWish: null },
  { name: "Gus", exchangeRanking: null, discord: "gus_the_third", email: "gus@example.invalid", colorVeto: null, themeVeto: null, themeWish: "go wide" },
  { name: "Hana", exchangeRanking: ["2026-12-05", "2026-12-12", "2026-12-19"], discord: "908877665544332211", email: "hana@example.invalid", colorVeto: "W" as const, themeVeto: "tribal", themeWish: "spellslinger" },
];

/**
 * Builds one commander choice, optionally a partner pair.
 *
 * Real commanders, because invented ids render as broken images the moment
 * anything displays a pool card and the point of the demo is that it looks
 * like the real thing. Respects the recipient's veto against the pair's
 * *combined* identity, and never reuses a card, for the same reasons
 * `resolveSelfCards` enforces both.
 */
function makePick(
  pool: Commander[],
  colorVeto: ColorCode | null,
  used: Set<string>,
  preferPair: boolean
): CommanderPick {
  const eligible = legalCommanders(pool, { colorVeto }).filter(
    (card) => !used.has(card.id)
  );
  const primaries = eligible.filter(canBePrimary);

  if (preferPair) {
    // Only offer a pair where a legal, still-unused partner actually exists.
    const pairable = primaries.filter(
      (card) => canTakePartner(card) && partnersFor(card, eligible).length > 0
    );
    const [commander] = sampleCommanders(pairable, {}, 1);
    if (commander) {
      const [partner] = sampleCommanders(partnersFor(commander, eligible), {}, 1);
      if (partner) {
        used.add(commander.id);
        used.add(partner.id);
        return { commander, partner };
      }
    }
  }

  const [commander] = sampleCommanders(primaries, {}, 1);
  if (!commander) {
    throw new Error(
      `The commander pool yielded nothing usable for a ${colorVeto ?? "none"} veto.`
    );
  }
  used.add(commander.id);
  return soloPick(commander);
}

/**
 * The two choices one person seeds their own pool with.
 *
 * Every other person is given a pair for their first choice, so the demo shows
 * both a paired and an unpaired commander without anyone having to hunt.
 */
function pickSelfCards(
  pool: Commander[],
  colorVeto: ColorCode | null,
  wantsPair: boolean
): [CommanderPick, CommanderPick] {
  const used = new Set<string>();
  return [
    makePick(pool, colorVeto, used, wantsPair),
    makePick(pool, colorVeto, used, false),
  ];
}

/**
 * A finished workshop: one pick from every participant for every other one.
 *
 * The demo is meant to show the event as it looks once everyone has finished,
 * so the selections have to be complete — `/demo/s/<token>` runs the real
 * `pickSecretCards` over them, and an incomplete set would draw nothing.
 *
 * Picks for one recipient are sampled together and are therefore distinct, and
 * exclude that recipient's vetoed colour, which is what the save action
 * enforces for a real pick.
 */
function buildSelections(
  pool: Commander[],
  participants: Participant[]
): SavedSelection[] {
  return participants.flatMap((recipient) => {
    const selectors = participants.filter(
      (participant) => participant.id !== recipient.id
    );
    // Cards already in this recipient's pool, so a recommendation cannot
    // duplicate one of their own choices.
    const used = new Set(
      recipient.selfCards.flatMap((pick) =>
        [pick.commander.id, pick.partner?.id].filter(
          (id): id is string => id !== undefined
        )
      )
    );
    const seen = new Set(recipient.selfCards.map(pickId));

    return selectors.map((selector, index) => {
      // Every third recommendation is a pair, so the shortlists show a mix.
      let pick = makePick(pool, recipient.colorVeto, used, index % 3 === 0);
      while (seen.has(pickId(pick))) {
        pick = makePick(pool, recipient.colorVeto, used, false);
      }
      seen.add(pickId(pick));
      return {
        selectorId: selector.id,
        recipientId: recipient.id,
        card: pick,
      };
    });
  });
}

/**
 * Private workspaces, for two of the eight.
 *
 * Neither the decklist link nor the notes are required, and at any given
 * moment most people will not have filled them in — so the demo shows both
 * states rather than implying the fields are expected.
 */
function buildWorkspaces(
  participants: Participant[]
): Record<string, { decklistUrl: string | null; notes: string }> {
  return {
    [participants[0].id]: {
      decklistUrl: "https://moxfield.com/decks/demo-elves-and-tokens",
      notes:
        "Leaning elves — cheap bodies, one big finisher.\nStill need a sweeper answer.\nBudget so far: about $48.",
    },
    [participants[3].id]: {
      decklistUrl: "https://archidekt.com/decks/demo-artifact-storm",
      notes: "Artifact ramp into a big turn. Check the ban list before locking the commander.",
    },
  };
}

async function main() {
  const revealed = process.argv.slice(2).includes("--revealed");

  const pool = await fetchCommanderPool();
  const people = PEOPLE.map((p) => ({ ...p, id: randomUUID() }));
  const assignments = drawAssignments(people);

  const participants: Participant[] = people.map((person, index) => ({
    id: person.id,
    name: person.name,
    email: person.email,
    recipientId: assignments.get(person.id)!,
    token: mintToken(),
    colorVeto: person.colorVeto,
    themeVeto: person.themeVeto,
    themeWish: person.themeWish,
    discord: person.discord,
    exchangeRanking: person.exchangeRanking,
    selfCards: pickSelfCards(pool, person.colorVeto, index % 2 === 0),
  }));

  const selections = buildSelections(pool, participants);
  if (!selectionsAreReady(selections, participants)) {
    throw new Error(
      "The generated demo selections do not form a complete, drawable set."
    );
  }

  const event: EventData & {
    selections: SavedSelection[];
    workspaces: Record<string, { decklistUrl: string | null; notes: string }>;
  } = {
    participants,
    revealedAt: revealed ? new Date().toISOString() : null,
    selections,
    workspaces: buildWorkspaces(participants),
  };

  await mkdir("src/demo", { recursive: true });
  await writeFile("src/demo/demo-event.json", `${JSON.stringify(event, null, 2)}\n`);

  console.log(
    `Wrote ${participants.length} demo participants and ${selections.length} ` +
      `card selections (revealed: ${revealed}).`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
