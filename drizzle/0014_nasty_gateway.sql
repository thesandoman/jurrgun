CREATE TABLE "research_exit_reasons" (
	"id" text PRIMARY KEY NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "research_exit_reasons_created_idx" ON "research_exit_reasons" USING btree ("created_at");