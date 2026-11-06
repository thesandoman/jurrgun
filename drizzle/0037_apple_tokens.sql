CREATE TABLE "identity_apple_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "identity_apple_tokens_account_idx" ON "identity_apple_tokens" USING btree ("account_id");