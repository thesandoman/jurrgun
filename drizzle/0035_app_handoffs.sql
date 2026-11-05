CREATE TABLE "identity_app_handoffs" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"challenge" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "identity_app_handoffs_account_idx" ON "identity_app_handoffs" USING btree ("account_id");