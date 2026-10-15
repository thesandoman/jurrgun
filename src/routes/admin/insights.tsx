/**
 * City Insight dashboard (/admin/insights): insight viewers and admins.
 *
 * Everything here is an SQL aggregate; no rows about people are loaded. Every
 * count and every ratio whose base is under k = 10 is suppressed and shown as
 * "<10" (PRD §12.5). Research tables (wellbeing, pulse) are never joined to
 * accounts. PRD §18.4 pilot targets sit next to each KPI.
 */
import { EXIT_REASONS } from "../../content/dating";
import { Hono } from "hono";
import { asc, and, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import { getDb } from "../../db";
import { K_THRESHOLD, safeCount } from "../../domain/rules";
import { DISTRICTS, label } from "../../lib/constants";
import type { AppEnv } from "../../lib/env";
import { requireRole } from "../../lib/session";
import { exitReasons, pulseQuestions, pulseResponses } from "../../schema";
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

/** k/n as a whole percent, or null when the base is under k. */
export function pct(k: number, n: number): number | null {
  if (safeCount(n) === null || n === 0) return null;
  return Math.round((k / n) * 100);
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
             sum(case when exists (select 1 from social_registrations r where r.account_id = a.id) then 1 else 0 end)
      from identity_accounts a
      join social_profiles p on p.account_id = a.id
      where a.role = 'user' and p.onboarded_at is not null and a.created_at >= ${since}::timestamptz`),
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
        and (r.status = 'confirmed' or r.checked_in_at is not null)`),
    db.execute(sql`
      select count(*), sum(case when x.c >= 2 then 1 else 0 end), sum(x.c)
      from (
        select r.account_id, count(*) as c
        from social_registrations r
        join social_events e on e.id = r.event_id
        where r.checked_in_at is not null and ${inWindow}
        group by r.account_id
      ) x`),
    db.execute(sql`
      select count(*)
      from social_connections x
      join social_events e on e.id = x.event_id
      where ${inWindow}`),
    db.execute(sql`
      select count(*),
             count(f.met_new_person), sum(case when f.met_new_person then 1 else 0 end),
             count(f.would_meet_again), sum(case when f.would_meet_again then 1 else 0 end),
             count(f.felt_safe), sum(case when f.felt_safe >= 4 then 1 else 0 end),
             count(f.group_rating), avg(f.group_rating)
      from social_feedback f
      join social_events e on e.id = f.event_id
      where ${inWindow}`),
    db.execute(sql`
      select count(*) from social_reports
      where created_at >= ${since}::timestamptz and reason in (${sql.join(HARASSMENT_REASONS.map((r) => sql`${r}`), sql`, `)})`),
    db.execute(sql`
      select phase, count(*), avg(q1 + q2 + q3)
      from research_wellbeing
      group by phase
      limit 10`),
    db.execute(sql`
      select e.district, count(distinct e.id), sum(case when r.checked_in_at is not null then 1 else 0 end)
      from social_events e
      left join social_registrations r on r.event_id = e.id
      where ${inWindow} and e.status = 'published'
      group by e.district
      limit 100`),
    db.execute(sql`
      select e.district, count(f.felt_safe), avg(f.felt_safe)
      from social_feedback f
      join social_events e on e.id = f.event_id
      where ${inWindow}
      group by e.district
      limit 100`),
    db
      .select({ id: pulseQuestions.id, promptTh: pulseQuestions.promptTh, promptEn: pulseQuestions.promptEn, options: pulseQuestions.options })
      .from(pulseQuestions)
      .where(and(eq(pulseQuestions.status, "active"), eq(pulseQuestions.kind, "single")))
      .orderBy(asc(pulseQuestions.sortOrder))
      .limit(5),
  ]);

  const answerExpr = sql<string>`translate(${pulseResponses.answer}::text, '"\\', '')`;
  const barrierCounts = barrierQs.length
    ? await db
        .select({ q: pulseResponses.questionId, v: answerExpr, n: sql<number>`count(*)`.mapWith(Number) })
        .from(pulseResponses)
        .where(inArray(pulseResponses.questionId, barrierQs.map((q) => q.id)))
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
      label: t("อัตราไม่มาตามนัด", "No-show rate"),
      value: pct(expected - checkedIn, expected),
      unit: "%",
      base: expected,
    },
    {
      label: t("ผู้เช็กอินที่ได้คนรู้จักแบบตรงกัน ≥ 1 คน", "Checked-in with ≥1 mutual connection"),
      value: pct(withConnection, checkedIn),
      unit: "%",
      base: checkedIn,
      target: pctTarget(50),
    },
    {
      label: t("การเชื่อมต่อต่อผู้เช็กอิน", "Mutual connections per check-in"),
      value: safeCount(checkedIn) === null ? null : Math.round((connCount / checkedIn) * 100) / 100,
      unit: "",
      base: checkedIn,
      digits: 2,
    },
    {
      label: t("เข้าร่วม ≥ 2 กิจกรรม", "Attended ≥2 events"),
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
      label: t("รู้สึกปลอดภัย (4–5 จาก 5)", "Felt safe (4–5 of 5)"),
      value: pct(safeYes, safeN),
      unit: "%",
      base: safeN,
      target: pctTarget(90),
    },
    {
      label: t("คะแนนกลุ่มเฉลี่ย", "Avg table rating"),
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
      k.base > 0 && safeCount(k.base) !== null ? `n = ${k.base}` : null,
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

  // Healthy connections: chat, safety checks, weekly plans and mutual meet feedback.
  const winTs = sql`created_at >= ${since}::timestamptz and created_at < ${until}::timestamptz`;
  const [chatRow, safeRow, planRow, skipRows, meetRow, heardRow, pitchRow, gradRow] = await Promise.all([
    db.execute(sql`select count(*), sum(case when money_flag then 1 else 0 end),
      (select count(*) from social_reports where target_message is not null and ${winTs})
      from social_chat_messages where ${winTs}`),
    db.execute(sql`select count(*), sum(case when answer = 'help' then 1 else 0 end), sum(case when answer is not null then 1 else 0 end)
      from social_safe_arrivals where ${winTs}`),
    db.execute(sql`select count(*), sum(case when status = 'accepted' then 1 else 0 end), sum(case when status = 'skipped' then 1 else 0 end)
      from social_weekly_plans where ${winTs}`),
    db.execute(sql`select skip_reason, count(*) from social_weekly_plans where status = 'skipped' and ${winTs} group by skip_reason`),
    db.execute(sql`select count(*), sum(case when felt_safe >= 4 then 1 else 0 end), avg(felt_heard), count(felt_heard),
      sum(case when would_meet_again then 1 else 0 end), sum(case when showed_up then 1 else 0 end)
      from social_meet_feedback where ${winTs}`),
    db.execute(sql`select avg(felt_heard), count(felt_heard) from social_feedback where ${winTs}`),
    db.execute(sql`select count(*), (select count(*) from social_pitch_joins where ${winTs}) from social_plan_pitches where ${winTs}`),
    db.execute(sql`select count(*),
      sum(case when a_still is not null then 1 else 0 end) + sum(case when b_still is not null then 1 else 0 end),
      sum(case when a_still then 1 else 0 end) + sum(case when b_still then 1 else 0 end),
      (select count(*) from social_connections where ${winTs})
      from social_graduations where ${winTs}`),
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
    { label: t("รู้สึกปลอดภัยตอนเจอบัดดี้ (4–5)", "Felt safe with buddy (4–5)"), value: pct(meetSafe, meetN), unit: "%", base: meetN, target: pctTarget(90) },
    { label: t("อยากเจอบัดดี้อีก", "Would meet buddy again"), value: pct(meetAgain, meetN), unit: "%", base: meetN },
    { label: t("รู้สึกว่ามีคนฟัง: บัดดี้ (1–5)", "Felt heard: buddy (1–5)"), value: avg1(meetHeardAvg, meetHeardN), unit: "", base: meetHeardN, digits: 1 },
    { label: t("รู้สึกว่ามีคนฟัง: กิจกรรม (1–5)", "Felt heard: events (1–5)"), value: avg1(evHeardAvg, evHeardN), unit: "", base: evHeardN, digits: 1 },
    { label: t("ขอความช่วยเหลือหลังนัด", "Asked for help after a meet"), value: pct(helpN, answeredN), unit: "%", base: answeredN, hint: safeCount(arrivals) !== null ? `${arrivals} ${t("การตั้งเวลา", "checks set")}` : undefined },
    {
      label: t("ข้อความที่ถูกรายงานต่อ 1,000", "Chat reports per 1,000 messages"),
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

      <h2>{t("ความเหงา UCLA-3 (3–9, ต่ำ = เหงาน้อย)", "UCLA-3 loneliness (3–9, lower is better)")}</h2>
      <div class="stats">
        <Stat label={t("ค่าเฉลี่ยเริ่มต้น", "Baseline average")} value={baseline.avg === null ? null : baseline.avg.toFixed(2)} hint={safeCount(baseline.n) !== null ? `n = ${baseline.n}` : undefined} />
        <Stat label={t("ค่าเฉลี่ยติดตามผล", "Follow-up average")} value={followup.avg === null ? null : followup.avg.toFixed(2)} hint={safeCount(followup.n) !== null ? `n = ${followup.n}` : undefined} />
        <Stat
          label={t("การเปลี่ยนแปลง", "Change")}
          value={baseline.avg !== null && followup.avg !== null ? (followup.avg - baseline.avg).toFixed(2) : null}
        />
      </div>
      <p class="muted">{t("ข้อมูลทั้งหมดตั้งแต่เริ่มโครงการ เป็นค่าเฉลี่ยของกลุ่ม ไม่ใช่การจับคู่รายบุคคล", "All-time, group averages — not a paired per-person comparison.")}</p>

      <h2>{t("แยกตามเขต", "By district")}</h2>
      {districtRows.length === 0 ? (
        <Empty>{t("ยังไม่มีกิจกรรมในช่วงนี้", "No events in this window")}</Empty>
      ) : (
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("เขต", "District")}</th>
                <th>{t("กิจกรรม", "Events")}</th>
                <th>{t("เช็กอิน", "Check-ins")}</th>
                <th>{t("ความรู้สึกปลอดภัยเฉลี่ย (1–5)", "Avg felt safe (1–5)")}</th>
              </tr>
            </thead>
            <tbody>
              {districtRows.map((r) => (
                <tr>
                  <td>{r.label}</td>
                  <td>{r.events}</td>
                  <td>{safeCount(r.checkins) === null ? "<10" : r.checkins}</td>
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
          const total = [...m.values()].reduce((a, b) => a + b, 0);
          const totalSafe = safeCount(total);
          const rows = q.options
            .map((o) => ({ o, n: m.get(o.value) ?? 0 }))
            .sort((a, b) => (safeCount(b.n) ?? -1) - (safeCount(a.n) ?? -1));
          return (
            <Card>
              <h3>{lang === "en" ? q.promptEn : q.promptTh}</h3>
              <p class="muted">
                {t("ผู้ตอบ", "Respondents")}: {totalSafe === null ? "<10" : totalSafe}
              </p>
              {rows.map(({ o, n }) => {
                const s = safeCount(n);
                const p = s !== null && totalSafe !== null ? Math.round((s / totalSafe) * 100) : null;
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
