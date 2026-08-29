ALTER TABLE "deck_builds" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "deck_builds" ALTER COLUMN "decklist_url" DROP NOT NULL;