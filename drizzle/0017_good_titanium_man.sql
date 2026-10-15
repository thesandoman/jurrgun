CREATE TABLE "social_regular_table_members" (
	"id" text PRIMARY KEY NOT NULL,
	"table_id" text NOT NULL,
	"account_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
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
CREATE UNIQUE INDEX "social_regular_table_members_idx" ON "social_regular_table_members" USING btree ("table_id","account_id");--> statement-breakpoint
CREATE INDEX "social_regular_table_members_account_idx" ON "social_regular_table_members" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "social_regular_tables_host_idx" ON "social_regular_tables" USING btree ("host_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_regular_tables_token_idx" ON "social_regular_tables" USING btree ("join_token");--> statement-breakpoint
CREATE INDEX "social_events_regular_table_idx" ON "social_events" USING btree ("regular_table_id");