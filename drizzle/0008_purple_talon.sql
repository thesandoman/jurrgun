CREATE TABLE "social_dating_intents" (
	"account_id" text PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"challenges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
