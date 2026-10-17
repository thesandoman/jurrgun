CREATE TABLE "social_event_announcements" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"author_account_id" text,
	"kind" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "social_event_announcements_event_idx" ON "social_event_announcements" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "social_event_announcements_author_idx" ON "social_event_announcements" USING btree ("author_account_id");