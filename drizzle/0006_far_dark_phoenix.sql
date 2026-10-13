CREATE TABLE "social_buddy_matches" (
	"id" text PRIMARY KEY NOT NULL,
	"a_account" text NOT NULL,
	"b_account" text NOT NULL,
	"week" text NOT NULL,
	"state" text NOT NULL,
	"a_meet_at" timestamp with time zone,
	"b_meet_at" timestamp with time zone,
	"connection_id" text,
	"ended_by" text,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_buddy_optins" (
	"account_id" text PRIMARY KEY NOT NULL,
	"intent" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_buddy_quests" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"week" text NOT NULL,
	"scenario" text NOT NULL,
	"type_code" text NOT NULL,
	"district" text NOT NULL,
	"a_done_at" timestamp with time zone,
	"b_done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_buddy_rounds" (
	"week" text PRIMARY KEY NOT NULL,
	"method" text NOT NULL,
	"pool" integer DEFAULT 0 NOT NULL,
	"pairs" integer DEFAULT 0 NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_passport_stamps" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"district" text NOT NULL,
	"source" text NOT NULL,
	"quest_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "social_buddy_matches_a_idx" ON "social_buddy_matches" USING btree ("a_account","state");--> statement-breakpoint
CREATE INDEX "social_buddy_matches_b_idx" ON "social_buddy_matches" USING btree ("b_account","state");--> statement-breakpoint
CREATE UNIQUE INDEX "social_buddy_quests_week_idx" ON "social_buddy_quests" USING btree ("match_id","week");--> statement-breakpoint
CREATE UNIQUE INDEX "social_passport_stamps_idx" ON "social_passport_stamps" USING btree ("account_id","district");