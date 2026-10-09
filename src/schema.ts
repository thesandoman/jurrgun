/**
 * Jurrgun database tables.
 *
 * Three logical stores, as the PRD (§12.3) asks, kept apart by table prefix:
 *
 *   identity_*  who someone IS: login, role, account status, verification.
 *   social_*    what they DO in the app: profile, events, connections.
 *   research_*  City Pulse answers, keyed ONLY by a pseudonymous research_id.
 *               The one link back to a person is identity_accounts.research_id.
 *
 * After ANY change here:
 *   npm run db:generate     # writes the SQL into drizzle/
 *   npm run db:migrate      # applies it to your LOCAL database
 *   npm run migrations      # regenerates src/migrations.ts for the deployed setup route
 */
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const created = () => ts("created_at").notNull().defaultNow();

// ---------------------------------------------------------------- identity --

export const ROLES = ["user", "host", "partner_admin", "moderator", "insight_viewer", "bma_admin"] as const;
export type Role = (typeof ROLES)[number];

export const accounts = pgTable(
  "identity_accounts",
  {
    id: text("id").primaryKey(),
    /** Lower-case, unique. Prototype login (PRD: OTP later). */
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    role: text("role").$type<Role>().notNull().default("user"),
    partnerOrgId: text("partner_org_id"),
    /** active | suspended | banned | deactivated */
    status: text("status").notNull().default("active"),
    suspendedUntil: ts("suspended_until"),
    deactivatedAt: ts("deactivated_at"),
    /** none | verified — account verification (PRD §5.1). */
    verification: text("verification").notNull().default("none"),
    /** not_checked | verified | not_verified (PRD §3.2). */
    bkkRegistered: text("bkk_registered").notNull().default("not_checked"),
    /** Pseudonymous id used in research_* tables. Cut on account deletion. */
    researchId: text("research_id"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("identity_accounts_username_idx").on(t.username), index("identity_accounts_role_idx").on(t.role)],
);

export const sessions = pgTable(
  "identity_sessions",
  {
    /** SHA-256 of the cookie token — the raw token is never stored. */
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: created(),
  },
  (t) => [index("identity_sessions_account_idx").on(t.accountId)],
);

export const partnerOrgs = pgTable("identity_partner_orgs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: created(),
});

// ------------------------------------------------------------------ social --

export const profiles = pgTable(
  "social_profiles",
  {
    accountId: text("account_id").primaryKey(),
    nickname: text("nickname").notNull(),
    birthDate: date("birth_date", { mode: "string" }).notNull(),
    district: text("district").notNull(),
    languages: jsonb("languages").$type<string[]>().notNull().default([]),
    interests: jsonb("interests").$type<string[]>().notNull().default([]),
    socialStyles: jsonb("social_styles").$type<string[]>().notNull().default([]),
    eventStyle: text("event_style"),
    /** friends | activity-buddy | explore | romance */
    intents: jsonb("intents").$type<string[]>().notNull().default(["friends"]),
    /** single | relationship | married | prefer_not */
    relationship: text("relationship").notNull().default("prefer_not"),
    lastSingleSwitchAt: ts("last_single_switch_at"),
    /** Romance mode (only possible when relationship = single). */
    romanceOn: boolean("romance_on").notNull().default(false),
    /** Private, optional, only kept while romance mode is on (PRD §3.4). */
    genderIdentity: text("gender_identity"),
    romanceOpenTo: jsonb("romance_open_to").$type<string[] | "everyone">(),
    pronouns: text("pronouns"),
    showPronouns: boolean("show_pronouns").notNull().default(false),
    /** Opt-in "Bangkok Registered Resident" badge (only meaningful when verified). */
    showResidentBadge: boolean("show_resident_badge").notNull().default(false),
    ageMin: integer("age_min").notNull().default(18),
    ageMax: integer("age_max").notNull().default(99),
    prompts: jsonb("prompts").$type<Record<string, string>>().notNull().default({}),
    photoKey: text("photo_key"),
    newcomer: boolean("newcomer").notNull().default(false),
    locale: text("locale").notNull().default("th"),
    onboardedAt: ts("onboarded_at"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("social_profiles_district_idx").on(t.district)],
);

/** Every consent change is a new row: the history is the audit trail (PRD §12.2). */
export const consents = pgTable(
  "social_consents",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    /** service | safety | personalization | research | notifications | romance_data */
    category: text("category").notNull(),
    granted: boolean("granted").notNull(),
    version: text("version").notNull(),
    createdAt: created(),
  },
  (t) => [index("social_consents_account_idx").on(t.accountId, t.category)],
);

