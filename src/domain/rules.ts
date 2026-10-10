/**
 * Jurrgun business rules as pure functions — no database, no request.
 * Every rule the PRD states precisely lives here so it can be tested
 * exhaustively (test/rules.test.ts) and reused by every route.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// ------------------------------------------------------------------ age --

/** Age on today's date in Bangkok (UTC+7, no DST), not UTC's date. */
export function ageOn(birthDate: string, now: Date = new Date()): number {
  const [y, m, d] = birthDate.split("-").map(Number);
  const bkk = new Date(now.getTime() + 7 * 3_600_000);
  let age = bkk.getUTCFullYear() - y;
  const beforeBirthday = bkk.getUTCMonth() + 1 < m || (bkk.getUTCMonth() + 1 === m && bkk.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

export const MIN_AGE = 18;

/** Coarse bands for research data — never the exact age. */
export function ageBand(age: number): string {
  if (age < 25) return "18-24";
  if (age < 30) return "25-29";
  if (age < 35) return "30-34";
  if (age < 45) return "35-44";
  if (age < 60) return "45-59";
  return "60+";
}

export function withinRange(age: number, min: number, max: number): boolean {
  return age >= min && age <= max;
}

/** Both people inside each other's private age preference (PRD §3.3). */
export function mutualAgeOk(
  a: { age: number; ageMin: number; ageMax: number },
  b: { age: number; ageMin: number; ageMax: number },
): boolean {
  return withinRange(b.age, a.ageMin, a.ageMax) && withinRange(a.age, b.ageMin, b.ageMax);
}

// ------------------------------------------------------- relationship --

export type Relationship = "single" | "relationship" | "married" | "prefer_not";

/** Romance features need Single AND romance mode switched on (PRD §4.2). */
export function romanceEligible(p: { relationship: string; romanceOn: boolean }): boolean {
  return p.relationship === "single" && p.romanceOn;
}

export const SINGLE_SWITCH_COOLDOWN_DAYS = 30;

/** Switching TO Single is allowed at most once per 30 days (PRD §4.4). */
export function canSwitchToSingle(lastSwitch: Date | null, now: Date = new Date()): boolean {
  return !lastSwitch || now.getTime() - lastSwitch.getTime() >= SINGLE_SWITCH_COOLDOWN_DAYS * DAY;
}

/**
 * Inclusive romance gate: works for any identities. `openTo` is a list of
 * identities or "everyone". Someone with no stated identity only matches
 * people open to everyone.
 */
export function romanceCompatible(
  a: { genderIdentity: string | null; romanceOpenTo: string[] | "everyone" | null },
  b: { genderIdentity: string | null; romanceOpenTo: string[] | "everyone" | null },
): boolean {
  const accepts = (openTo: string[] | "everyone" | null, identity: string | null) =>
    openTo === "everyone" || (!!identity && Array.isArray(openTo) && openTo.includes(identity));
  return accepts(a.romanceOpenTo, b.genderIdentity) && accepts(b.romanceOpenTo, a.genderIdentity);
}

// ------------------------------------------------- mutual consent (§10.3) --

export type Choice = "friend" | "activity" | "again" | "romance" | "none";
export type Level = "again" | "activity" | "friend" | "romance";

const RANK: Record<Level, number> = { again: 1, activity: 2, friend: 3, romance: 4 };

/**
 * The connection two private choices create, or null.
 *
 *  - Nothing is created unless BOTH made a positive choice.
 *  - The level is the more conservative of the two, so nobody ever learns a
 *    choice "above" what they chose themselves.
 *  - "romance" only counts when both chose it, both are eligible and the
 *    pair is romance-compatible. Otherwise it quietly acts as "friend" — an
 *    unreturned romantic interest is never revealed (PRD §10.3).
 */
export function resolveMutual(
  a: Choice,
  b: Choice,
  romanceOk: boolean,
): Level | null {
  if (a === "none" || b === "none") return null;
  if (a === "romance" && b === "romance" && romanceOk) return "romance";
  const norm = (c: Exclude<Choice, "none">): Level => (c === "romance" ? "friend" : c);
  const la = norm(a);
  const lb = norm(b);
  return RANK[la] <= RANK[lb] ? la : lb;
}

/** Choices a user may make, given eligibility. */
export function allowedChoices(romance: boolean): Choice[] {
  return romance ? ["friend", "activity", "again", "romance", "none"] : ["friend", "activity", "again", "none"];
}

// ---------------------------------------------------- People I Met window --

export const PEOPLE_WINDOW_HOURS = 72;

export function peopleWindow(endsAt: Date, now: Date = new Date()): "before" | "open" | "closed" {
  const t = now.getTime();
  if (t < endsAt.getTime()) return "before";
  if (t < endsAt.getTime() + PEOPLE_WINDOW_HOURS * HOUR) return "open";
  return "closed";
}

// ------------------------------------------------------- check-in window --

/** Opens 30 min before start, closes 60 min after start (PRD §9.1). */
export function checkInOpen(startsAt: Date, now: Date = new Date()): boolean {
  const t = now.getTime();
  return t >= startsAt.getTime() - 30 * 60_000 && t <= startsAt.getTime() + 60 * 60_000;
}

// -------------------------------------------------- strikes & no-shows (§24) --

export const STRIKE_DAYS = 90;
export const LATE_CANCEL_HOURS = 24;
export const SUSPEND_RSVP_DAYS = 30;

export function isLateCancel(startsAt: Date, now: Date = new Date()): boolean {
  return startsAt.getTime() - now.getTime() < LATE_CANCEL_HOURS * HOUR;
}

export function strikeExpiry(at: Date = new Date()): Date {
  return new Date(at.getTime() + STRIKE_DAYS * DAY);
}

export type StrikeRow = { createdAt: Date; expiresAt: Date; waivedBy: string | null };

export type StrikeStanding = {
  active: number;
  /** false at 2+ strikes: sorted last on waitlists. */
  waitlistPriority: boolean;
  /** At 2 strikes: only 1 upcoming RSVP at a time. */
  maxUpcoming: number | null;
  /** At 3+ strikes: no RSVPs until this date. */
  blockedUntil: Date | null;
};

export function strikeStanding(rows: StrikeRow[], now: Date = new Date()): StrikeStanding {
  const live = rows
    .filter((s) => !s.waivedBy && s.expiresAt.getTime() > now.getTime())
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const active = live.length;
  let blockedUntil: Date | null = null;
  if (active >= 3) {
    const until = new Date(live[2].createdAt.getTime() + SUSPEND_RSVP_DAYS * DAY);
    if (until.getTime() > now.getTime()) blockedUntil = until;
  }
  return {
    active,
    waitlistPriority: active < 2,
    maxUpcoming: active >= 2 ? 1 : null,
    blockedUntil,
  };
}

// ----------------------------------------------- RSVP, waitlist & quota --

export const OFFER_HOURS = 12;

export type SeatState = {
  capacity: number;
  /** Seats reserved for verified Bangkok-registered residents. */
  residentQuota: number;
  /** Currently confirmed or offered seats. */
  taken: number;
  /** Of those, held by non-residents. */
  takenByNonResidents: number;
};

/** Whether a new RSVP gets a seat now or joins the waitlist. */
export function seatAvailable(s: SeatState, isResident: boolean): boolean {
  if (s.taken >= s.capacity) return false;
  if (isResident) return true;
  return s.takenByNonResidents < s.capacity - Math.max(0, Math.min(s.residentQuota, s.capacity));
}

/**
 * After taking a seat: did that push the event past capacity (or past the
 * non-resident share)? Two people racing for the last seat both see a free
 * seat; this re-check after the write is what keeps the event from overbooking.
 */
export function seatsOverbooked(s: SeatState, isResident: boolean): boolean {
  if (s.taken > s.capacity) return true;
  if (isResident) return false;
  return s.takenByNonResidents > s.capacity - Math.max(0, Math.min(s.residentQuota, s.capacity));
}

export type WaitlistEntry = {
  id: string;
  createdAt: Date;
  isResident: boolean;
  /** From strikeStanding(). */
  priority: boolean;
};

/**
 * Waitlist order: people with priority before people who lost it (2+
 * strikes); then verified residents first when the event gives them
 * priority; then first come, first served.
 */
export function waitlistOrder(entries: WaitlistEntry[], residentPriority: boolean): WaitlistEntry[] {
  return entries.slice().sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    if (residentPriority && a.isResident !== b.isResident) return a.isResident ? -1 : 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

// ---------------------------------------------------- privacy threshold --

export const K_THRESHOLD = 10;

/** A count that is safe to show, or null for "fewer than k" (PRD §12.5). */
export function safeCount(n: number, k: number = K_THRESHOLD): number | null {
  return n >= k ? n : null;
}

// -------------------------------------------------------------- input --

export const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;

/**
 * Accounts made by "Sign in with Google / LINE" get a username like
 * "google_x7k2…" and no password the member knows. The prefixes are reserved
 * (sign-up refuses them), so the prefix alone marks a passwordless account.
 */
export const PROVIDER_USERNAME_RE = /^(google|line)_/;
export const isPasswordless = (username: string) => PROVIDER_USERNAME_RE.test(username);

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "too_short";
  if (pw.length > 200) return "too_long";
  return null;
}

/** Contact handles are shown to the other person; keep them plain. */
export function cleanHandle(raw: string): string | null {
  const v = raw.trim().replace(/^@/, "");
  return /^[A-Za-z0-9_.\-]{1,60}$/.test(v) ? v : null;
}
