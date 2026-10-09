CREATE TABLE "identity_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"password_salt" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"partner_org_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"suspended_until" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	"verification" text DEFAULT 'none' NOT NULL,
	"bkk_registered" text DEFAULT 'not_checked' NOT NULL,
	"research_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"blocker" text NOT NULL,
	"blocked" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_buddy_pairs" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"members" jsonb NOT NULL,
	"method" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_connection_choices" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"from_account" text NOT NULL,
	"to_account" text NOT NULL,
	"choice" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"a_account" text NOT NULL,
	"b_account" text NOT NULL,
	"level" text NOT NULL,
	"event_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "social_consents" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"category" text NOT NULL,
	"granted" boolean NOT NULL,
	"version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_contact_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"account_id" text NOT NULL,
	"method" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_events" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"title_en" text,
	"description" text DEFAULT '' NOT NULL,
	"description_en" text,
	"cover_key" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"venue_name" text NOT NULL,
	"venue_address" text DEFAULT '' NOT NULL,
	"map_url" text,
	"district" text NOT NULL,
	"capacity" integer NOT NULL,
	"age_min" integer DEFAULT 18 NOT NULL,
	"age_max" integer DEFAULT 99 NOT NULL,
	"languages" jsonb DEFAULT '["th"]'::jsonb NOT NULL,
	"cost_thb" integer DEFAULT 0 NOT NULL,
	"payment_note" text,
	"host_account_id" text,
	"partner_org_id" text,
	"intensity" text DEFAULT 'social' NOT NULL,
	"group_min" integer DEFAULT 4 NOT NULL,
	"group_max" integer DEFAULT 6 NOT NULL,
	"plus_one_allowed" boolean DEFAULT false NOT NULL,
	"accessibility" text DEFAULT '' NOT NULL,
	"safety_info" text DEFAULT '' NOT NULL,
	"emergency_contact" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"resident_priority" boolean DEFAULT false NOT NULL,
	"resident_quota" integer DEFAULT 0 NOT NULL,
	"buddy_enabled" boolean DEFAULT false NOT NULL,
	"buddy_round_at" timestamp with time zone,
	"groups_published_at" timestamp with time zone,
	"active_prompt" text,
	"visitbangkok_route" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"account_id" text NOT NULL,
	"met_new_person" boolean,
	"would_meet_again" boolean,
	"felt_safe" integer,
	"group_rating" integer,
	"comment" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_moderation_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text,
	"account_id" text NOT NULL,
	"action" text NOT NULL,
	"until" timestamp with time zone,
	"note" text DEFAULT '' NOT NULL,
	"by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"kind" text NOT NULL,
	"title_th" text NOT NULL,
	"title_en" text NOT NULL,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_partner_orgs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_profiles" (
	"account_id" text PRIMARY KEY NOT NULL,
	"nickname" text NOT NULL,
	"birth_date" date NOT NULL,
	"district" text NOT NULL,
	"languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"interests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"social_styles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"event_style" text,
	"intents" jsonb DEFAULT '["friends"]'::jsonb NOT NULL,
	"relationship" text DEFAULT 'prefer_not' NOT NULL,
	"last_single_switch_at" timestamp with time zone,
	"romance_on" boolean DEFAULT false NOT NULL,
	"gender_identity" text,
	"romance_open_to" jsonb,
	"pronouns" text,
	"show_pronouns" boolean DEFAULT false NOT NULL,
	"age_min" integer DEFAULT 18 NOT NULL,
	"age_max" integer DEFAULT 99 NOT NULL,
	"prompts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"photo_key" text,
	"newcomer" boolean DEFAULT false NOT NULL,
	"locale" text DEFAULT 'th' NOT NULL,
	"onboarded_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_pulse_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt_th" text NOT NULL,
	"prompt_en" text NOT NULL,
	"kind" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"active_from" timestamp with time zone,
	"active_to" timestamp with time zone,
	"segment" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_pulse_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL,
	"research_id" text NOT NULL,
	"answer" jsonb NOT NULL,
	"district" text,
	"age_band" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_registrations" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"account_id" text NOT NULL,
	"status" text NOT NULL,
	"offered_until" timestamp with time zone,
	"plus_one_with" text,
	"plus_one_username" text,
	"wants_buddy" boolean DEFAULT false NOT NULL,
	"pass_token" text NOT NULL,
	"checked_in_at" timestamp with time zone,
	"checked_in_by" text,
	"check_in_method" text,
	"group_no" integer,
	"social_signal" text,
	"signal_topics" jsonb,
	"no_show_recorded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "social_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"reporter" text NOT NULL,
	"target_account" text,
	"target_event" text,
	"reason" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"severity" text DEFAULT 'standard' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_strikes" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"event_id" text NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"waived_by" text,
	"waived_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_wellbeing" (
	"id" text PRIMARY KEY NOT NULL,
	"research_id" text NOT NULL,
	"phase" text NOT NULL,
	"q1" integer NOT NULL,
	"q2" integer NOT NULL,
	"q3" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "identity_accounts_username_idx" ON "identity_accounts" USING btree ("username");--> statement-breakpoint
CREATE INDEX "identity_accounts_role_idx" ON "identity_accounts" USING btree ("role");--> statement-breakpoint
CREATE INDEX "identity_audit_created_idx" ON "identity_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "identity_audit_actor_idx" ON "identity_audit_log" USING btree ("actor");--> statement-breakpoint
CREATE UNIQUE INDEX "social_blocks_pair_idx" ON "social_blocks" USING btree ("blocker","blocked");--> statement-breakpoint
CREATE INDEX "social_blocks_blocked_idx" ON "social_blocks" USING btree ("blocked");--> statement-breakpoint
CREATE INDEX "social_buddy_pairs_event_idx" ON "social_buddy_pairs" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_choices_unique_idx" ON "social_connection_choices" USING btree ("event_id","from_account","to_account");--> statement-breakpoint
CREATE INDEX "social_choices_to_idx" ON "social_connection_choices" USING btree ("event_id","to_account");--> statement-breakpoint
CREATE UNIQUE INDEX "social_connections_pair_event_idx" ON "social_connections" USING btree ("a_account","b_account","event_id");--> statement-breakpoint
CREATE INDEX "social_connections_b_idx" ON "social_connections" USING btree ("b_account");--> statement-breakpoint
CREATE INDEX "social_consents_account_idx" ON "social_consents" USING btree ("account_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "social_contact_shares_idx" ON "social_contact_shares" USING btree ("connection_id","account_id");--> statement-breakpoint
CREATE INDEX "social_events_starts_idx" ON "social_events" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "social_events_district_idx" ON "social_events" USING btree ("district");--> statement-breakpoint
CREATE INDEX "social_events_status_idx" ON "social_events" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "social_feedback_unique_idx" ON "social_feedback" USING btree ("event_id","account_id");--> statement-breakpoint
CREATE INDEX "social_moderation_account_idx" ON "social_moderation_actions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "social_moderation_report_idx" ON "social_moderation_actions" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "social_notifications_account_idx" ON "social_notifications" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "social_profiles_district_idx" ON "social_profiles" USING btree ("district");--> statement-breakpoint
CREATE INDEX "research_pulse_questions_status_idx" ON "research_pulse_questions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "research_pulse_responses_unique_idx" ON "research_pulse_responses" USING btree ("question_id","research_id");--> statement-breakpoint
CREATE INDEX "research_pulse_responses_q_idx" ON "research_pulse_responses" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_registrations_event_account_idx" ON "social_registrations" USING btree ("event_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_registrations_pass_idx" ON "social_registrations" USING btree ("pass_token");--> statement-breakpoint
CREATE INDEX "social_registrations_account_idx" ON "social_registrations" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "social_registrations_event_status_idx" ON "social_registrations" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "social_reports_status_idx" ON "social_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "social_reports_target_idx" ON "social_reports" USING btree ("target_account");--> statement-breakpoint
CREATE INDEX "identity_sessions_account_idx" ON "identity_sessions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "social_strikes_account_idx" ON "social_strikes" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_strikes_event_account_idx" ON "social_strikes" USING btree ("event_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "research_wellbeing_unique_idx" ON "research_wellbeing" USING btree ("research_id","phase");