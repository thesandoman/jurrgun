ALTER TABLE "social_profiles" ADD COLUMN "orientation" text;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "orientation_open_to" jsonb;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "show_dating_prefs" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "women_only" boolean DEFAULT false NOT NULL;