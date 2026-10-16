CREATE TABLE "social_profile_links" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"network" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "social_profile_links_account_network_idx" ON "social_profile_links" USING btree ("account_id","network");