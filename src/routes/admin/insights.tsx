/**
 * City Insight dashboard (/admin/insights) — insight viewers and BMA admins
 * (PRD §13.4, §18).
 *
 * Everything here is an SQL aggregate; no rows about people are loaded. Every
 * count and every ratio whose base is under k = 10 is suppressed and shown as
 * "<10" (PRD §12.5). Research tables (wellbeing, pulse) are never joined to
 * accounts. PRD §18.4 pilot targets sit next to each KPI.
 */
import { Hono } from "hono";
import { asc, and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { getDb } from "../../db";
import { K_THRESHOLD, safeCount } from "../../domain/rules";
import { DISTRICTS, label } from "../../lib/constants";
import type { AppEnv } from "../../lib/env";
import { requireRole } from "../../lib/session";
import { pulseQuestions, pulseResponses } from "../../schema";
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
      hint: t("เป้าหมาย PRD วัดภายใน 60 วัน", "PRD target is measured within 60 days"),
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
          `ตัวเลขที่มีฐานน้อยกว่า ${K_THRESHOLD} คนแสดงเป็น "<10" เพื่อป้องกันการระบุตัวบุคคล เป้าหมายตาม PRD §18.4 (รอ กทม. ยืนยัน)`,
          `Figures based on fewer than ${K_THRESHOLD} people show as "<10" to prevent re-identification. Targets from PRD §18.4 (placeholders, BMA to confirm).`,
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
