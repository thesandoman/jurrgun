CREATE TABLE "identity_email_links" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email_hash" text NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_login_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"email_hash" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"used_at" timestamp with time zone,
	"ip_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "identity_email_links_hash_idx" ON "identity_email_links" USING btree ("email_hash");--> statement-breakpoint
CREATE INDEX "identity_email_links_account_idx" ON "identity_email_links" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "identity_login_codes_email_idx" ON "identity_login_codes" USING btree ("email_hash","created_at");--> statement-breakpoint
CREATE INDEX "identity_login_codes_ip_idx" ON "identity_login_codes" USING btree ("ip_hash","created_at");