export const events = pgTable(
  "social_events",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    titleEn: text("title_en"),
    description: text("description").notNull().default(""),
    descriptionEn: text("description_en"),
    coverKey: text("cover_key"),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    venueName: text("venue_name").notNull(),
    venueAddress: text("venue_address").notNull().default(""),
    mapUrl: text("map_url"),
    district: text("district").notNull(),
    capacity: integer("capacity").notNull(),
    ageMin: integer("age_min").notNull().default(18),
    ageMax: integer("age_max").notNull().default(99),
    languages: jsonb("languages").$type<string[]>().notNull().default(["th"]),
    costThb: integer("cost_thb").notNull().default(0),
    paymentNote: text("payment_note"),
    hostAccountId: text("host_account_id"),
    partnerOrgId: text("partner_org_id"),
    /** chill | social | very_social */
    intensity: text("intensity").notNull().default("social"),
    groupMin: integer("group_min").notNull().default(4),
    groupMax: integer("group_max").notNull().default(6),
    plusOneAllowed: boolean("plus_one_allowed").notNull().default(false),
    accessibility: text("accessibility").notNull().default(""),
    safetyInfo: text("safety_info").notNull().default(""),
    emergencyContact: text("emergency_contact").notNull().default(""),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    /** draft | published | cancelled */
    status: text("status").notNull().default("draft"),
    residentPriority: boolean("resident_priority").notNull().default(false),
    residentQuota: integer("resident_quota").notNull().default(0),
    buddyEnabled: boolean("buddy_enabled").notNull().default(false),
    buddyRoundAt: ts("buddy_round_at"),
    groupsPublishedAt: ts("groups_published_at"),
    /** Host-launched icebreaker shown on the live page. */
    activePrompt: text("active_prompt"),
    visitBangkokRoute: text("visitbangkok_route"),
    createdBy: text("created_by").notNull(),
    createdAt: created(),
  },
  (t) => [
    index("social_events_starts_idx").on(t.startsAt),
    index("social_events_district_idx").on(t.district),
    index("social_events_status_idx").on(t.status),
  ],
);

export const registrations = pgTable(
  "social_registrations",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    accountId: text("account_id").notNull(),
    /** confirmed | waitlisted | offered | cancelled | late_cancelled */
    status: text("status").notNull(),
    offeredUntil: ts("offered_until"),
    /** +1: the other attendee this person came with (host-linked or mutual). */
    plusOneWith: text("plus_one_with"),
    plusOneUsername: text("plus_one_username"),
    wantsBuddy: boolean("wants_buddy").notNull().default(false),
    /** Secret on the personal event pass; the host scans it. */
    passToken: text("pass_token").notNull(),
    checkedInAt: ts("checked_in_at"),
    checkedInBy: text("checked_in_by"),
    checkInMethod: text("check_in_method"),
    groupNo: integer("group_no"),
    socialSignal: text("social_signal"),
    signalTopics: jsonb("signal_topics").$type<string[]>(),
    noShowRecorded: boolean("no_show_recorded").notNull().default(false),
    createdAt: created(),
    cancelledAt: ts("cancelled_at"),
  },
  (t) => [
    uniqueIndex("social_registrations_event_account_idx").on(t.eventId, t.accountId),
    uniqueIndex("social_registrations_pass_idx").on(t.passToken),
    index("social_registrations_account_idx").on(t.accountId),
    index("social_registrations_event_status_idx").on(t.eventId, t.status),
  ],
);

export const buddyPairs = pgTable(
  "social_buddy_pairs",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    members: jsonb("members").$type<string[]>().notNull(),
    method: text("method").notNull(),
    createdAt: created(),
  },
  (t) => [index("social_buddy_pairs_event_idx").on(t.eventId)],
);

export const CHOICES = ["friend", "activity", "again", "romance", "none"] as const;
export type Choice = (typeof CHOICES)[number];

