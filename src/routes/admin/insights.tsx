/**
 * City Insight dashboard (/admin/insights): insight viewers and admins.
 *
 * Everything here is an SQL aggregate; no rows about people are loaded. Every
 * count and every ratio whose base is under k = 10 is suppressed and shown as
 * "<10" (PRD §12.5). Research tables (wellbeing, pulse) are never joined to
 * accounts. PRD §18.4 pilot targets sit next to each KPI.
 *
 * Two splits for the BMA (segmentFunnel, sourceFunnel): the funnel by the
 * member's own Bangkok story segment (local, newcomer, international), and
 * sign-ups and first RSVPs by first-touch placement source. Every cell keeps
 * the k = 10 rule; sources under 10 sign-ups fold into one "other" row.
 */
import { EXIT_REASONS } from "../../content/dating";
import { Hono } from "hono";
import { asc, and, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { getDb } from "../../db";
import { K_THRESHOLD, roundedCount, roundedPct, safeCount, safeTable } from "../../domain/rules";
import { bkkDay } from "../../services/landings";
import { bkkWeekStart } from "../../domain/pulse-heard";
import { OTHER_CODE, allowedCode, channelOf } from "../../content/src-codes";
import { bkkDayStart } from "../../domain/pulse-heard";
import { notDemo, notDemoEvent, notDemoResearch } from "../../services/demo";
import { DISTRICTS, label } from "../../lib/constants";
import type { AppEnv } from "../../lib/env";
import { requireRole } from "../../lib/session";
import { exitReasons, pulseQuestions, pulseResponses } from "../../schema";
import { INTERNATIONAL_STORIES, NEWCOMER_STORIES, type Segment } from "../../domain/segment";
import { Card, Empty, Notice, page, Stat, Tag, view } from "../../ui/kit";

export const adminInsights = new Hono<AppEnv>();
adminInsights.use("*", requireRole("insight_viewer"));

const WINDOWS = [30, 90, 365] as const;
const HARASSMENT_REASONS = ["harassment", "inappropriate_romantic", "misgendering_outing", "discrimination"];

/** pg-proxy rows come back positional (or keyed); normalise to numbers. */
function nums(rows: unknown): number[] {
  const r = (rows as unknown[])[0];
  if (!r) return [];
  const arr = Array.isArray(r) ? r : Object.values(r as Record<string, unknown>);
  return arr.map((x) => (x === null || x === undefined ? 0 : Number(x)));
}
function table(rows: unknown): unknown[][] {
  return (rows as unknown[]).map((r) => (Array.isArray(r) ? r : Object.values(r as Record<string, unknown>)));
}

/**
 * k/n as a whole percent for the BMA: worked out from rounded counts
 * (roundedPct), so null when either side is under k. A percent from exact
 * counts would give back a hidden "<10" cell (owner C1, card D2).
 */
export function pct(k: number, n: number): number | null {
  return roundedPct(k, n);
}

type Db = ReturnType<typeof getDb>;

/**
 * segmentOf(profile) as SQL over social_profiles aliased `p`. test/measurement
 * checks they agree. bio may be stored as a JSON string (driver dependent), so
 * unwrap it first, as events/shared.tsx jsonHas does.
 */
const STORY_SQL = sql`(case when jsonb_typeof(p.bio) = 'string' then (p.bio #>> '{}')::jsonb else p.bio end)->>'story'`;
export const SEGMENT_SQL = sql`case
  when ${STORY_SQL} in (${sql.join(INTERNATIONAL_STORIES.map((x) => sql`${x}`), sql`, `)}) then 'international'
  when p.newcomer or ${STORY_SQL} in (${sql.join(NEWCOMER_STORIES.map((x) => sql`${x}`), sql`, `)}) then 'newcomer'
  else 'local' end`;

const amongSql = (col: SQL, among?: string[]) => (among ? sql`and ${col} in (${sql.join(among.length ? among.map((x) => sql`${x}`) : [sql`null`], sql`, `)})` : sql``);

export const SEGMENTS: Segment[] = ["local", "newcomer", "international"];

/** Raw counts for one segment. Suppress with suppressSegment before showing. */
export type SegmentRow = {
  segment: Segment;
  members: number;
  joined: number;
  joinedRsvp: number;
  expected: number;
  checkedIn: number;
  withConnection: number;
};

/** What a viewer may see of one segment row: counts under k and ratios on a base under k are null. */
export type SegmentCells = {
  segment: Segment;
  members: number | null;
  regToRsvp: number | null;
  rsvpToCheckIn: number | null;
  mutualRate: number | null;
};

export function suppressSegment(r: SegmentRow): SegmentCells {
  return {
    segment: r.segment,
    members: roundedCount(r.members),
    regToRsvp: pct(r.joinedRsvp, r.joined),
    rsvpToCheckIn: pct(r.checkedIn, r.expected),
    mutualRate: pct(r.withConnection, r.checkedIn),
  };
}

/**
 * Members and the funnel by segment, as SQL aggregates only. Members are all
 * active onboarded members; the funnel uses the window like the KPIs above:
 * registration to first RSVP for members who joined in it, RSVP to check-in
 * and the mutual connection rate for published events that ended in it.
 * `among` narrows it to some accounts (tests).
 */
export async function segmentFunnel(db: Db, since: string, until: string, among?: string[]): Promise<SegmentRow[]> {
  const [members, joined, attendance] = await Promise.all([
    db.execute(sql`
      select ${SEGMENT_SQL} as seg, count(*)
      from identity_accounts a
      join social_profiles p on p.account_id = a.id
      where a.role = 'user' and a.status = 'active' and p.onboarded_at is not null and not a.is_demo ${amongSql(sql`a.id`, among)}
      group by 1`),
    db.execute(sql`
      select ${SEGMENT_SQL} as seg, count(*),
             sum(case when exists (select 1 from social_registrations r where r.account_id = a.id ${notDemoEvent(sql`r.event_id`)}) then 1 else 0 end)
      from identity_accounts a
      join social_profiles p on p.account_id = a.id
      where a.role = 'user' and p.onboarded_at is not null
        and a.created_at >= ${since}::timestamptz and a.created_at < ${until}::timestamptz and not a.is_demo ${amongSql(sql`a.id`, among)}
      group by 1`),
    db.execute(sql`
      select ${SEGMENT_SQL} as seg, count(*),
             sum(case when r.checked_in_at is not null then 1 else 0 end),
             sum(case when r.checked_in_at is not null and exists (
                   select 1 from social_connections x
                   where x.event_id = r.event_id and (x.a_account = r.account_id or x.b_account = r.account_id)
                 ) then 1 else 0 end)
      from social_registrations r
      join social_events e on e.id = r.event_id
      join social_profiles p on p.account_id = r.account_id
      where e.ends_at >= ${since}::timestamptz and e.ends_at < ${until}::timestamptz and e.status = 'published'
        and (r.status = 'confirmed' or r.checked_in_at is not null) ${notDemo(sql`r.account_id`)} ${notDemoEvent(sql`e.id`)} ${amongSql(sql`r.account_id`, among)}
      group by 1`),
  ]);
  const out = new Map<string, SegmentRow>(
    SEGMENTS.map((segment) => [segment, { segment, members: 0, joined: 0, joinedRsvp: 0, expected: 0, checkedIn: 0, withConnection: 0 }]),
  );
  for (const [seg, n] of table(members)) out.get(String(seg))!.members = Number(n ?? 0);
  for (const [seg, n, k] of table(joined)) Object.assign(out.get(String(seg))!, { joined: Number(n ?? 0), joinedRsvp: Number(k ?? 0) });
  for (const [seg, n, ci, wc] of table(attendance)) {
    Object.assign(out.get(String(seg))!, { expected: Number(n ?? 0), checkedIn: Number(ci ?? 0), withConnection: Number(wc ?? 0) });
  }
  return SEGMENTS.map((x) => out.get(x)!);
}

/** One row of the placement table, already suppressed (null = under k). */
export type SourceCells = { source: string; signups: number | null; firstRsvp: number | null; rate: number | null };

export const NO_SOURCE = "(direct)";
export const OTHER_SOURCES = "(other)";

/**
 * Sign-ups in the window by first-touch source (identity_accounts.signup_source),
 * and how many of them have RSVPed to anything. Sources with under k sign-ups
 * are folded into one OTHER_SOURCES row, so a rare campaign name never shows
 * next to a count small enough to point at someone. `among`: tests.
 */
export async function sourceFunnel(db: Db, since: string, until: string, among?: string[]): Promise<SourceCells[]> {
  const rows = await db.execute(sql`
    select coalesce(a.signup_source, ${NO_SOURCE}) as src, count(*),
           sum(case when exists (select 1 from social_registrations r where r.account_id = a.id ${notDemoEvent(sql`r.event_id`)}) then 1 else 0 end)
    from identity_accounts a
    where a.role = 'user' and not a.is_demo and a.created_at >= ${since}::timestamptz and a.created_at < ${until}::timestamptz ${amongSql(sql`a.id`, among)}
    group by 1
    order by 2 desc
    limit 500`);
  const big: { source: string; n: number; k: number }[] = [];
  const other = { source: OTHER_SOURCES, n: 0, k: 0 };
  for (const [src, n, k] of table(rows)) {
    const r = { source: String(src), n: Number(n ?? 0), k: Number(k ?? 0) };
    if (safeCount(r.n) === null) {
      other.n += r.n;
      other.k += r.k;
    } else big.push(r);
  }
  if (other.n > 0) big.push(other);
  return big.map((r) => ({ source: r.source, signups: roundedCount(r.n), firstRsvp: roundedCount(r.k), rate: pct(r.k, r.n) }));
}

export type LandingRow = {
  kind: "channel" | "code";
  channel: string;
  code: string;
  landings: number | null;
  /** Channel rows only: sign-ups are people, so code rows never show them (a channel minus its codes would). */
  signups: number | null;
  /** Sign-ups per 100 landings, channel rows only. */
  per100: number | null;
};

/** The Monday (YYYY-MM-DD, Bangkok) of the last `n` weeks, newest first, this week included. */
export function landingWeeks(now: Date, n = 8): string[] {
  const start = bkkWeekStart(now).getTime();
  return Array.from({ length: n }, (_, i) => bkkDay(new Date(start - i * 7 * 86_400_000)));
}

/**
 * Landings per campaign code for one Bangkok week, Monday to Sunday (owner C3,
 * Marketing 27 Oct 2026). Stored per day, shown per week. Codes are only the
 * allow-listed ones (content/src-codes.ts; anything else was stored as "other").
 * Each channel gets a roll-up row, counted even when its codes are each under 10,
 * with the sign-ups it brought (first touch, members only, never demo) and
 * sign-ups per 100 landings. Code rows show landings only, 10 or more. Every
 * figure goes through roundedCount / roundedPct.
 */
export async function landingWeek(db: Db, monday: string): Promise<LandingRow[]> {
  const start = new Date(`${monday}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 7 * 86_400_000);
  const [landRows, signRows] = await Promise.all([
    db.execute(sql`
      select code, sum(n) from social_src_landings
      where day >= ${monday}::date and day < (${monday}::date + 7)
      group by code
      limit 500`),
    db.execute(sql`
      select a.signup_source, count(*) from identity_accounts a
      where a.role = 'user' and not a.is_demo and a.signup_source is not null
        and a.created_at >= ${start.toISOString()}::timestamptz and a.created_at < ${end.toISOString()}::timestamptz
      group by 1
      limit 500`),
  ]);
  const byChannel = new Map<string, { landings: number; signups: number; codes: { code: string; landings: number }[] }>();
  const at = (ch: string) => {
    let x = byChannel.get(ch);
    if (!x) byChannel.set(ch, (x = { landings: 0, signups: 0, codes: [] }));
    return x;
  };
  for (const [code, n] of table(landRows)) {
    const c = allowedCode(String(code));
    const x = at(channelOf(c));
    x.landings += Number(n ?? 0);
    const prev = x.codes.find((y) => y.code === c);
    if (prev) prev.landings += Number(n ?? 0);
    else x.codes.push({ code: c, landings: Number(n ?? 0) });
  }
  for (const [src, n] of table(signRows)) at(channelOf(allowedCode(String(src)))).signups += Number(n ?? 0);
  const out: LandingRow[] = [];
  const channels = [...byChannel.entries()].sort((a, b) => (a[0] === OTHER_CODE ? 1 : b[0] === OTHER_CODE ? -1 : b[1].landings - a[1].landings || a[0].localeCompare(b[0])));
  for (const [channel, x] of channels) {
    out.push({ kind: "channel", channel, code: channel, landings: roundedCount(x.landings), signups: roundedCount(x.signups), per100: roundedPct(x.signups, x.landings) });
    for (const c of x.codes.filter((y) => safeCount(y.landings) !== null && y.code !== OTHER_CODE).sort((a, b) => b.landings - a.landings || a.code.localeCompare(b.code))) {
      out.push({ kind: "code", channel, code: c.code, landings: roundedCount(c.landings), signups: null, per100: null });
    }
  }
  return out;
}

type Kpi = {
  label: string;
  value: number | null;
  unit: "%" | "" | "/100";
  base: number;
  target?: { text: string; met: (v: number) => boolean };
  hint?: string;
  digits?: number;
};

adminInsights.get("/", async (c) => {
  const { t, lang } = view(c);
  const days = WINDOWS.includes(Number(c.req.query("days")) as 30) ? Number(c.req.query("days")) : 90;
  const now = new Date();
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const until = now.toISOString();
  const db = getDb(c.env);

  // Past events whose end falls in the window.
  const inWindow: SQL = sql`e.ends_at >= ${since}::timestamptz and e.ends_at < ${until}::timestamptz`;

  const [
    regToRsvp,
    attendance,
    repeat,
    connectionsN,
    fb,
    harassment,
    ucla,
    districtEvents,
    districtSafety,
    barrierQs,
  ] = await Promise.all([
    db.execute(sql`
      select count(*),
             sum(case when exists (select 1 from social_registrations r where r.account_id = a.id ${notDemoEvent(sql`r.event_id`)}) then 1 else 0 end)
      from identity_accounts a
      join social_profiles p on p.account_id = a.id
      where a.role = 'user' and not a.is_demo and p.onboarded_at is not null and a.created_at >= ${since}::timestamptz`),
    db.execute(sql`
      select count(*),
             sum(case when r.checked_in_at is not null then 1 else 0 end),
             sum(case when r.plus_one_with is not null then 1 else 0 end),
             sum(case when r.checked_in_at is not null and exists (
                   select 1 from social_connections x
                   where x.event_id = r.event_id and (x.a_account = r.account_id or x.b_account = r.account_id)
                 ) then 1 else 0 end)
      from social_registrations r
      join social_events e on e.id = r.event_id
      where ${inWindow} and e.status = 'published'
        and (r.status = 'confirmed' or r.checked_in_at is not null) ${notDemo(sql`r.account_id`)} ${notDemoEvent(sql`e.id`)}`),
    db.execute(sql`
      select count(*), sum(case when x.c >= 2 then 1 else 0 end), sum(x.c)
      from (
        select r.account_id, count(*) as c
        from social_registrations r
        join social_events e on e.id = r.event_id
        where r.checked_in_at is not null and ${inWindow} ${notDemo(sql`r.account_id`)} ${notDemoEvent(sql`e.id`)}
        group by r.account_id
      ) x`),
    db.execute(sql`
      select count(*)
      from social_connections x
      join social_events e on e.id = x.event_id
      where ${inWindow} ${notDemo(sql`x.a_account`)} ${notDemo(sql`x.b_account`)} ${notDemoEvent(sql`e.id`)}`),
    db.execute(sql`
      select count(*),
             count(f.met_new_person), sum(case when f.met_new_person then 1 else 0 end),
             count(f.would_meet_again), sum(case when f.would_meet_again then 1 else 0 end),
             count(f.felt_safe), sum(case when f.felt_safe >= 4 then 1 else 0 end),
             count(f.group_rating), avg(f.group_rating)
      from social_feedback f
      join social_events e on e.id = f.event_id
      where ${inWindow} ${notDemo(sql`f.account_id`)} ${notDemoEvent(sql`e.id`)}`),
    db.execute(sql`
      select count(*) from social_reports
      where created_at >= ${since}::timestamptz ${notDemo(sql`reporter`)} and reason in (${sql.join(HARASSMENT_REASONS.map((r) => sql`${r}`), sql`, `)})`),
    db.execute(sql`
      select phase, count(*), avg(q1 + q2 + q3)
      from research_wellbeing
      where true ${notDemoResearch(sql`research_id`)}
      group by phase
      limit 10`),
    db.execute(sql`
      select e.district, count(distinct e.id), sum(case when r.checked_in_at is not null then 1 else 0 end)
      from social_events e
      left join social_registrations r on r.event_id = e.id ${notDemo(sql`r.account_id`)}
      where ${inWindow} and e.status = 'published' ${notDemoEvent(sql`e.id`)}
      group by e.district
      limit 100`),
    db.execute(sql`
      select e.district, count(f.felt_safe), avg(f.felt_safe)
      from social_feedback f
      join social_events e on e.id = f.event_id
      where ${inWindow} ${notDemo(sql`f.account_id`)} ${notDemoEvent(sql`e.id`)}
      group by e.district
      limit 100`),
    db
      .select({ id: pulseQuestions.id, promptTh: pulseQuestions.promptTh, promptEn: pulseQuestions.promptEn, options: pulseQuestions.options })
      .from(pulseQuestions)
      .where(and(eq(pulseQuestions.status, "active"), eq(pulseQuestions.kind, "single")))
      .orderBy(asc(pulseQuestions.sortOrder))
      .limit(5),
  ]);

  // Table fill (Main, 27 Oct 2026): seats on published tables that ended in the window, never demo-hosted.
  const seatsRow = await db.execute(sql`
    select coalesce(sum(e.capacity), 0) from social_events e
    where ${inWindow} and e.status = 'published' ${notDemoEvent(sql`e.id`)}`);
  const [seatsN] = nums(seatsRow);

  const answerExpr = sql<string>`translate(${pulseResponses.answer}::text, '"\\', '')`;
  const barrierCounts = barrierQs.length
    ? await db
        .select({ q: pulseResponses.questionId, v: answerExpr, n: sql<number>`count(*)`.mapWith(Number) })
        .from(pulseResponses)
        // A daily snapshot, never live: these questions are open, and a refresh after one answer would show it (C1).
        .where(and(inArray(pulseResponses.questionId, barrierQs.map((q) => q.id)), lt(pulseResponses.createdAt, bkkDayStart(new Date())), sql`${pulseResponses.researchId} not in (select research_id from identity_accounts where is_demo and research_id is not null)`))
        .groupBy(pulseResponses.questionId, answerExpr)
        .limit(1000)
    : [];

  const [regN, regK] = nums(regToRsvp);
  const [expected, checkedIn, plusOnes, withConnection] = nums(attendance);
  const [activeMembers, repeaters, totalCheckins] = nums(repeat);
  const [connCount] = nums(connectionsN);
  const [fbN, metN, metYes, againN, againYes, safeN, safeYes, ratingN, ratingAvg] = nums(fb);
  const [harassN] = nums(harassment);

  const pctTarget = (min: number) => ({ text: `≥ ${min}%`, met: (v: number) => v >= min });
  const kpis: Kpi[] = [
    {
      label: t("สมัคร → ลงทะเบียนกิจกรรมแรก", "Registration → first RSVP"),
      value: pct(regK, regN),
      unit: "%",
      base: regN,
      target: pctTarget(40),
      hint: t("สมาชิกที่สมัครในช่วงนี้", "members who joined in this window"),
    },
    { label: t("ลงทะเบียน → เช็กอิน", "RSVP → check-in"), value: pct(checkedIn, expected), unit: "%", base: expected, target: pctTarget(70) },
    {
      label: t("ที่นั่งที่มีคนจอง (จอง ÷ ที่นั่ง)", "Table fill (RSVPs ÷ seats)"),
      value: roundedPct(expected, seatsN),
      unit: "%",
      base: seatsN,
      target: pctTarget(60),
      hint: t("ที่นั่งของโต๊ะที่จบในช่วงนี้ ปัดเป็นหลัก 5", "seats on tables that ended in this window, rounded to 5"),
    },
    {
      label: t("อัตราไม่มาตามนัด", "No-show rate"),
      value: pct(expected - checkedIn, expected),
      unit: "%",
      base: expected,
    },
    {
      label: t("คนเช็กอินที่ได้คนรู้จักใหม่ (เลือกตรงกัน) อย่างน้อย 1 คน", "Checked-in with ≥1 mutual connection"),
      value: pct(withConnection, checkedIn),
      unit: "%",
      base: checkedIn,
      target: pctTarget(50),
    },
    {
      label: t("คนรู้จักใหม่ต่อการเช็กอิน 1 ครั้ง", "Mutual connections per check-in"),
      value: safeCount(checkedIn) === null ? null : Math.round((connCount / checkedIn) * 100) / 100,
      unit: "",
      base: checkedIn,
      digits: 2,
    },
    {
      label: t("เข้าร่วมอย่างน้อย 2 กิจกรรม", "Attended ≥2 events"),
      value: pct(repeaters, activeMembers),
      unit: "%",
      base: activeMembers,
      target: pctTarget(30),
      hint: t("เป้าหมายวัดภายใน 60 วัน", "Target is measured within 60 days"),
    },
    {
      label: t("กิจกรรมเฉลี่ยต่อสมาชิกที่มาร่วม", "Avg events per active member"),
      value: safeCount(activeMembers) === null ? null : Math.round((totalCheckins / activeMembers) * 10) / 10,
      unit: "",
      base: activeMembers,
      digits: 1,
    },
    { label: t("อัตราการพาเพื่อน (+1)", "+1 rate"), value: pct(plusOnes, expected), unit: "%", base: expected },
    { label: t("ตอบแบบประเมินหลังกิจกรรม", "Feedback completion"), value: pct(fbN, checkedIn), unit: "%", base: checkedIn },
    {
      label: t("รายงานการคุกคามต่อผู้เข้าร่วม 100 คน", "Harassment reports per 100 attendees"),
      value: safeCount(checkedIn) === null ? null : Math.round((harassN / checkedIn) * 1000) / 10,
      unit: "/100",
      base: checkedIn,
      target: { text: "< 1", met: (v) => v < 1 },
      digits: 1,
    },
  ];

  const impact: Kpi[] = [
    { label: t("ได้พบคนใหม่อย่างน้อย 1 คน", "Met at least one new person"), value: pct(metYes, metN), unit: "%", base: metN },
    {
      label: t("อยากพบคนจากกิจกรรมอีก", "Would meet someone again"),
      value: pct(againYes, againN),
      unit: "%",
      base: againN,
      target: pctTarget(60),
    },
    {
      label: t("รู้สึกปลอดภัย (4 หรือ 5 จาก 5)", "Felt safe (4-5 of 5)"),
      value: pct(safeYes, safeN),
      unit: "%",
      base: safeN,
      target: pctTarget(90),
    },
    {
      label: t("คะแนนโต๊ะเฉลี่ย", "Avg table rating"),
      value: safeCount(ratingN) === null ? null : Math.round(ratingAvg * 10) / 10,
      unit: "",
      base: ratingN,
      digits: 1,
    },
  ];

  const uclaRows = table(ucla).map(([phase, n, avg]) => ({ phase: String(phase), n: Number(n), avg: avg === null ? null : Number(avg) }));
  const uclaOf = (phase: string) => {
    const r = uclaRows.find((x) => x.phase === phase);
    if (!r || safeCount(r.n) === null || r.avg === null) return { n: r?.n ?? 0, avg: null as number | null };
    return { n: r.n, avg: Math.round(r.avg * 100) / 100 };
  };
  const baseline = uclaOf("baseline");
  const followup = uclaOf("followup");

  // Per district.
  const dist = new Map<string, { events: number; checkins: number; safeN: number; safeAvg: number | null }>();
  for (const [d, ev, ci] of table(districtEvents)) {
    dist.set(String(d), { events: Number(ev), checkins: Number(ci ?? 0), safeN: 0, safeAvg: null });
  }
  for (const [d, n, avg] of table(districtSafety)) {
    const x = dist.get(String(d)) ?? { events: 0, checkins: 0, safeN: 0, safeAvg: null };
    x.safeN = Number(n);
    x.safeAvg = avg === null ? null : Number(avg);
    dist.set(String(d), x);
  }
  const districtRows = [...dist.entries()]
    .map(([d, x]) => ({ d, label: label(DISTRICTS, d, lang), ...x }))
    .sort((a, b) => b.events - a.events || a.label.localeCompare(b.label));

  // Top barriers.
  const barrierMap = new Map<string, Map<string, number>>();
  for (const r of barrierCounts) {
    let m = barrierMap.get(r.q);
    if (!m) barrierMap.set(r.q, (m = new Map()));
    m.set(r.v, (m.get(r.v) ?? 0) + r.n);
  }

  const fmt = (k: Kpi) => (k.value === null ? null : `${k.digits ? k.value.toFixed(k.digits) : k.value}${k.unit === "%" ? "%" : ""}`);
  const KpiTile = (props: { k: Kpi }) => {
    const k = props.k;
    const met = k.value !== null && k.target ? k.target.met(k.value) : null;
    const hint = [
      k.target ? `${t("เป้าหมาย", "Target")} ${k.target.text}` : null,
      k.base > 0 && roundedCount(k.base) !== null ? `n ≈ ${roundedCount(k.base)}` : null,
      k.hint ?? null,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <div>
        <Stat label={k.label} value={fmt(k)} hint={hint || undefined} />
        {met === null ? null : met ? <Tag tone="ok">{t("ถึงเป้า", "Target met")}</Tag> : <Tag tone="warn">{t("ยังไม่ถึงเป้า", "Below target")}</Tag>}
      </div>
    );
  };

  const weeks = landingWeeks(now);
  // Default: the last full week (Monday to Sunday); this week so far can be picked too.
  const landingMonday = weeks.includes(String(c.req.query("lweek"))) ? String(c.req.query("lweek")) : weeks[1];
  const [segRows, sources, landings] = await Promise.all([segmentFunnel(db, since, until), sourceFunnel(db, since, until), landingWeek(db, landingMonday)]);
  const segCells = segRows.map(suppressSegment);
  const SEG_LABEL: Record<Segment, [string, string]> = {
    local: ["คนกรุงเทพฯ", "Local"],
    newcomer: ["คนมาใหม่", "Newcomer"],
    international: ["ชาวต่างชาติ", "International"],
  };
  const cell = (n: number | null, unit = "") => (n === null ? "<10" : `${n}${unit}`);
  const sourceLabel = (s: string) => (s === NO_SOURCE ? t("ไม่มีแหล่งที่มา (เข้าตรง)", "No source (direct)") : s === OTHER_SOURCES ? t("อื่น ๆ (แต่ละแหล่งน้อยกว่า 10 คน)", "Other (each under 10)") : s);

  // Healthy connections: chat, safety checks, weekly plans and mutual meet feedback.
  // Pinky Plans (3 Wise Men condition): a pair's messages during their Pinky are left out of the chat
  // total, its money-flag count AND the chat reports, so "reports per 1,000 messages" stays one
  // definition (City Pulse & Research). The pair is matched in both orders. No Pinky-only count is shown.
  const winTs = sql`created_at >= ${since}::timestamptz and created_at < ${until}::timestamptz`;
  const [chatRow, safeRow, planRow, skipRows, meetRow, heardRow, pitchRow, gradRow] = await Promise.all([
    db.execute(sql`with pinky_msgs as (
        select m.id from social_chat_messages m
        join social_pinkies p
          on m.sender in (p.a_account, p.b_account)
         and m.created_at >= p.created_at and m.created_at <= coalesce(p.ended_at, now())
        where m.thread in (
            select 'conn:' || c.id from social_connections c
            where (c.a_account = p.a_account and c.b_account = p.b_account) or (c.a_account = p.b_account and c.b_account = p.a_account)
          )
          or m.thread in (
            select 'buddy:' || b.id from social_buddy_matches b
            where (b.a_account = p.a_account and b.b_account = p.b_account) or (b.a_account = p.b_account and b.b_account = p.a_account)
          )
      )
      select count(*), sum(case when money_flag then 1 else 0 end),
      (select count(*) from social_reports where target_message is not null and ${winTs} and target_message not in (select id from pinky_msgs)
        and target_message not in (select id from social_chat_messages where sender in (select id from identity_accounts where is_demo)))
      from social_chat_messages where ${winTs} and id not in (select id from pinky_msgs) ${notDemo(sql`sender`)}`),
    db.execute(sql`select count(*), sum(case when answer = 'help' then 1 else 0 end), sum(case when answer is not null then 1 else 0 end)
      from social_safe_arrivals where ${winTs} ${notDemo(sql`account_id`)}`),
    db.execute(sql`select count(*), sum(case when status = 'accepted' then 1 else 0 end), sum(case when status = 'skipped' then 1 else 0 end)
      from social_weekly_plans where ${winTs} ${notDemo(sql`account_id`)}`),
    db.execute(sql`select skip_reason, count(*) from social_weekly_plans where status = 'skipped' and ${winTs} ${notDemo(sql`account_id`)} group by skip_reason`),
    db.execute(sql`select count(*), sum(case when felt_safe >= 4 then 1 else 0 end), avg(felt_heard), count(felt_heard),
      sum(case when would_meet_again then 1 else 0 end), sum(case when showed_up then 1 else 0 end)
      from social_meet_feedback where ${winTs} ${notDemo(sql`account_id`)} ${notDemo(sql`about_account`)}`),
    db.execute(sql`select avg(felt_heard), count(felt_heard) from social_feedback where ${winTs} ${notDemo(sql`account_id`)}`),
    db.execute(sql`select count(*), (select count(*) from social_pitch_joins where ${winTs} ${notDemo(sql`account_id`)}) from social_plan_pitches where ${winTs} ${notDemo(sql`account_id`)}`),
    db.execute(sql`select count(*),
      sum(case when a_still is not null then 1 else 0 end) + sum(case when b_still is not null then 1 else 0 end),
      sum(case when a_still then 1 else 0 end) + sum(case when b_still then 1 else 0 end),
      (select count(*) from social_connections where ${winTs} ${notDemo(sql`a_account`)} ${notDemo(sql`b_account`)})
      from social_graduations where ${winTs}
        and connection_id not in (select id from social_connections where a_account in (select id from identity_accounts where is_demo) or b_account in (select id from identity_accounts where is_demo))`),
  ]);
  const [gradN, stillAnswered, stillYes, connsN] = nums(gradRow);
  // Counted here, not in SQL: jsonb arrays may come back as text through the proxy driver.
  const exitRows = await db.select({ reasons: exitReasons.reasons }).from(exitReasons).where(gte(exitReasons.createdAt, new Date(since))).limit(5000);
  const exitTally = new Map<string, number>();
  for (const row of exitRows) {
    const list: unknown = typeof row.reasons === "string" ? JSON.parse(row.reasons) : row.reasons;
    if (Array.isArray(list)) for (const r of list) exitTally.set(String(r), (exitTally.get(String(r)) ?? 0) + 1);
  }
  const exitCounts = [...exitTally.entries()]
    .map(([r, n]) => ({ r, n }))
    .filter((x) => safeCount(x.n) !== null)
    .sort((a, b) => b.n - a.n);
  const [msgs, moneyN, chatReports] = nums(chatRow);
  const [arrivals, helpN, answeredN] = nums(safeRow);
  const [plans, acceptedN, skippedN] = nums(planRow);
  const [meetN, meetSafe, meetHeardAvg, meetHeardN, meetAgain, meetShowed] = nums(meetRow);
  const [evHeardAvg, evHeardN] = nums(heardRow);
  const [pitchesN, joinsN] = nums(pitchRow);
  const avg1 = (v: number, n: number) => (safeCount(n) === null ? null : Math.round(v * 10) / 10);
  const healthy: Kpi[] = [
    { label: t("จบหลักสูตร: ไม่ต้องพึ่งเราแล้ว", "Graduated: don't need us anymore"), value: pct(gradN, connsN), unit: "%", base: connsN, hint: t("คู่ที่แลกช่องทางติดต่อและเจอกัน 2 ครั้งขึ้นไป ต่อคู่ใหม่", "Pairs who swapped contacts and met 2+ times, per new pair") },
    { label: t("ยังติดต่อกันหลัง 30 วัน", "Still in touch after 30 days"), value: pct(stillYes, stillAnswered), unit: "%", base: stillAnswered },
    { label: t("ยอมรับแผนประจำสัปดาห์", "Weekly plan accepted"), value: pct(acceptedN, plans), unit: "%", base: plans },
    { label: t("ข้ามแผนประจำสัปดาห์", "Weekly plan skipped"), value: pct(skippedN, plans), unit: "%", base: plans },
    { label: t("ไอเดียที่สมาชิกเสนอ (คนเข้าร่วม)", "Member pitches (joins)"), value: safeCount(pitchesN), unit: "", base: pitchesN, hint: safeCount(joinsN) !== null ? `${joinsN} ${t("คนร่วม", "joins")}` : undefined },
    { label: t("บัดดี้มาตามนัด", "Buddies showed up"), value: pct(meetShowed, meetN), unit: "%", base: meetN, target: pctTarget(90) },
    { label: t("รู้สึกปลอดภัยตอนเจอบัดดี้ (4 หรือ 5)", "Felt safe with buddy (4-5)"), value: pct(meetSafe, meetN), unit: "%", base: meetN, target: pctTarget(90) },
    { label: t("อยากเจอบัดดี้อีก", "Would meet buddy again"), value: pct(meetAgain, meetN), unit: "%", base: meetN },
    { label: t("รู้สึกว่ามีคนฟัง: บัดดี้ (1-5)", "Felt heard: buddy (1-5)"), value: avg1(meetHeardAvg, meetHeardN), unit: "", base: meetHeardN, digits: 1 },
    { label: t("รู้สึกว่ามีคนฟัง: กิจกรรม (1-5)", "Felt heard: events (1-5)"), value: avg1(evHeardAvg, evHeardN), unit: "", base: evHeardN, digits: 1 },
    { label: t("ขอความช่วยเหลือหลังนัด", "Asked for help after a meet"), value: pct(helpN, answeredN), unit: "%", base: answeredN, hint: safeCount(arrivals) !== null ? `${arrivals} ${t("การตั้งเวลา", "checks set")}` : undefined },
    {
      label: t("ข้อความที่ถูกรายงาน ต่อ 1,000 ข้อความ", "Chat reports per 1,000 messages"),
      value: safeCount(msgs) === null ? null : Math.round((chatReports / msgs) * 10000) / 10,
      unit: "",
      base: msgs,
      digits: 1,
    },
    { label: t("ข้อความที่พูดถึงเงิน", "Messages flagged for money"), value: pct(moneyN, msgs), unit: "%", base: msgs },
  ];
  const skipCounts = table(skipRows)
    .map(([r, n]) => ({ r: String(r ?? "other"), n: Number(n) }))
    .filter((x) => safeCount(x.n) !== null)
    .sort((a, b) => b.n - a.n);
  const EXIT_LABEL = (r: string) => {
    const o = EXIT_REASONS.find((x) => x.value === r);
    return o ? (lang === "en" ? o.label.en : o.label.th) : r;
  };
  const SKIP_LABEL: Record<string, [string, string]> = { time: ["ไม่มีเวลา", "No time"], money: ["งบไม่พอ", "Money"], distance: ["ไกลไป", "Distance"], mood: ["ไม่มีอารมณ์", "Mood"], other: ["อื่น ๆ", "Other"] };

  return page(
    c,
    { title: "City Insight", admin: true },
    <>
      <h1>City Insight</h1>
      <nav class="row" aria-label={t("ช่วงเวลา", "Window")}>
        {WINDOWS.map((d) => (
          <a href={`/admin/insights?days=${d}`} class="chip" aria-current={d === days ? "page" : undefined} style={d === days ? "background:var(--brand);color:var(--brand-ink)" : ""}>
            {t(`${d} วัน`, `${d} days`)}
          </a>
        ))}
      </nav>
      <Notice kind="info">
        {t(
          `ตัวเลขที่มีฐานน้อยกว่า ${K_THRESHOLD} คนแสดงเป็น "<10" เพื่อป้องกันการระบุตัวบุคคล เป้าหมายเป็นเป้าของทีมเราเอง`,
          `Figures based on fewer than ${K_THRESHOLD} people show as "<10" to prevent re-identification. Targets are our own goals.`,
        )}
      </Notice>

      <h2>{t("ตัวชี้วัดการใช้งาน", "Product KPIs")}</h2>
      <div class="stats">
        {kpis.map((k) => (
          <KpiTile k={k} />
        ))}
      </div>

      <h2 id="segments">{t("แยกตามเรื่องราวในกรุงเทพฯ", "By Bangkok story")}</h2>
      <p class="muted">
        {t(
          "จากคำตอบของสมาชิกเองว่ามาอยู่กรุงเทพฯ อย่างไร สมาชิกนับทุกคนที่ใช้งานอยู่ ตัวเลขอื่นนับในช่วงเวลาที่เลือก",
          "From each member's own Bangkok story answer. Members counts everyone active; the rest use the selected window.",
        )}
      </p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">{t("กลุ่ม", "Segment")}</th>
              <th scope="col">{t("สมาชิก", "Members")}</th>
              <th scope="col">{t("สมัคร → ลงทะเบียนกิจกรรมแรก", "Registration → first RSVP")}</th>
              <th scope="col">{t("ลงทะเบียน → เช็กอิน", "RSVP → check-in")}</th>
              <th scope="col">{t("ได้คนรู้จักใหม่ (เลือกตรงกัน)", "Mutual connection rate")}</th>
            </tr>
          </thead>
          <tbody>
            {segCells.map((r) => (
              <tr data-segment={r.segment}>
                <th scope="row" style="font-weight:normal">{t(SEG_LABEL[r.segment][0], SEG_LABEL[r.segment][1])}</th>
                <td>{cell(r.members)}</td>
                <td>{cell(r.regToRsvp, "%")}</td>
                <td>{cell(r.rsvpToCheckIn, "%")}</td>
                <td>{cell(r.mutualRate, "%")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 id="sources">{t("แหล่งที่มาของการสมัคร", "Sign-ups by source")}</h2>
      <p class="muted">
        {t(
          "จากลิงก์แรกที่พาคนเข้ามา (?src= หรือ utm_source) จำไว้ 30 วันก่อนสมัคร สมัครในช่วงเวลาที่เลือก",
          "From the first link that brought someone in (?src= or utm_source), remembered for 30 days before sign-up. Sign-ups in the selected window.",
        )}
      </p>
      {sources.length === 0 ? (
        <Empty>{t("ยังไม่มีการสมัครในช่วงนี้", "No sign-ups in this window")}</Empty>
      ) : (
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{t("แหล่งที่มา", "Source")}</th>
                <th scope="col">{t("สมัคร", "Sign-ups")}</th>
                <th scope="col">{t("ลงทะเบียนกิจกรรมแรกแล้ว", "Made a first RSVP")}</th>
                <th scope="col">{t("อัตรา", "Rate")}</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((r) => (
                <tr data-source={r.source}>
                  <th scope="row" style="font-weight:normal">{sourceLabel(r.source)}</th>
                  <td>{cell(r.signups)}</td>
                  <td>{cell(r.firstRsvp)}</td>
                  <td>{cell(r.rate, "%")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 id="landings">{t("การเข้าชมจากลิงก์แคมเปญ ต่อสัปดาห์", "Campaign landings, by week")}</h2>
      <p class="muted">
        {t(
          "นับทุกครั้งที่มีคนเปิดลิงก์ที่มี ?src= (เปิดซ้ำก็นับ) จึงเป็นจำนวนการเข้าชม ไม่ใช่จำนวนคน และไม่เก็บข้อมูลของคนที่เปิด นับเฉพาะรหัสในทะเบียนลิงก์ รหัสอื่นนับเป็น \"อื่น ๆ\" สัปดาห์คือจันทร์ถึงอาทิตย์ เวลากรุงเทพฯ ยอดรวมช่องทางนับแม้แต่ละรหัสจะไม่ถึง 10 ตัวเลขปัดเป็นหลัก 5 การสมัครแสดงเฉพาะระดับช่องทาง",
          "Every opening of a link with ?src= counts, a reload too, so these are landings, not people, and nothing is kept about who opened it. Only codes in the link register count; anything else counts as \"other\". Weeks run Monday to Sunday, Bangkok time. A channel's row counts even when its codes are each under 10. Counts are rounded to 5, and sign-ups show per channel only.",
        )}
      </p>
      <form method="get" action="/admin/insights#landings" class="row" style="align-items:end;flex-wrap:wrap">
        <input type="hidden" name="days" value={String(days)} />
        <div class="field">
          <label for="f-lweek">{t("สัปดาห์ที่เริ่ม", "Week starting")}</label>
          <select id="f-lweek" name="lweek">
            {weeks.map((w, i) => (
              <option value={w} selected={w === landingMonday}>
                {w}
                {i === 0 ? t(" (สัปดาห์นี้ ยังไม่จบ)", " (this week, so far)") : ""}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" class="btn ghost">{t("แสดง", "Show")}</button>
      </form>
      {landings.length === 0 ? (
        <Empty>{t("ยังไม่มีการเข้าชมจากลิงก์แคมเปญในสัปดาห์นี้", "No campaign landings this week")}</Empty>
      ) : (
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{t("ช่องทาง / รหัส", "Channel / code")}</th>
                <th scope="col">{t("การเข้าชม", "Landings")}</th>
                <th scope="col">{t("สมัคร (ลิงก์แรก)", "Sign-ups (first link)")}</th>
                <th scope="col">{t("สมัครต่อการเข้าชม 100 ครั้ง", "Sign-ups per 100 landings")}</th>
              </tr>
            </thead>
            <tbody>
              {landings.map((r) =>
                r.kind === "channel" ? (
                  <tr data-channel={r.channel}>
                    <th scope="row">{r.channel === OTHER_CODE ? t("อื่น ๆ", "Other") : r.channel}</th>
                    <td>
                      <strong>{cell(r.landings)}</strong>
                    </td>
                    <td>{cell(r.signups)}</td>
                    <td>{cell(r.per100)}</td>
                  </tr>
                ) : (
                  <tr data-code={r.code}>
                    <th scope="row" style="font-weight:normal;padding-left:24px">{r.code}</th>
                    <td>{cell(r.landings)}</td>
                    <td aria-label={t("ไม่แสดงระดับรหัส", "Not shown per code")}>·</td>
                    <td>·</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      <h2>{t("ผลกระทบทางสังคม", "Social impact")}</h2>
      <div class="stats">
        {impact.map((k) => (
          <KpiTile k={k} />
        ))}
      </div>

      <h2>{t("การเชื่อมต่ออย่างมีสุขภาวะ", "Healthy connections")}</h2>
      <div class="stats">
        {healthy.map((k) => (
          <KpiTile k={k} />
        ))}
      </div>
      {skipCounts.length ? (
        <p class="muted">
          {t("เหตุผลที่ข้ามแผน: ", "Why plans were skipped: ")}
          {skipCounts.map((x) => `${t(SKIP_LABEL[x.r]?.[0] ?? x.r, SKIP_LABEL[x.r]?.[1] ?? x.r)} ${x.n}`).join(" · ")}
        </p>
      ) : null}

      {exitCounts.length ? (
        <p class="muted">
          {t("เหตุผลที่ออก (ไม่ระบุตัวตน): ", "Why people left (anonymous): ")}
          {exitCounts.map((x) => `${EXIT_LABEL(x.r)} ${x.n}`).join(" · ")}
        </p>
      ) : null}

      <h2>{t("ความเหงา UCLA-3 (3-9 ยิ่งต่ำยิ่งเหงาน้อย)", "UCLA-3 loneliness (3-9, lower is better)")}</h2>
      <div class="stats">
        <Stat label={t("ค่าเฉลี่ยเริ่มต้น", "Baseline average")} value={baseline.avg === null ? null : baseline.avg.toFixed(2)} hint={safeCount(baseline.n) !== null ? `n = ${baseline.n}` : undefined} />
        <Stat label={t("ค่าเฉลี่ยติดตามผล", "Follow-up average")} value={followup.avg === null ? null : followup.avg.toFixed(2)} hint={safeCount(followup.n) !== null ? `n = ${followup.n}` : undefined} />
        <Stat
          label={t("การเปลี่ยนแปลง", "Change")}
          value={baseline.avg !== null && followup.avg !== null ? (followup.avg - baseline.avg).toFixed(2) : null}
        />
      </div>
      <p class="muted">{t("ข้อมูลทั้งหมดตั้งแต่เริ่มโครงการ เป็นค่าเฉลี่ยของกลุ่ม ไม่ใช่การจับคู่รายบุคคล", "All-time group averages, not a paired per-person comparison.")}</p>

      <h2>{t("แยกตามเขต", "By district")}</h2>
      {districtRows.length === 0 ? (
        <Empty>{t("ยังไม่มีกิจกรรมในช่วงนี้", "No events in this window")}</Empty>
      ) : (
        <div class="table-wrap">
          <table>
            <caption class="sr-only">{t("แยกตามเขต", "By district")}</caption>
            <thead>
              <tr>
                <th>{t("เขต", "District")}</th>
                <th>{t("กิจกรรม", "Events")}</th>
                <th>{t("เช็กอิน", "Check-ins")}</th>
                <th>{t("ความรู้สึกปลอดภัยเฉลี่ย (1-5)", "Avg felt safe (1-5)")}</th>
              </tr>
            </thead>
            <tbody>
              {districtRows.map((r) => (
                <tr>
                  <td>{r.label}</td>
                  <td>{r.events}</td>
                  <td>{roundedCount(r.checkins) ?? "<10"}</td>
                  <td>{safeCount(r.safeN) === null || r.safeAvg === null ? "<10" : r.safeAvg.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>{t("อุปสรรคในการออกไปพบผู้คน", "Top barriers")}</h2>
      {barrierQs.length === 0 ? (
        <Empty>{t("ไม่มีคำถาม City Pulse แบบเลือกตอบที่เปิดอยู่", "No active single-choice City Pulse questions")}</Empty>
      ) : (
        barrierQs.map((q) => {
          const m = barrierMap.get(q.id) ?? new Map<string, number>();
          // Answers outside the current options still count toward the total, as one hidden cell.
          const counts = q.options.map((o) => m.get(o.value) ?? 0);
          const extra = [...m.values()].reduce((a, b) => a + b, 0) - counts.reduce((a, b) => a + b, 0);
          const safe = safeTable(extra > 0 ? [...counts, extra] : counts);
          const totalSafe = safe.total;
          const rows = q.options
            .map((o, i) => ({ o, s: safe.cells[i], p: safe.pcts[i] }))
            .sort((a, b) => (b.s ?? -1) - (a.s ?? -1));
          return (
            <Card>
              <h3>{lang === "en" ? q.promptEn : q.promptTh}</h3>
              <p class="muted">
                {t("ผู้ตอบ", "Respondents")}: {totalSafe === null ? "<10" : totalSafe}
                {" · "}
                {t("ปัดเป็นหลัก 5 (ผู้ตอบปัดเป็นหลัก 10 เมื่อมีช่องที่ซ่อน) นับถึง 00:00 น. วันนี้", "rounded to 5 (respondents to 10 when a row is hidden), counted up to 00:00 today")}
              </p>
              {rows.map(({ o, s, p }) => {
                return (
                  <div style="margin:6px 0">
                    <div class="spread">
                      <span>{lang === "en" ? o.en : o.th}</span>
                      <small>{s === null ? "<10" : `${s} · ${p}%`}</small>
                    </div>
                    <div class="bar">
                      <i style={`width:${p ?? 0}%`} />
                    </div>
                  </div>
                );
              })}
            </Card>
          );
        })
      )}
    </>,
  );
});
