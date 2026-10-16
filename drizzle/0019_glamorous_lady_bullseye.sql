CREATE TABLE "social_push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "social_push_endpoint_idx" ON "social_push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "social_push_account_idx" ON "social_push_subscriptions" USING btree ("account_id");