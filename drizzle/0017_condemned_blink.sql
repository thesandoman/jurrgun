CREATE TABLE "social_regular_table_conflicts" (
	"id" text PRIMARY KEY NOT NULL,
	"table_id" text NOT NULL,
	"a_account" text NOT NULL,
	"b_account" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_regular_table_members" (
	"id" text PRIMARY KEY NOT NULL,
	"table_id" text NOT NULL,
	"account_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"rejoin_after" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "social_regular_tables" (
	"id" text PRIMARY KEY NOT NULL,
	"host_account_id" text NOT NULL,
	"name" text NOT NULL,
	"district" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"women_only" boolean DEFAULT false NOT NULL,
	"join_token" text NOT NULL,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "regular_table_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "social_regular_table_conflicts_pair_idx" ON "social_regular_table_conflicts" USING btree ("table_id","a_account","b_account");--> statement-breakpoint
CREATE INDEX "social_regular_table_conflicts_status_idx" ON "social_regular_table_conflicts" USING btree ("table_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "social_regular_table_members_idx" ON "social_regular_table_members" USING btree ("table_id","account_id");--> statement-breakpoint
CREATE INDEX "social_regular_table_members_account_idx" ON "social_regular_table_members" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "social_regular_tables_host_idx" ON "social_regular_tables" USING btree ("host_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_regular_tables_token_idx" ON "social_regular_tables" USING btree ("join_token");--> statement-breakpoint
CREATE INDEX "social_events_regular_table_idx" ON "social_events" USING btree ("regular_table_id");--> statement-breakpoint
-- One-time backfill (owner, D19): every Table Host (circle_head) without an open regular table gets one, named from their latest approved request, in their profile's district. Safe to run again: it skips hosts who already have one.
INSERT INTO "social_regular_tables" ("id", "host_account_id", "name", "district", "description", "women_only", "join_token", "request_id", "created_at")
SELECT replace(gen_random_uuid()::text, '-', ''), r."account_id", left(r."circle_name", 60), p."district", '', false, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), r."id", now()
FROM (
	SELECT DISTINCT ON ("account_id") "id", "account_id", "circle_name"
	FROM "social_circle_head_requests"
	WHERE "status" = 'approved'
	ORDER BY "account_id", "created_at" DESC
) r
JOIN "identity_accounts" a ON a."id" = r."account_id" AND a."role" = 'circle_head'
JOIN "social_profiles" p ON p."account_id" = r."account_id"
WHERE NOT EXISTS (SELECT 1 FROM "social_regular_tables" t WHERE t."host_account_id" = r."account_id" AND t."archived_at" IS NULL);