export const connectionChoices = pgTable(
  "social_connection_choices",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    fromAccount: text("from_account").notNull(),
    toAccount: text("to_account").notNull(),
    choice: text("choice").$type<Choice>().notNull(),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("social_choices_unique_idx").on(t.eventId, t.fromAccount, t.toAccount),
    index("social_choices_to_idx").on(t.eventId, t.toAccount),
  ],
);

export const connections = pgTable(
  "social_connections",
  {
    id: text("id").primaryKey(),
    /** a < b, so each pair has one row per event. */
    aAccount: text("a_account").notNull(),
    bAccount: text("b_account").notNull(),
    /** friend | activity | again | romance */
    level: text("level").notNull(),
    eventId: text("event_id").notNull(),
    createdAt: created(),
    removedAt: ts("removed_at"),
  },
  (t) => [
    uniqueIndex("social_connections_pair_event_idx").on(t.aAccount, t.bAccount, t.eventId),
    index("social_connections_b_idx").on(t.bAccount),
  ],
);

export const contactShares = pgTable(
  "social_contact_shares",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id").notNull(),
    accountId: text("account_id").notNull(),
    /** line | instagram | other */
    method: text("method").notNull(),
    value: text("value").notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("social_contact_shares_idx").on(t.connectionId, t.accountId)],
);

export const blocks = pgTable(
  "social_blocks",
  {
    id: text("id").primaryKey(),
    blocker: text("blocker").notNull(),
    blocked: text("blocked").notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("social_blocks_pair_idx").on(t.blocker, t.blocked), index("social_blocks_blocked_idx").on(t.blocked)],
);

export const REPORT_REASONS = [
  "harassment",
  "inappropriate_romantic",
  "misrepresented_relationship",
  "impersonation",
  "spam_scam",
  "unsafe",
  "discrimination",
  "misgendering_outing",
  "other",
] as const;

export const reports = pgTable(
  "social_reports",
  {
    id: text("id").primaryKey(),
    reporter: text("reporter").notNull(),
    targetAccount: text("target_account"),
    targetEvent: text("target_event"),
    reason: text("reason").notNull(),
    details: text("details").notNull().default(""),
    /** standard | critical */
    severity: text("severity").notNull().default("standard"),
    /** open | in_review | actioned | dismissed */
    status: text("status").notNull().default("open"),
    resolvedBy: text("resolved_by"),
    resolvedAt: ts("resolved_at"),
    createdAt: created(),
  },
  (t) => [index("social_reports_status_idx").on(t.status, t.createdAt), index("social_reports_target_idx").on(t.targetAccount)],
);

export const moderationActions = pgTable(
  "social_moderation_actions",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id"),
    accountId: text("account_id").notNull(),
    /** note | warning | suspend | ban | lift */
    action: text("action").notNull(),
    until: ts("until"),
    note: text("note").notNull().default(""),
    by: text("by").notNull(),
    createdAt: created(),
  },
  (t) => [index("social_moderation_account_idx").on(t.accountId), index("social_moderation_report_idx").on(t.reportId)],
);

export const strikes = pgTable(
  "social_strikes",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    eventId: text("event_id").notNull(),
    /** no_show | late_cancel */
    reason: text("reason").notNull(),
    expiresAt: ts("expires_at").notNull(),
    waivedBy: text("waived_by"),
    waivedReason: text("waived_reason"),
    createdAt: created(),
  },
  (t) => [
    index("social_strikes_account_idx").on(t.accountId),
    uniqueIndex("social_strikes_event_account_idx").on(t.eventId, t.accountId),
  ],
);

export const feedback = pgTable(
  "social_feedback",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    accountId: text("account_id").notNull(),
    metNewPerson: boolean("met_new_person"),
    wouldMeetAgain: boolean("would_meet_again"),
    feltSafe: integer("felt_safe"),
    groupRating: integer("group_rating"),
    comment: text("comment").notNull().default(""),
    createdAt: created(),
  },
  (t) => [uniqueIndex("social_feedback_unique_idx").on(t.eventId, t.accountId)],
);

export const notifications = pgTable(
  "social_notifications",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    kind: text("kind").notNull(),
    titleTh: text("title_th").notNull(),
    titleEn: text("title_en").notNull(),
    link: text("link"),
    readAt: ts("read_at"),
    createdAt: created(),
  },
  (t) => [index("social_notifications_account_idx").on(t.accountId, t.createdAt)],
);

// ---------------------------------------------------------------- research --

