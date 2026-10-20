CREATE TABLE "social_event_partners" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"partner_org_id" text NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"invited_by" text,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_talk_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"body" text NOT NULL,
	"asker_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "talk_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "open_entry" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "approval_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "alcohol_served" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "smoking_area" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "requirements" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "group_label" text;--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "group_join_code" text;--> statement-breakpoint
CREATE UNIQUE INDEX "social_event_partners_pair_idx" ON "social_event_partners" USING btree ("event_id","partner_org_id");--> statement-breakpoint
CREATE INDEX "social_event_partners_org_idx" ON "social_event_partners" USING btree ("partner_org_id");--> statement-breakpoint
CREATE INDEX "social_talk_questions_event_idx" ON "social_talk_questions" USING btree ("event_id","created_at");