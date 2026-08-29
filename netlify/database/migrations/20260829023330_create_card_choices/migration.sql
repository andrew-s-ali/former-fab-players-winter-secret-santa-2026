CREATE TABLE "card_selections" (
	"selector_id" text,
	"recipient_id" text,
	"slot" integer,
	"card" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_selections_pkey" PRIMARY KEY("selector_id","recipient_id","slot")
);
--> statement-breakpoint
CREATE TABLE "secret_card_sets" (
	"giver_id" text PRIMARY KEY,
	"recipient_id" text NOT NULL,
	"cards" jsonb NOT NULL,
	"replaced_index" integer,
	"cashed_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
