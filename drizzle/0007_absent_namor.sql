CREATE TABLE "social_circle_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"from_account" text NOT NULL,
	"to_account" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_buddy_matches" ADD COLUMN "end_reason" text;--> statement-breakpoint
ALTER TABLE "social_buddy_matches" ADD COLUMN "end_requested_by" text;--> statement-breakpoint
ALTER TABLE "social_buddy_matches" ADD COLUMN "end_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_buddy_matches" ADD COLUMN "end_note" text;--> statement-breakpoint
CREATE UNIQUE INDEX "social_circle_shares_idx" ON "social_circle_shares" USING btree ("event_id","to_account");--> statement-breakpoint
CREATE INDEX "social_circle_shares_to_idx" ON "social_circle_shares" USING btree ("to_account");