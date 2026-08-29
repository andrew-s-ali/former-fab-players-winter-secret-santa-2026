import { integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import type { Commander } from "../src/lib/scryfall/types";

export const cardSelections = pgTable(
  "card_selections",
  {
    selectorId: text("selector_id").notNull(),
    recipientId: text("recipient_id").notNull(),
    slot: integer().notNull(),
    card: jsonb().$type<Commander>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.selectorId, table.recipientId, table.slot] })]
);

export const secretCardSets = pgTable("secret_card_sets", {
  giverId: text("giver_id").primaryKey(),
  recipientId: text("recipient_id").notNull(),
  cards: jsonb().$type<[Commander, Commander, Commander, Commander]>().notNull(),
  replacedIndex: integer("replaced_index"),
  cashedInAt: timestamp("cashed_in_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
