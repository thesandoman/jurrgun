CREATE TABLE "social_meet_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"ref" text NOT NULL,
	"account_id" text NOT NULL,
	"about_account" text,
	"showed_up" boolean,
	"on_time" boolean,
	"felt_safe" integer,
	"felt_heard" integer,
	"would_meet_again" boolean,
	"comment" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_pitch_joins" (
	"pitch_id" text NOT NULL,
	"account_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_plan_pitches" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"week" text NOT NULL,
	"what" text NOT NULL,
	"district" text NOT NULL,
	"when_text" text NOT NULL,
	"audience" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_weekly_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"week" text NOT NULL,
	"picks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"skip_reason" text,
	"accepted_ref" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_feedback" ADD COLUMN "felt_heard" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "social_meet_feedback_idx" ON "social_meet_feedback" USING btree ("kind","ref","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_pitch_joins_idx" ON "social_pitch_joins" USING btree ("pitch_id","account_id");--> statement-breakpoint
CREATE INDEX "social_plan_pitches_week_idx" ON "social_plan_pitches" USING btree ("week","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_weekly_plans_idx" ON "social_weekly_plans" USING btree ("account_id","week");