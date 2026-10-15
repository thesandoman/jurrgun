/**
 * The weekly plan ("hands-free"): two picks a week, so nobody has to scroll a
 * feed to find something. Pure: no database.
 *
 * Only objective signals count, each with a plain reason the member sees:
 * their interests and chosen activities against the event's tags, their
 * Bangkok Type's districts, home district, budget, free time windows, access
 * needs, energy against the event's intensity, group size, and who from their
 * buddy or circle is going. Hard rules first: age, language, seats, budget.
 * No popularity, no engagement prediction, no ranking of people.
 */

export type PlanMember = {
  id: string;
  age: number;
  district: string;
  languages: string[];
  interests: string[];
  /** Districts the member's Bangkok Type is drawn to. */
  typeDistricts: string[];
  activities: string[];
  budgetMax: number;
  times: string[];
  access: string[];
  energy?: string;
  groupSize?: string;
  /** "low" from the monthly social-energy check-in: smaller, closer, calmer picks. */
  socialEnergy?: string;
};

export type PlanEvent = {
  id: string;
  tags: string[];
  district: string;
  costThb: number;
  startsAt: Date;
  endsAt: Date;
  languages: string[];
  intensity: string;
  groupMax: number;
  ageMin: number;
  ageMax: number;
  seatsLeft: number;
  /** How many of the member's buddy and circle are going. */
  friendsGoing: number;
};

export type Pick = { kind: "event" | "quest"; ref: string; score: number; reasons: string[] };

const HOUR = 3_600_000;

/** Which TIME_WINDOWS slot an event starts in (Bangkok time). */
export function timeWindow(at: Date): string {
  const local = new Date(at.getTime() + 7 * HOUR);
  const day = local.getUTCDay();
  const h = local.getUTCHours();
  const weekend = day === 0 || day === 6;
  if (weekend) return h < 12 ? "weekend_morning" : h < 17 ? "weekend_afternoon" : "weekend_evening";
  return h < 12 ? "weekday_morning" : "weekday_evening";
}

const CALM = ["chill", "listener", "warm_slow"];
const LIVELY = ["chatty", "playful"];

/** The event's fit for this member, or null when a hard rule rules it out. */
export function scoreEvent(m: PlanMember, e: PlanEvent, now: Date): Pick | null {
  if (e.startsAt.getTime() <= now.getTime() || e.seatsLeft <= 0) return null;
  if (m.age < e.ageMin || m.age > e.ageMax) return null;
  if (!e.languages.some((l) => m.languages.includes(l))) return null;
  if (e.costThb > m.budgetMax) return null;
  const minutes = (e.endsAt.getTime() - e.startsAt.getTime()) / 60_000;
  let s = 0;
  const reasons: string[] = [];
  const add = (n: number, reason: string) => {
    s += n;
    reasons.push(reason);
  };
  const liked = e.tags.find((t) => m.activities.includes(t) || m.interests.includes(t));
  if (liked) add(3, `likes:${liked}`);
  if (e.district === m.district) add(2, `near:${e.district}`);
  else if (m.typeDistricts.includes(e.district)) add(2, `type_spot:${e.district}`);
  if (e.costThb === 0) add(1, "free");
  else if (Number.isFinite(m.budgetMax)) add(1, `budget:${e.costThb}`);
  if (m.times.includes(timeWindow(e.startsAt))) add(2, `time:${timeWindow(e.startsAt)}`);
  if (e.friendsGoing > 0) add(Math.min(6, 3 * e.friendsGoing), `friends:${e.friendsGoing}`);
  if (m.access.includes("step_free") && e.tags.includes("step_free")) add(2, "step_free");
  if (m.access.includes("short") && minutes <= 90) add(1, "short");
  if (m.energy && CALM.includes(m.energy) && e.intensity === "chill") add(1, "calm");
  if (m.energy && LIVELY.includes(m.energy) && e.intensity === "very_social") add(1, "lively");
  if (m.groupSize === "small" && e.groupMax <= 4) add(1, "small");
  if (m.groupSize === "table" && e.groupMax >= 4 && e.groupMax <= 6) add(1, "table");
  // Low social energy: closer, calmer, shorter.
  if (m.socialEnergy === "low") {
    if (e.intensity === "very_social") s -= 2;
    if (e.district === m.district) s += 1;
    if (minutes <= 90) s += 1;
  }
  return { kind: "event", ref: e.id, score: s, reasons };
}

/**
 * This week's two picks: the buddy quest (if there's one to do) and the best
 * event, or the two best events, preferring two different kinds of meetup.
 */
export function pickPlan(m: PlanMember, events: PlanEvent[], now: Date, quest?: { id: string } | null): Pick[] {
  const scored = events
    .map((e) => ({ e, p: scoreEvent(m, e, now) }))
    .filter((x): x is { e: PlanEvent; p: Pick } => !!x.p && x.p.score > 0)
    .sort((a, b) => b.p.score - a.p.score || a.e.startsAt.getTime() - b.e.startsAt.getTime() || (a.e.id < b.e.id ? -1 : 1));
  const picks: Pick[] = [];
  if (quest) picks.push({ kind: "quest", ref: quest.id, score: 0, reasons: ["buddy"] });
  const first = scored[0];
  if (first) picks.push(first.p);
  if (picks.length < 2 && first) {
    const second = scored.slice(1).find((x) => x.e.tags[0] !== first.e.tags[0]) ?? scored[1];
    if (second) picks.push(second.p);
  }
  return picks.slice(0, 2);
}

/** Why a plan was skipped. Fed into M&E and host ideas, never shown to anyone else. */
export const SKIP_REASONS = ["time", "money", "distance", "mood", "other"] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];
export const isSkipReason = (x: string): x is SkipReason => (SKIP_REASONS as readonly string[]).includes(x);
