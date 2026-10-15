CREATE TABLE "social_circle_head_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"circle_name" text NOT NULL,
	"plan" text DEFAULT '' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "social_circle_head_requests_status_idx" ON "social_circle_head_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "social_circle_head_requests_account_idx" ON "social_circle_head_requests" USING btree ("account_id");