export const pulseQuestions = pgTable(
  "research_pulse_questions",
  {
    id: text("id").primaryKey(),
    promptTh: text("prompt_th").notNull(),
    promptEn: text("prompt_en").notNull(),
    /** single | multi | scale | text | area */
    kind: text("kind").notNull(),
    options: jsonb("options").$type<{ value: string; th: string; en: string }[]>().notNull().default([]),
    /** draft | active | paused | archived */
    status: text("status").notNull().default("draft"),
    activeFrom: ts("active_from"),
    activeTo: ts("active_to"),
    /** Target segment, e.g. { districts: [...], ageBands: [...] }. Empty = everyone. */
    segment: jsonb("segment").$type<{ districts?: string[]; ageBands?: string[] }>().notNull().default({}),
    sortOrder: integer("sort_order").notNull().default(0),
    createdBy: text("created_by").notNull(),
    createdAt: created(),
  },
  (t) => [index("research_pulse_questions_status_idx").on(t.status)],
);

/** Keyed by research_id only. District and age band are copied in coarse form for aggregation. */
export const pulseResponses = pgTable(
  "research_pulse_responses",
  {
    id: text("id").primaryKey(),
    questionId: text("question_id").notNull(),
    researchId: text("research_id").notNull(),
    answer: jsonb("answer").$type<string | string[] | number>().notNull(),
    district: text("district"),
    ageBand: text("age_band"),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("research_pulse_responses_unique_idx").on(t.questionId, t.researchId),
    index("research_pulse_responses_q_idx").on(t.questionId),
  ],
);

/** UCLA-3 loneliness items, baseline and follow-up (PRD §18.4). */
export const wellbeing = pgTable(
  "research_wellbeing",
  {
    id: text("id").primaryKey(),
    researchId: text("research_id").notNull(),
    /** baseline | followup */
    phase: text("phase").notNull(),
    q1: integer("q1").notNull(),
    q2: integer("q2").notNull(),
    q3: integer("q3").notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("research_wellbeing_unique_idx").on(t.researchId, t.phase)],
);

/**
 * Bangkok Vibe quiz result (non-political, 6 lifestyle categories). Its own
 * table so the quiz can run first in onboarding, before a profile exists.
 */
export const vibes = pgTable("social_vibes", {
  accountId: text("account_id").primaryKey(),
  /** −1..+1 per category (energy, explore, rhythm, motion, plan, culture). */
  vector: jsonb("vector").$type<Record<string, number>>().notNull(),
  /** Archetype key, e.g. "rhythm+" or "allrounder". */
  archetype: text("archetype").notNull(),
  /** Second-strongest pole for the name modifier, e.g. "explore+". */
  modifier: text("modifier"),
  /** Question ids answered so far, so retakes get fresh questions. */
  seen: jsonb("seen").$type<string[]>().notNull().default([]),
  /** Shown on profile / to groupmates only if the user opts in. */
  visible: boolean("visible").notNull().default(false),
  takenAt: ts("taken_at").notNull().defaultNow(),
});

/** Invite-a-friend links for +1 events (PRD §8.2). Token is the id. */
export const invites = pgTable(
  "social_invites",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    inviter: text("inviter").notNull(),
    usedBy: text("used_by"),
    usedAt: ts("used_at"),
    createdAt: created(),
  },
  (t) => [index("social_invites_event_inviter_idx").on(t.eventId, t.inviter)],
);

/** Failed sign-ins, for throttling (PRD §11 rate limiting). */
export const loginAttempts = pgTable(
  "identity_login_attempts",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    /** SHA-256 of the client IP — never the raw address. */
    ipHash: text("ip_hash").notNull(),
    createdAt: created(),
  },
  (t) => [index("identity_login_attempts_user_idx").on(t.username, t.createdAt), index("identity_login_attempts_ip_idx").on(t.ipHash, t.createdAt)],
);

// ------------------------------------------------------------------- audit --

export const auditLog = pgTable(
  "identity_audit_log",
  {
    id: text("id").primaryKey(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: created(),
  },
  (t) => [index("identity_audit_created_idx").on(t.createdAt), index("identity_audit_actor_idx").on(t.actor)],
);

export type Account = typeof accounts.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type Event = typeof events.$inferSelect;
export type Registration = typeof registrations.$inferSelect;
