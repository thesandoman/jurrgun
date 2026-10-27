ALTER TABLE "identity_sessions" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity_sessions" ADD COLUMN "device" text;