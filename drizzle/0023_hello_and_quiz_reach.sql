CREATE TABLE "social_quiz_reach" (
	"id" text PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"segment" text NOT NULL,
	"question" integer NOT NULL,
	"reached" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_registrations" ADD COLUMN "hello_line" text;--> statement-breakpoint
CREATE UNIQUE INDEX "social_quiz_reach_idx" ON "social_quiz_reach" USING btree ("day","segment","question");