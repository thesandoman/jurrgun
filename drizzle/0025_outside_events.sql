CREATE TABLE "social_calendar_tokens" (
	"account_id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_event_feeds" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"source_name" text NOT NULL,
	"credit" text,
	"terms_note" text NOT NULL,
	"partner_org_id" text,
	"added_by" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_read_at" timestamp with time zone,
	"last_result" text,
	"last_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_event_inbox" (
	"id" text PRIMARY KEY NOT NULL,
	"dedupe_key" text NOT NULL,
	"feed_id" text,
	"partner_org_id" text,
	"source_name" text NOT NULL,
	"source_url" text,
	"credit" text,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"venue_name" text,
	"venue_address" text,
	"status" text DEFAULT 'new' NOT NULL,
	"attached_event_id" text,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_partner_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"org_name" text NOT NULL,
	"kind" text DEFAULT 'events' NOT NULL,
	"website" text,
	"contact" text NOT NULL,
	"about" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"partner_org_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_partner_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"partner_org_id" text NOT NULL,
	"key_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"created_by" text,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "source_name" text;--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "source_credit" text;--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "source_venue" text;--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "source_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "inbox_id" text;--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "warmup_url" text;--> statement-breakpoint
ALTER TABLE "identity_partner_orgs" ADD COLUMN "status" text DEFAULT 'verified' NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_partner_orgs" ADD COLUMN "website" text;--> statement-breakpoint
CREATE UNIQUE INDEX "social_calendar_tokens_token_idx" ON "social_calendar_tokens" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "social_event_feeds_url_idx" ON "social_event_feeds" USING btree ("url");--> statement-breakpoint
CREATE INDEX "social_event_feeds_partner_idx" ON "social_event_feeds" USING btree ("partner_org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_event_inbox_dedupe_idx" ON "social_event_inbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "social_event_inbox_status_idx" ON "social_event_inbox" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX "social_event_inbox_partner_idx" ON "social_event_inbox" USING btree ("partner_org_id");--> statement-breakpoint
CREATE INDEX "identity_partner_applications_status_idx" ON "identity_partner_applications" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "identity_partner_applications_account_idx" ON "identity_partner_applications" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_partner_keys_hash_idx" ON "identity_partner_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "identity_partner_keys_org_idx" ON "identity_partner_keys" USING btree ("partner_org_id");--> statement-breakpoint
CREATE INDEX "social_events_partner_idx" ON "social_events" USING btree ("partner_org_id");--> statement-breakpoint
CREATE INDEX "social_events_inbox_idx" ON "social_events" USING btree ("inbox_id");