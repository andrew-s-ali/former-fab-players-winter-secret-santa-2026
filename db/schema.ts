import { integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import type { ColorCode } from "../src/lib/commanders";
import type { CommanderPick } from "../src/lib/pairing";

/**
 * Sign-ups, mirrored out of Netlify Forms.
 *
 * Written by `netlify/functions/signup-submitted.mts` when Netlify reports a
 * form submission, and read by `scripts/draw.ts`. Netlify Forms remains the
 * front door — it does the Akismet filtering and gives the organiser a
 * dashboard — this table is where a submission becomes usable data.
 *
 * The two card picks are resolved to full commanders **here**, at submission
 * time, rather than by name at draw time. The legal pool changes when a set is
 * released, so a pick that was valid when it was made can stop being valid
 * later; resolving on arrival means a set release cannot retroactively break a
 * sign-up that was fine.
 */
export const signups = pgTable("signups", {
  /**
   * Hash of the submission's own content.
   *
   * Netlify's form event carries no submission id (`FormSubmittedEvent` is
   * `{ data }` and nothing else), and platform-event functions are retried on
   * error — so the payload is the idempotency key. A retried delivery of the
   * same answers collides and is dropped; a genuine resubmission, where the
   * person changed something, hashes differently and lands as its own row for
   * `dedupeSignups` to arbitrate exactly as a second CSV row would.
   */
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Personal data. Shown only on the Identity-gated organiser console. */
  email: text("email").notNull(),
  colorVeto: text("color_veto").$type<ColorCode>(),
  themeVeto: text("theme_veto"),
  themeWish: text("theme_wish"),
  /**
   * The two commander choices this person seeds their own pool with.
   *
   * Each is a pick rather than a card: a partner pair is one choice, so it
   * fills one of the two slots, not both.
   */
  selfCards: jsonb("self_cards").$type<[CommanderPick, CommanderPick]>().notNull(),
  /**
   * When the row was written, which is when Netlify delivered the event —
   * within seconds of the submission. The event carries no timestamp of its
   * own, and this is only ever used to order resubmissions.
   */
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * A deck builder's private workspace: the decklist they are assembling for
 * their recipient, and their own scratch notes.
 *
 * Keyed by giver, never by recipient — reading this table must not reveal who
 * is building for whom to anyone who only has one side of the pair.
 *
 * Both columns are nullable and one row covers both, because a builder may
 * well have notes long before they have a deck to link to, or the reverse.
 */
export const deckBuilds = pgTable("deck_builds", {
  giverId: text("giver_id").primaryKey(),
  decklistUrl: text("decklist_url"),
  /**
   * Free-text working notes.
   *
   * These were browser-local until the participant asked for them to follow
   * their link across devices. That is a real trade, not a free upgrade: notes
   * about a named person now leave the browser and sit in the database, so the
   * UI says where they are kept rather than repeating the old "never sent to a
   * server" promise.
   */
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const cardSelections = pgTable(
  "card_selections",
  {
    selectorId: text("selector_id").notNull(),
    recipientId: text("recipient_id").notNull(),
    slot: integer().notNull(),
    /**
     * One commander choice — a commander and optionally its partner. The
     * column keeps its original name; the shape inside it gained a partner
     * when pairing was added, and jsonb needed no migration for that.
     */
    card: jsonb().$type<CommanderPick>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.selectorId, table.recipientId, table.slot] })]
);

export const secretCardSets = pgTable("secret_card_sets", {
  giverId: text("giver_id").primaryKey(),
  recipientId: text("recipient_id").notNull(),
  cards: jsonb().$type<[CommanderPick, CommanderPick, CommanderPick, CommanderPick]>().notNull(),
  replacedIndex: integer("replaced_index"),
  cashedInAt: timestamp("cashed_in_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
