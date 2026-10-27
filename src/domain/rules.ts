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
export type RomanceSide = {
  genderIdentity: string | null;
  romanceOpenTo: string[] | "everyone" | null;
  /** Optional orientation filter: only people who stated one of these. */
  orientation?: string | null;
  orientationOpenTo?: string[] | null;
  gender?: string | null;
  womenOnly?: boolean;
};

export function romanceCompatible(a: RomanceSide, b: RomanceSide): boolean {
  const accepts = (openTo: string[] | "everyone" | null, identity: string | null) =>
    openTo === "everyone" || (!!identity && Array.isArray(openTo) && openTo.includes(identity));
  const orientationOk = (filter: string[] | null | undefined, theirs: string | null | undefined) => !filter?.length || (!!theirs && filter.includes(theirs));
  return (
    accepts(a.romanceOpenTo, b.genderIdentity) &&
    accepts(b.romanceOpenTo, a.genderIdentity) &&
    orientationOk(a.orientationOpenTo, b.orientation) &&
    orientationOk(b.orientationOpenTo, a.orientation) &&
    womenOnlyOk(a, b)
  );
}

// ------------------------------------------------------ women-only spaces --
// Optional. Women and non-binary members can choose women-only buddies, deck, dating matches and
// chats (chats follow matches), and RSVP to events tagged women_only. The
// gender behind it is private: self-described, never shown, never verified.

export const WOMEN_ONLY_TAG = "women_only";
/** Who women-only spaces are for: women and non-binary members. */
export const WOMEN_SPACE_GENDERS: readonly string[] = ["woman", "non-binary"];
export const isWoman = (p: { gender?: string | null }) => !!p.gender && WOMEN_SPACE_GENDERS.includes(p.gender);
/** Only women and non-binary members can switch women-only on. */
export const canBeWomenOnly = (gender: string | null | undefined) => isWoman({ gender });

/** Neither side's women-only choice rules the other out. */
export function womenOnlyOk(a: { gender?: string | null; womenOnly?: boolean }, b: { gender?: string | null; womenOnly?: boolean }): boolean {
  return (!a.womenOnly || isWoman(b)) && (!b.womenOnly || isWoman(a));
}

/**
 * Events tagged open_to_more (dating partners, singles socials) exist only for
 * members with romance mode on: hidden from everyone else in Discover, the
 * event page, RSVP and the weekly plan, so friends-only members never see
 * dating anywhere (PRD v3 §3.4).
 */
export const OPEN_TO_MORE_TAG = "open_to_more";
export const romanceEventOk = (tags: string[], p: { relationship: string; romanceOn: boolean }) => !tags.includes(OPEN_TO_MORE_TAG) || romanceEligible(p);

/**
 * Tags an event saves with, given its partner organisation's kind (admin only).
 * A dating partner's event (dating and friend apps) always carries
 * open_to_more, so it reaches only members who chose Open to something more.
 * Staff can't remove it while the event belongs to that partner.
 */
export function partnerEventTags(tags: string[], partnerKind: string | null | undefined): string[] {
  if (partnerKind !== "dating" || tags.includes(OPEN_TO_MORE_TAG)) return tags;
  return [...tags, OPEN_TO_MORE_TAG];
}

/**
 * Whether a women-only event shows up for this member at all: hidden from
 * anyone whose (private) gender is set to something else. Members who haven't
 * said still see it, with the RSVP gate telling them how to set it.
 */
export const womenOnlyEventVisible = (tags: string[], p: { gender?: string | null }) =>
  !tags.includes(WOMEN_ONLY_TAG) || !p.gender || p.gender === "prefer_not" || isWoman(p);

/** Whether this member may RSVP to an event with these tags. */
export const womenOnlyEventOk = (tags: string[], p: { gender?: string | null }) => !tags.includes(WOMEN_ONLY_TAG) || isWoman(p);

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
  /** Showing up pays (reliableAttender, or a mutual "again" with the host or someone going). */
  boost?: boolean;
};

/**
 * Waitlist order: people with priority before people who lost it (2+
 * strikes); then verified residents first when the event gives them
 * priority; then people whose showing up earned a first seat (owner card
 * 10-16, tit-for-tat); then first come, first served.
 */
export function waitlistOrder(entries: WaitlistEntry[], residentPriority: boolean): WaitlistEntry[] {
  return entries.slice().sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    if (residentPriority && a.isResident !== b.isResident) return a.isResident ? -1 : 1;
    if (!!a.boost !== !!b.boost) return a.boost ? -1 : 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

/** Plans kept in a row that earn a first place on waitlists. */
export const RELIABLE_STREAK = 4;

/**
 * Kept their last RELIABLE_STREAK plans: each past meetup they held a seat
 * for, newest first, was checked in. A late cancel or no-show breaks the run;
 * missing one only means waiting for the next four (nothing is taken away).
 * Never shown as a score or streak.
 */
export function reliableAttender(past: { startsAt: Date; checkedIn: boolean }[]): boolean {
  const recent = past.slice().sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime()).slice(0, RELIABLE_STREAK);
  return recent.length === RELIABLE_STREAK && recent.every((r) => r.checkedIn);
}

// ---------------------------------------------------- privacy threshold --

export const K_THRESHOLD = 10;

