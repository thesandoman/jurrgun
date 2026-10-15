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

/** Shape of social_profiles.bio. Kept here so the schema has no app imports. */
export type ProfileBio = {
  comm?: string[];
  occupation?: string;
  occupationOther?: string;
  education?: string;
  educationDetail?: string;
  university?: string;
  universityName?: string;
  gradYear?: number;
  residency?: string;
  story?: string;
  bkkTime?: string;
  hometown?: string;
  guide?: boolean;
  learning?: string;
  learningLangs?: string[];
  energy?: string;
  weekend?: string;
  pay?: string[];
  bill?: string;
  travel?: string[];
  diet?: string[];
  spice?: string;
  pets?: string;
  punctual?: string;
  rhythm?: number;
  budget?: string;
  activities?: string[];
  meals?: string[];
  groupSize?: string;
  times?: string[];
  access?: string[];
  socialEnergy?: string;
  /** When the energy check-in was last answered (ISO), and the answer before it. */
  energyAt?: string;
  energyPrev?: string;
  deck?: string[];
  /** Dating prompts, romance mode only (deleted when it's switched off). */
  datingDeck?: string[];
  skipped?: string[];
  answers?: Record<string, { kind: string; value: string | number | string[]; photoKey?: string }>;
};

const ts = (name: string) => timestamp(name, { withTimezone: true });
const created = () => ts("created_at").notNull().defaultNow();

// ---------------------------------------------------------------- identity --

/**
 * host: a verified partner host, vendor or event platform (set by an admin).
 * circle_head: a member who leads a circle, approved by an admin or moderator
 * (social_circle_head_requests). Only these, partner admins and admins host.
 */
export const ROLES = ["user", "circle_head", "host", "partner_admin", "moderator", "insight_viewer", "bma_admin"] as const;
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
    /** Members whose events publish without review (set by bma_admin). */
    trustedHost: boolean("trusted_host").notNull().default(false),
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

/**
 * Sign in with Google or LINE: one row per provider identity, pointing at a
 * normal account. Only the provider's stable user id (`sub`) is kept; no
 * email, name or picture is stored.
 */
