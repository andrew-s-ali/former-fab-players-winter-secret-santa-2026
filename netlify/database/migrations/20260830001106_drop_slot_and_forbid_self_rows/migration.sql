ALTER TABLE "card_selections" DROP COLUMN "slot";--> statement-breakpoint
ALTER TABLE "card_selections" ADD PRIMARY KEY ("selector_id","recipient_id");--> statement-breakpoint
ALTER TABLE "card_selections" ADD CONSTRAINT "card_selections_not_self" CHECK ("selector_id" <> "recipient_id");