CREATE TABLE "social_buddy_swipes" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"target_id" text NOT NULL,
	"choice" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_dating_intents" ADD COLUMN "prefs" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "social_buddy_swipes_pair_idx" ON "social_buddy_swipes" USING btree ("account_id","target_id");--> statement-breakpoint
CREATE INDEX "social_buddy_swipes_target_idx" ON "social_buddy_swipes" USING btree ("target_id");