/** A count that is safe to show, or null for "fewer than k" (PRD §12.5). */
export function safeCount(n: number, k: number = K_THRESHOLD): number | null {
  return n >= k ? n : null;
}

/** Counts the BMA sees are rounded to the nearest ROUND_TO (owner C1, 2026-10-26). */
export const ROUND_TO = 5;

/**
 * A research count as the BMA sees it: null under k, otherwise rounded to the
 * nearest 5. Rounding every shown cell (totals included) stops the hidden
 * "<10" cells being worked out by subtraction: row total minus the other
 * options, a column's districts against the overall, or a mean times n.
 */
export function roundedCount(n: number, k: number = K_THRESHOLD): number | null {
  if (safeCount(n, k) === null) return null;
  return Math.max(k, Math.round(n / ROUND_TO) * ROUND_TO);
}

/**
 * One table of counts shown to the BMA with its total (e.g. answers to one
 * question), safe against working a hidden cell out by subtraction (card D2):
 *
 * - every cell is roundedCount: "<10" under k, else nearest 5;
 * - complementary suppression: if exactly one cell is hidden, the smallest
 *   shown cell is hidden too, so "total minus the rest" never isolates one;
 * - when any cell is hidden, the total is rounded to the nearest 10 instead
 *   of 5, and percentages use that coarser total.
 *
 * test/rules-suppression.test.ts checks by brute force that no hidden cell
 * can be pinned to one value from what is shown. City Pulse tables use the
 * same rule extended for hidden columns and removed options: cellView in
 * src/routes/admin/pulse.tsx.
 */
export const COARSE_ROUND_TO = 10;

export type SafeTable = { cells: (number | null)[]; total: number | null; pcts: (number | null)[] };

export function safeTable(counts: readonly number[], k: number = K_THRESHOLD): SafeTable {
  const cells = counts.map((n) => roundedCount(n, k));
  if (cells.filter((x) => x === null).length === 1) {
    let j = -1;
    cells.forEach((x, i) => {
      if (x !== null && (j < 0 || counts[i] < counts[j])) j = i;
    });
    if (j >= 0) cells[j] = null;
  }
  const sum = counts.reduce((a, b) => a + b, 0);
  const anyHidden = cells.some((x) => x === null);
  const total = safeCount(sum, k) === null ? null : anyHidden ? Math.max(k, Math.round(sum / COARSE_ROUND_TO) * COARSE_ROUND_TO) : roundedCount(sum, k);
  const pcts = cells.map((x) => (x === null || !total ? null : Math.min(100, Math.round((x / total) * 100))));
  return { cells, total, pcts };
}

/** A whole-number percentage worked out from rounded counts, or null when either is hidden. */
export function roundedPct(k: number, n: number): number | null {
  const rk = roundedCount(k);
  const rn = roundedCount(n);
  return rk === null || rn === null || rn === 0 ? null : Math.min(100, Math.round((rk / rn) * 100));
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

// ------------------------------------------------- removal (fair process) --
//
// A member is only removed (suspended or banned) when a moderator names the
// Terms / code of conduct rule they broke, or once they have FLAGS_TO_REMOVE
// flags. A flag is a warning a moderator upheld after reviewing a report, so
// a pile of raw reports never removes anyone on its own. Event strikes
// (no-shows, late cancels) only pause RSVPs; they never remove an account.

export const FLAGS_TO_REMOVE = 3;
/** Flags count for a year. */
export const FLAG_WINDOW_DAYS = 365;
/** The automatic suspension when a third flag lands. */
export const FLAG_SUSPEND_DAYS = 30;

export function removalAllowed(p: { rule: string | null; flags: number }): boolean {
  return !!p.rule || p.flags >= FLAGS_TO_REMOVE;
}

/** True when this warning is the one that reaches the flag limit. */
export function flagLimitReached(flagsBefore: number): boolean {
  return flagsBefore + 1 === FLAGS_TO_REMOVE;
}

// --------------------------------------------------- healthy limits --
//
// Gentle by design: a weekly rhythm the member chooses (a confirm, never a
// block), a hard cap on upcoming RSVPs so nobody hoards seats, a daily cap on
// contact sharing, and "pause Jurrgun" for a break.

/** Upcoming RSVPs held at once. */
export const MAX_UPCOMING = 5;
/** Social plans a week the member is happy with (bio.rhythm, 1 to 4). */
export const DEFAULT_RHYTHM = 3;
export const RHYTHMS = [1, 2, 3, 4] as const;
/** Contact shares a day. */
export const MAX_SHARES_PER_DAY = 10;
/** Pause lengths offered, in weeks. */
export const PAUSE_WEEKS = [1, 2, 4] as const;

export const isPaused = (p: { pausedUntil?: Date | null }, now = new Date()) => !!p.pausedUntil && p.pausedUntil.getTime() > now.getTime();

/**
 * Late-night or very long events always go to review, even for hosts who
 * normally publish directly: they start 22:00 to 06:00 Bangkok, or run over 5 hours.
 */
export function lateOrLong(startsAt: Date, endsAt: Date): boolean {
  const h = new Date(startsAt.getTime() + 7 * HOUR).getUTCHours();
  return h >= 22 || h < 6 || endsAt.getTime() - startsAt.getTime() > 5 * HOUR;
}
