CREATE TABLE "identity_rejoin_holds" (
	"id" text PRIMARY KEY NOT NULL,
	"identity_hash" text NOT NULL,
	"account_id" text NOT NULL,
	"banned_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "identity_rejoin_holds_hash_idx" ON "identity_rejoin_holds" USING btree ("identity_hash");--> statement-breakpoint
CREATE INDEX "identity_rejoin_holds_account_idx" ON "identity_rejoin_holds" USING btree ("account_id");