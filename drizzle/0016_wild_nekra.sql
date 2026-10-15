CREATE TABLE "social_chat_votes" (
	"message_id" text NOT NULL,
	"account_id" text NOT NULL,
	"option" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_chat_messages" ADD COLUMN "kind" text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "social_chat_messages" ADD COLUMN "photo_key" text;--> statement-breakpoint
ALTER TABLE "social_chat_messages" ADD COLUMN "poll_options" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "social_chat_votes_pk" ON "social_chat_votes" USING btree ("message_id","account_id");