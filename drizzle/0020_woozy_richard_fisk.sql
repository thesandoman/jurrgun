ALTER TABLE "social_events" ADD COLUMN "day_status" text;--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "day_status_note" text;--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "day_status_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "venue_notes" text;--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "venue_notes_en" text;--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "nearest_station" text;--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "walk_minutes" integer;--> statement-breakpoint
ALTER TABLE "social_registrations" ADD COLUMN "eta_status" text;--> statement-breakpoint
ALTER TABLE "social_registrations" ADD COLUMN "eta_at" timestamp with time zone;