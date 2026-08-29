CREATE TABLE "deck_builds" (
	"giver_id" text PRIMARY KEY,
	"decklist_url" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signups" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"color_veto" text,
	"theme_veto" text,
	"theme_wish" text,
	"self_cards" jsonb NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
