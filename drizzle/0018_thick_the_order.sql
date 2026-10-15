ALTER TABLE "identity_accounts" ADD COLUMN "signup_source" text;--> statement-breakpoint
ALTER TABLE "identity_partner_orgs" ADD COLUMN "kind" text DEFAULT 'events' NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_partner_orgs" ADD COLUMN "notes" text;