CREATE TABLE "social_graduations" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"a_still" boolean,
	"b_still" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_thanks" (
	"id" text PRIMARY KEY NOT NULL,
	"from_account" text NOT NULL,
	"to_account" text NOT NULL,
	"context" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_events" ADD COLUMN "free_seats" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "social_registrations" ADD COLUMN "free_seat" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "social_graduations_conn_idx" ON "social_graduations" USING btree ("connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_thanks_idx" ON "social_thanks" USING btree ("from_account","to_account","context");--> statement-breakpoint
CREATE INDEX "social_thanks_to_idx" ON "social_thanks" USING btree ("to_account","created_at");