export const oauthLinks = pgTable(
  "identity_oauth_links",
  {
    id: text("id").primaryKey(),
    /** google | line */
    provider: text("provider").notNull(),
    subject: text("subject").notNull(),
    accountId: text("account_id").notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("identity_oauth_links_provider_subject_idx").on(t.provider, t.subject), index("identity_oauth_links_account_idx").on(t.accountId)],
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
    /** Romance data, like genderIdentity: optional, cleared when romance is switched off. */
    orientation: text("orientation"),
    /** Romance filter: only people of these orientations (null = anyone). */
    orientationOpenTo: jsonb("orientation_open_to").$type<string[]>(),
    /** Opt-in: show pronouns, orientation and who I'm open to, to members who are also open to dating. */
    showDatingPrefs: boolean("show_dating_prefs").notNull().default(false),
    /**
     * Private gender, kept separately from romance mode, used only for the
     * optional women-only spaces. Never shown to anyone.
     */
    gender: text("gender"),
    /** Women and non-binary only: buddies, the deck and dating matches (needs gender = woman or non-binary). */
    womenOnly: boolean("women_only").notNull().default(false),
    pronouns: text("pronouns"),
    showPronouns: boolean("show_pronouns").notNull().default(false),
    /** Opt-in "Bangkok Registered Resident" badge (only meaningful when verified). */
    showResidentBadge: boolean("show_resident_badge").notNull().default(false),
    ageMin: integer("age_min").notNull().default(18),
    ageMax: integer("age_max").notNull().default(99),
    prompts: jsonb("prompts").$type<Record<string, string>>().notNull().default({}),
    /**
     * The richer profile (src/content/profile.ts): communication styles, quick
     * facts, the member's personal prompt deck and their answers. Never holds
     * romance or identity data.
     */
    bio: jsonb("bio").$type<ProfileBio>().notNull().default({}),
    photoKey: text("photo_key"),
    newcomer: boolean("newcomer").notNull().default(false),
    locale: text("locale").notNull().default("th"),
    onboardedAt: ts("onboarded_at"),
    /** "Pause Jurrgun": out of buddy rounds, the deck and new tables until then. Circle and chats stay. */
    pausedUntil: ts("paused_until"),
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
    /**
     * draft | pending (a member's proposal, waiting for review) | rejected
     * (sent back with review_note) | published | cancelled
     */
    status: text("status").notNull().default("draft"),
    /** public (listed on Discover) | private (opens only with the private link) */
    visibility: text("visibility").notNull().default("public"),
    /** Secret for the private link (?t=…). Never logged or shown publicly; reset by the host. */
    privateToken: text("private_token"),
    /** Why a reviewer sent a proposal back, shown to its host. */
    reviewNote: text("review_note"),
    submittedAt: ts("submitted_at"),
    /** Host's own payment page (pay at the venue otherwise). https only; Jurrgun never takes payment. */
    paymentUrl: text("payment_url"),
    residentPriority: boolean("resident_priority").notNull().default(false),
    residentQuota: integer("resident_quota").notNull().default(0),
    buddyEnabled: boolean("buddy_enabled").notNull().default(false),
    /** Pay-it-forward: seats anyone may quietly claim for free, no questions asked. */
    freeSeats: integer("free_seats").notNull().default(0),
    buddyRoundAt: ts("buddy_round_at"),
    groupsPublishedAt: ts("groups_published_at"),
    /** Host-launched icebreaker shown on the live page. */
    activePrompt: text("active_prompt"),
    visitBangkokRoute: text("visitbangkok_route"),
    /** A Table Host's hangout for their regular table (social_regular_tables.id): it goes to the table's members. */
    regularTableId: text("regular_table_id"),
    createdBy: text("created_by").notNull(),
    createdAt: created(),
  },
  (t) => [
    index("social_events_starts_idx").on(t.startsAt),
    index("social_events_district_idx").on(t.district),
    index("social_events_status_idx").on(t.status),
    index("social_events_regular_table_idx").on(t.regularTableId),
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
    /** Took a pay-it-forward seat. Never shown to anyone but the member. */
    freeSeat: boolean("free_seat").notNull().default(false),
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
    /** A reported chat message (social_chat_messages.id). */
    targetMessage: text("target_message"),
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
    /** "Did you feel heard?" 1 to 5. Null for answers given before it was asked. */
    feltHeard: integer("felt_heard"),
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
  /**
   * Result extras: the top three types with their fit (0..100), letters
   * within the margin of error, margins, and twin-question consistency.
   * Null for results saved before this existed.
   */
  blend: jsonb("blend").$type<{ types: { key: string; fit: number }[]; unsure: string[]; consistency: number | null; margin?: Record<string, number> }>(),
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

// ----------------------------------------------------------- Bangkok Buddy --
// docs/BANGKOK-BUDDY.md. One buddy at a time, matched on Bangkok Type and
// districts; weekly quests at real places stamp a shared 50-district passport.

export const buddyOptins = pgTable("social_buddy_optins", {
  accountId: text("account_id").primaryKey(),
  /** friends | activity | open ("open to more"). PRIVATE: never shown to the buddy. */
  intent: text("intent").notNull(),
  active: boolean("active").notNull().default(true),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/**
 * One row per weekly clearinghouse round. Inserting the row is the lock: the
 * request that inserts it runs the round, everyone else sees it already ran.
 */
export const buddyRounds = pgTable("social_buddy_rounds", {
  week: text("week").primaryKey(),
  /** stable | pareto | empty */
  method: text("method").notNull(),
  pool: integer("pool").notNull().default(0),
  pairs: integer("pairs").notNull().default(0),
  ranAt: ts("ran_at").notNull().defaultNow(),
});

export const buddyMatches = pgTable(
  "social_buddy_matches",
  {
    id: text("id").primaryKey(),
    /** a < b. */
    aAccount: text("a_account").notNull(),
    bAccount: text("b_account").notNull(),
    /** ISO week the match was made, e.g. "2026-W42". One new match per person per week. */
    week: text("week").notNull(),
    /** proposed (waiting for both to say meet) | active | ended */
    state: text("state").notNull(),
    aMeetAt: ts("a_meet_at"),
    bMeetAt: ts("b_meet_at"),
    /** The circle connection created when both said meet. */
    connectionId: text("connection_id"),
    endedBy: text("ended_by"),
    endedAt: ts("ended_at"),
    /** mutual | moved_off_app | notice | pass | expired | blocked (no ghosting: see /code-of-conduct). */
    endReason: text("end_reason"),
    /** A kind wrap-up asked for by one buddy; it closes when the other agrees, or after 7 days. */
    endRequestedBy: text("end_requested_by"),
    endRequestedAt: ts("end_requested_at"),
    /** The wrap-up note key (WRAP_NOTES in domain/buddy.ts), told to the other buddy. */
    endNote: text("end_note"),
    createdAt: created(),
  },
  (t) => [index("social_buddy_matches_a_idx").on(t.aAccount, t.state), index("social_buddy_matches_b_idx").on(t.bAccount, t.state)],
);

/**
 * The buddy deck: who a member flicked "keen" or "pass" on. Private, never
 * shown to the other person. It only feeds the daily clearinghouse round
 * (domain/buddy.ts): keen ranks someone higher, pass rules them out.
 */
export const buddySwipes = pgTable(
  "social_buddy_swipes",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    targetId: text("target_id").notNull(),
    /** keen | pass */
    choice: text("choice").notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("social_buddy_swipes_pair_idx").on(t.accountId, t.targetId), index("social_buddy_swipes_target_idx").on(t.targetId)],
);

export const buddyQuests = pgTable(
  "social_buddy_quests",
  {
    id: text("id").primaryKey(),
    matchId: text("match_id").notNull(),
    week: text("week").notNull(),
    /** The hand-written quiz-bank answer the quest comes from: scenario id + type code. */
    scenario: text("scenario").notNull(),
    typeCode: text("type_code").notNull(),
    district: text("district").notNull(),
    aDoneAt: ts("a_done_at"),
    bDoneAt: ts("b_done_at"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("social_buddy_quests_week_idx").on(t.matchId, t.week)],
);

export const passportStamps = pgTable(
  "social_passport_stamps",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    district: text("district").notNull(),
    /** buddy (a completed quest) */
    source: text("source").notNull(),
    questId: text("quest_id"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("social_passport_stamps_idx").on(t.accountId, t.district)],
);

/**
 * Why someone is here for dating, from the first onboarding screen. PRIVATE:
 * never shown to other members; only ever reported as totals.
 */
export const datingIntents = pgTable("social_dating_intents", {
  accountId: text("account_id").primaryKey(),
  /** friends | dating (friends and open to dating) | dating_only */
  mode: text("mode").notNull(),
  /** Why they're here for dating (DATING_REASONS keys). */
  reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
  /** What makes dating in Bangkok hard for them (DATING_CHALLENGES keys). */
  challenges: jsonb("challenges").$type<string[]>().notNull().default([]),
  /** Goal, kids, pace, first-date ideas, distance (content/dating.ts DatingPrefs). Private: matching only. */
  prefs: jsonb("prefs").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// -------------------------------------------------------------------- chat --
// Chat with limits (src/domain/chat.ts). Threads are not stored: a thread key
// (buddy:<matchId>, conn:<connectionId>, circle:<eventId>) is checked against
// the pairing, connection or hangout on every request.

export const chatMessages = pgTable(
  "social_chat_messages",
  {
    id: text("id").primaryKey(),
    thread: text("thread").notNull(),
    sender: text("sender").notNull(),
    body: text("body").notNull(),
    /** Asked for money or a transfer: the receiver sees a scam warning. */
    moneyFlag: boolean("money_flag").notNull().default(false),
    /** text | photo | poll. Photos and polls are for circle chats only. */
    kind: text("kind").notNull().default("text"),
    /** Photo messages: the private storage key (served only to thread members). */
    photoKey: text("photo_key"),
    /** Poll messages: the options; `body` is the question. */
    pollOptions: jsonb("poll_options").$type<string[]>(),
    /** Hidden by moderation (or the sender's block); the text is kept for review only. */
    hiddenAt: ts("hidden_at"),
    createdAt: created(),
  },
  (t) => [index("social_chat_messages_thread_idx").on(t.thread, t.createdAt), index("social_chat_messages_sender_idx").on(t.sender, t.createdAt)],
);

/** Where each member last read a thread. Private: never shown to the other side (no read receipts). */
/** One vote per member per poll; changing your vote replaces it. */
export const chatVotes = pgTable(
  "social_chat_votes",
  {
    messageId: text("message_id").notNull(),
    accountId: text("account_id").notNull(),
    option: integer("option").notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("social_chat_votes_pk").on(t.messageId, t.accountId)],
);

export const chatReads = pgTable(
  "social_chat_reads",
  {
    thread: text("thread").notNull(),
    accountId: text("account_id").notNull(),
    lastReadAt: ts("last_read_at").notNull(),
  },
  (t) => [uniqueIndex("social_chat_reads_idx").on(t.thread, t.accountId)],
);

/** Opt-in "home safe?" check after a first meet. */
export const safeArrivals = pgTable(
  "social_safe_arrivals",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    /** What it's about, e.g. buddy:<matchId>, event:<id>. */
    context: text("context").notNull(),
    backBy: ts("back_by").notNull(),
    /** safe | help */
    answer: text("answer"),
    answeredAt: ts("answered_at"),
    createdAt: created(),
  },
  (t) => [index("social_safe_arrivals_account_idx").on(t.accountId, t.backBy)],
);

// ---------------------------------------------------- feedback and plans --

/**
 * Mutual, private feedback after a one-to-one meet (a buddy quest). Never
 * shown to the other person; only used in aggregate (k-anonymous) and for
 * safety (felt safe 1 or 2 offers a report).
 */
export const meetFeedback = pgTable(
  "social_meet_feedback",
  {
    id: text("id").primaryKey(),
    /** quest (buddy quest) */
    kind: text("kind").notNull(),
    /** The quest id. */
    ref: text("ref").notNull(),
    accountId: text("account_id").notNull(),
    /** The other person, for safety follow-up only. */
    aboutAccount: text("about_account"),
    showedUp: boolean("showed_up"),
    onTime: boolean("on_time"),
    feltSafe: integer("felt_safe"),
    feltHeard: integer("felt_heard"),
    wouldMeetAgain: boolean("would_meet_again"),
    comment: text("comment").notNull().default(""),
    createdAt: created(),
  },
  (t) => [uniqueIndex("social_meet_feedback_idx").on(t.kind, t.ref, t.accountId)],
);

/**
 * The weekly plan ("hands-free"): two picks made from the member's profile,
 * preferences and their buddy and circle, plus room to pitch their own.
 */
export const weeklyPlans = pgTable(
  "social_weekly_plans",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    week: text("week").notNull(),
    /** [{ kind: "event" | "quest", ref, reasons: string[] (keys) }] */
    picks: jsonb("picks").$type<{ kind: string; ref: string; reasons: string[] }[]>().notNull().default([]),
    /** open | accepted | skipped | rest */
    status: text("status").notNull().default("open"),
    /** time | money | distance | mood | other */
    skipReason: text("skip_reason"),
    acceptedRef: text("accepted_ref"),
    decidedAt: ts("decided_at"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("social_weekly_plans_idx").on(t.accountId, t.week)],
);

/** "Pitch my own": a plan a member proposes to their buddy or circle. */
export const planPitches = pgTable(
  "social_plan_pitches",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    week: text("week").notNull(),
    what: text("what").notNull(),
    district: text("district").notNull(),
    /** Free text: "Sat morning". */
    whenText: text("when_text").notNull(),
    /** buddy | circle */
    audience: text("audience").notNull(),
    createdAt: created(),
  },
  (t) => [index("social_plan_pitches_week_idx").on(t.week, t.accountId)],
);

export const pitchJoins = pgTable(
  "social_pitch_joins",
  {
    pitchId: text("pitch_id").notNull(),
    accountId: text("account_id").notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("social_pitch_joins_idx").on(t.pitchId, t.accountId)],
);

// ------------------------------------------------- people before the app --

/**
 * Graduation: two people who shared contacts and met at least twice. Jurrgun
 * celebrates them, stops nudging them, and asks each once, 30 days later,
 * whether they're still in touch (M&E only).
 */
export const graduations = pgTable(
  "social_graduations",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id").notNull(),
    aStill: boolean("a_still"),
    bStill: boolean("b_still"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("social_graduations_conn_idx").on(t.connectionId)],
);

/** A private, one-line thank-you after meeting. No counts, no scores. */
export const thanks = pgTable(
  "social_thanks",
  {
    id: text("id").primaryKey(),
    fromAccount: text("from_account").notNull(),
    toAccount: text("to_account").notNull(),
    /** conn:<connectionId> */
    context: text("context").notNull(),
    body: text("body").notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("social_thanks_idx").on(t.fromAccount, t.toAccount, t.context), index("social_thanks_to_idx").on(t.toAccount, t.createdAt)],
);

/**
 * Why people left. Anonymous on purpose: no account id, so it can never be
 * tied back to a person. Shown to admins only as totals of 10 or more.
 */
export const exitReasons = pgTable(
  "research_exit_reasons",
  {
    id: text("id").primaryKey(),
    reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
    note: text("note").notNull().default(""),
    createdAt: created(),
  },
  (t) => [index("research_exit_reasons_created_idx").on(t.createdAt)],
);

/** A member asking to lead a circle (and so host its hangouts). Reviewed in /admin/review. */
export const circleHeadRequests = pgTable(
  "social_circle_head_requests",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    /** pending | approved | declined */
    status: text("status").notNull().default("pending"),
    circleName: text("circle_name").notNull(),
    /** What they'd host, in their words. */
    plan: text("plan").notNull().default(""),
    reviewedBy: text("reviewed_by"),
    reviewedAt: ts("reviewed_at"),
    /** Why it was declined, shown to the member. */
    reviewNote: text("review_note"),
    createdAt: created(),
  },
  (t) => [index("social_circle_head_requests_status_idx").on(t.status, t.createdAt), index("social_circle_head_requests_account_idx").on(t.accountId)],
);

/** A private hangout a host sent to their circle: shows on the recipient's circle page. */
export const circleShares = pgTable(
  "social_circle_shares",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    fromAccount: text("from_account").notNull(),
    toAccount: text("to_account").notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("social_circle_shares_idx").on(t.eventId, t.toAccount), index("social_circle_shares_to_idx").on(t.toAccount)],
);

/**
 * A regular table (โต๊ะประจำ): the recurring group a Table Host leads. Made
 * when an admin approves the host's request (social_circle_head_requests).
 * Members join through the host's invite link, or after a hangout with them.
 */
export const regularTables = pgTable(
  "social_regular_tables",
  {
    id: text("id").primaryKey(),
    hostAccountId: text("host_account_id").notNull(),
    name: text("name").notNull(),
    district: text("district").notNull(),
    /** A line or two, in the host's words. */
    description: text("description").notNull().default(""),
    /** Only women and non-binary members may join. Only a woman or non-binary host can set it. */
    womenOnly: boolean("women_only").notNull().default(false),
    /** Secret for the invite link (/tables/:id?t=…). Never logged; the host can reset it. */
    joinToken: text("join_token").notNull(),
    /** The approved Table Host request it came from, if any. */
    requestId: text("request_id"),
    createdAt: created(),
    archivedAt: ts("archived_at"),
  },
  (t) => [index("social_regular_tables_host_idx").on(t.hostAccountId), uniqueIndex("social_regular_tables_token_idx").on(t.joinToken)],
);

/** Who sits at a regular table (the host is not a row). Leaving sets left_at; joining again clears it. */
export const regularTableMembers = pgTable(
  "social_regular_table_members",
  {
    id: text("id").primaryKey(),
    tableId: text("table_id").notNull(),
    accountId: text("account_id").notNull(),
    joinedAt: ts("joined_at").notNull().defaultNow(),
    leftAt: ts("left_at"),
  },
  (t) => [uniqueIndex("social_regular_table_members_idx").on(t.tableId, t.accountId), index("social_regular_table_members_account_idx").on(t.accountId)],
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
export type RegularTable = typeof regularTables.$inferSelect;
export type BuddyMatch = typeof buddyMatches.$inferSelect;
export type BuddyQuest = typeof buddyQuests.$inferSelect;
