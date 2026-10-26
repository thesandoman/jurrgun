CREATE TABLE "social_pinkies" (
	"id" text PRIMARY KEY NOT NULL,
	"a_account" text NOT NULL,
	"b_account" text NOT NULL,
	"source" text NOT NULL,
	"source_key" text NOT NULL,
	"connection_id" text NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"paused_by" text,
	"paused_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_pinky_idea_views" (
	"id" text PRIMARY KEY NOT NULL,
	"pinky_id" text NOT NULL,
	"day" text NOT NULL,
	"shown" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_pinky_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"pinky_id" text NOT NULL,
	"place_name" text,
	"idea_key" text,
	"district" text,
	"starts_at" timestamp with time zone,
	"note" text DEFAULT '' NOT NULL,
	"a_confirmed_at" timestamp with time zone,
	"b_confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "social_pinkies_connection_idx" ON "social_pinkies" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "social_pinkies_a_idx" ON "social_pinkies" USING btree ("a_account");--> statement-breakpoint
CREATE INDEX "social_pinkies_b_idx" ON "social_pinkies" USING btree ("b_account");--> statement-breakpoint
CREATE UNIQUE INDEX "social_pinky_idea_views_day_idx" ON "social_pinky_idea_views" USING btree ("pinky_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "social_pinky_plans_pinky_idx" ON "social_pinky_plans" USING btree ("pinky_id");
