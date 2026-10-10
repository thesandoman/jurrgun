CREATE TABLE "identity_oauth_links" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"account_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "identity_oauth_links_provider_subject_idx" ON "identity_oauth_links" USING btree ("provider","subject");--> statement-breakpoint
CREATE INDEX "identity_oauth_links_account_idx" ON "identity_oauth_links" USING btree ("account_id");