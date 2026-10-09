CREATE TABLE "social_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"inviter" text NOT NULL,
	"used_by" text,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_login_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"ip_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_vibes" (
	"account_id" text PRIMARY KEY NOT NULL,
	"vector" jsonb NOT NULL,
	"archetype" text NOT NULL,
	"modifier" text,
	"seen" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"visible" boolean DEFAULT false NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "show_resident_badge" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "social_invites_event_inviter_idx" ON "social_invites" USING btree ("event_id","inviter");--> statement-breakpoint
CREATE INDEX "identity_login_attempts_user_idx" ON "identity_login_attempts" USING btree ("username","created_at");--> statement-breakpoint
CREATE INDEX "identity_login_attempts_ip_idx" ON "identity_login_attempts" USING btree ("ip_hash","created_at");