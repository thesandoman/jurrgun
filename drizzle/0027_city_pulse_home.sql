CREATE TABLE "research_place_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"venue" text NOT NULL,
	"district" text NOT NULL,
	"reach" text,
	"comfort" text,
	"month" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_pulse_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"topic" text,
	"status" text DEFAULT 'new' NOT NULL,
	"month" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "research_pulse_questions" ADD COLUMN "heard_note_th" text;--> statement-breakpoint
ALTER TABLE "research_pulse_questions" ADD COLUMN "heard_note_en" text;--> statement-breakpoint
ALTER TABLE "research_pulse_questions" ADD COLUMN "heard_note_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_feedback" ADD COLUMN "place_checked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "research_place_checks_venue_idx" ON "research_place_checks" USING btree ("venue","district");--> statement-breakpoint
CREATE INDEX "research_pulse_suggestions_status_idx" ON "research_pulse_suggestions" USING btree ("status","month");
