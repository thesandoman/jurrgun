CREATE TABLE "social_chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread" text NOT NULL,
	"sender" text NOT NULL,
	"body" text NOT NULL,
	"money_flag" boolean DEFAULT false NOT NULL,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_chat_reads" (
	"thread" text NOT NULL,
	"account_id" text NOT NULL,
	"last_read_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_safe_arrivals" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"context" text NOT NULL,
	"back_by" timestamp with time zone NOT NULL,
	"answer" text,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "paused_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_reports" ADD COLUMN "target_message" text;--> statement-breakpoint
CREATE INDEX "social_chat_messages_thread_idx" ON "social_chat_messages" USING btree ("thread","created_at");--> statement-breakpoint
CREATE INDEX "social_chat_messages_sender_idx" ON "social_chat_messages" USING btree ("sender","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "social_chat_reads_idx" ON "social_chat_reads" USING btree ("thread","account_id");--> statement-breakpoint
CREATE INDEX "social_safe_arrivals_account_idx" ON "social_safe_arrivals" USING btree ("account_id","back_by");