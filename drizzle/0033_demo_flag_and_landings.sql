CREATE TABLE "social_src_landings" (
	"day" date NOT NULL,
	"code" text NOT NULL,
	"n" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity_accounts" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "social_src_landings_day_code_idx" ON "social_src_landings" USING btree ("day","code");
