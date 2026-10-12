ALTER TABLE "identity_accounts" ADD COLUMN "trusted_host" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "visibility" text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "private_token" text;--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "payment_url" text;