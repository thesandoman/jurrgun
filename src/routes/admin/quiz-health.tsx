/**
 * Quiz health (/admin/quiz-health): is the Bangkok Type quiz working for real
 * people? Insight viewers and admins (owner, 10-16).
 *
 * Totals only, never a person: every query is an SQL aggregate over the saved
 * results, and every count or share whose base is under k = 10 is shown as
 * "<10" (PRD §12.5, the City Insight rule). Style answers (how you date or
 * host) are never stored with the picks, so they can't show up here.
 *
 *  - "Does this feel like you?" (blend.feel) per type and per segment: the
 *    closest thing to real accuracy.
 *  - Per question (blend.picks: scenario → picked type or "none"): the
 *    "None of these" rate, how often a pick agrees with the person's final
 *    type (3+ letters shared), and the busiest answer's share. Flags follow
 *    the jurrgun-quiz-measurement skill.
 *  - Retakes (blend.prev: only the last type, owner card 10-16): of people who
 *    retook 14 to 30 days later, how many got the same type or kept 3+ letters.
 */
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { getDb } from "../../db";
import { safeCount } from "../../domain/rules";
import type { AppEnv } from "../../lib/env";
import { L } from "../../lib/i18n";
import { requireRole } from "../../lib/session";
import { ARCHETYPES, ARCHETYPE_KEYS, type ArchetypeKey } from "../../vibe/archetypes";
import { SCENARIOS } from "../../vibe/scenarios";
import { page, view } from "../../ui/kit";
import { SEGMENT_SQL } from "./insights";

export const adminQuizHealth = new Hono<AppEnv>();
adminQuizHealth.use("*", requireRole("insight_viewer"));

/** Flag thresholds (skill jurrgun-quiz-measurement, section 3). */
export const FLAGS = { none: 0.2, agreementGap: 0.15, topPick: 0.6 } as const;

const FEELS = ["yes", "partly", "no"] as const;
type FeelCounts = { yes: number; partly: number; no: number; n: number };
const emptyFeel = (): FeelCounts => ({ yes: 0, partly: 0, no: 0, n: 0 });

export type QuestionHealth = {
  scenario: string;
  n: number;
  none: number;
  agree: number;
  picked: number;
  top: number;
  flags: ("none" | "agreement" | "top")[];
};

const shared = (a: string, b: string) => [0, 1, 2, 3].filter((i) => a[i] === b[i]).length;

/**
 * Per-question health from grouped rows (scenario, pick, archetype, count).
 * Rows are already totals; questions under k are left out of the flags.
 */
export function questionHealth(rows: { scenario: string; pick: string; archetype: string; count: number }[]): QuestionHealth[] {
  const by = new Map<string, { n: number; none: number; agree: number; picked: number; perPick: Map<string, number> }>();
  for (const r of rows) {
    const q = by.get(r.scenario) ?? { n: 0, none: 0, agree: 0, picked: 0, perPick: new Map() };
    q.n += r.count;
    if (r.pick === "none") q.none += r.count;
    else {
      q.picked += r.count;
      if (shared(r.pick, r.archetype) >= 3) q.agree += r.count;
      q.perPick.set(r.pick, (q.perPick.get(r.pick) ?? 0) + r.count);
    }
    by.set(r.scenario, q);
  }
  const out = [...by].map(([scenario, q]) => ({ scenario, n: q.n, none: q.none, agree: q.agree, picked: q.picked, top: Math.max(0, ...q.perPick.values()), flags: [] as QuestionHealth["flags"] }));
  // Agreement is judged against the quiz's own average, over the questions with enough answers.
  const shown = out.filter((q) => safeCount(q.picked) !== null);
  const avg = shown.length ? shown.reduce((t, q) => t + q.agree / q.picked, 0) / shown.length : 0;
  for (const q of out) {
    if (safeCount(q.n) === null) continue;
    if (q.none / q.n > FLAGS.none) q.flags.push("none");
    if (safeCount(q.picked) !== null && q.agree / q.picked < avg - FLAGS.agreementGap) q.flags.push("agreement");
    if (safeCount(q.picked) !== null && q.top / q.picked > FLAGS.topPick) q.flags.push("top");
  }
  return out.sort((a, b) => b.flags.length - a.flags.length || b.n - a.n);
}

/** Retakes counted for stability: 14 to 30 days after the last result (skill section 5). */
export const RETAKE_DAYS = { min: 14, max: 30 } as const;

export type Stability = { n: number; same: number; kept3: number };

/**
 * Retake stability per group from grouped rows (group, previous type, new type,
 * count). Only today's four-letter types count; older results ("rhythm+") are skipped.
 */
export function retakeStability(rows: { group: string; prev: string; now: string; count: number }[]): Map<string, Stability> {
  const keys = new Set<string>(ARCHETYPE_KEYS);
  const out = new Map<string, Stability>();
  for (const r of rows) {
    if (!keys.has(r.prev) || !keys.has(r.now)) continue;
    const s = out.get(r.group) ?? { n: 0, same: 0, kept3: 0 };
    s.n += r.count;
    if (r.prev === r.now) s.same += r.count;
    if (shared(r.prev, r.now) >= 3) s.kept3 += r.count;
    out.set(r.group, s);
  }
  return out;
}

function rowsOf(res: unknown): unknown[][] {
  return (res as unknown[]).map((r) => (Array.isArray(r) ? r : Object.values(r as Record<string, unknown>)));
}

/** The saved result's JSON, unwrapped if the driver stored it as a JSON string. */
const BLEND = sql`(case when jsonb_typeof(v.blend) = 'string' then (v.blend #>> '{}')::jsonb else v.blend end)`;

adminQuizHealth.get("/", async (c) => {
  const { t, lang } = view(c);
  const db = getDb(c.env);
  const [feelByType, feelBySegment, picks, retakes] = await Promise.all([
    db.execute(sql`select v.archetype, ${BLEND}->>'feel', count(*) from social_vibes v where ${BLEND} ? 'feel' group by 1, 2`),
    db.execute(sql`select ${SEGMENT_SQL}, ${BLEND}->>'feel', count(*) from social_vibes v join social_profiles p on p.account_id = v.account_id where ${BLEND} ? 'feel' group by 1, 2`),
    db.execute(sql`
      select e->>0, e->>1, v.archetype, count(*)
      from social_vibes v
      cross join lateral jsonb_array_elements(case when jsonb_typeof(${BLEND}->'picks') = 'array' then ${BLEND}->'picks' else '[]'::jsonb end) e
      group by 1, 2, 3`),
    db.execute(sql`
      select case when p.account_id is null then 'none' else ${SEGMENT_SQL} end, ${BLEND}->'prev'->>'archetype', v.archetype, count(*)
      from social_vibes v
      left join social_profiles p on p.account_id = v.account_id
      where ${BLEND} ? 'prev'
        and v.taken_at - (${BLEND}->'prev'->>'at')::timestamptz between ${`${RETAKE_DAYS.min} days`}::interval and ${`${RETAKE_DAYS.max} days`}::interval
      group by 1, 2, 3`),
  ]);

  const tally = (res: unknown) => {
    const m = new Map<string, FeelCounts>();
    for (const [key, feel, n] of rowsOf(res)) {
      const k = String(key);
      const f = m.get(k) ?? emptyFeel();
      if (FEELS.includes(feel as (typeof FEELS)[number])) f[feel as (typeof FEELS)[number]] += Number(n);
      f.n += Number(n);
      m.set(k, f);
    }
    return m;
  };
  const byType = tally(feelByType);
  const bySegment = tally(feelBySegment);
  const overall = [...byType.values()].reduce((a, f) => ({ yes: a.yes + f.yes, partly: a.partly + f.partly, no: a.no + f.no, n: a.n + f.n }), emptyFeel());
  const questions = questionHealth(rowsOf(picks).map(([scenario, pick, archetype, n]) => ({ scenario: String(scenario), pick: String(pick), archetype: String(archetype), count: Number(n) })));
  const stable = retakeStability(rowsOf(retakes).map(([group, prev, now, n]) => ({ group: String(group), prev: String(prev), now: String(now), count: Number(n) })));
  const stableAll = [...stable.values()].reduce((a, s) => ({ n: a.n + s.n, same: a.same + s.same, kept3: a.kept3 + s.kept3 }), { n: 0, same: 0, kept3: 0 });
  const prompt = (id: string) => {
    const s = SCENARIOS.find((x) => x.id === id);
    return s ? L(lang, s.prompt) : id;
  };

  const share = (k: number, n: number) => (safeCount(n) === null || n === 0 ? "<10" : `${Math.round((k / n) * 100)}%`);
  const count = (n: number) => (safeCount(n) === null ? "<10" : String(n));
  const FLAG_TEXT: Record<QuestionHealth["flags"][number], string> = {
    none: t('"ไม่มีข้อไหนเป็นฉัน" เยอะ', 'Many say "None of these"'),
    agreement: t("คำตอบไม่ค่อยตรงกับไทป์สุดท้าย", "Picks rarely match the final type"),
    top: t("มีคำตอบเดียวที่คนเลือกเกือบหมด", "One answer takes most picks"),
  };
  const FeelRow = (props: { label: string; f: FeelCounts }) => (
    <tr>
      <th scope="row" style="font-weight:normal">{props.label}</th>
      <td>{count(props.f.n)}</td>
      <td>{share(props.f.yes, props.f.n)}</td>
      <td>{share(props.f.partly, props.f.n)}</td>
      <td>{share(props.f.no, props.f.n)}</td>
    </tr>
  );
  const feelHead = (
    <thead>
      <tr>
        <th scope="col">{t("กลุ่ม", "Group")}</th>
        <th scope="col">{t("คนตอบ", "Answers")}</th>
        <th scope="col">{t("ใช่", "Yes")}</th>
        <th scope="col">{t("บางส่วน", "Partly")}</th>
        <th scope="col">{t("ไม่ค่อยใช่", "Not really")}</th>
      </tr>
    </thead>
  );
  const SEG: Record<string, string> = { local: t("คนกรุงเทพฯ", "Locals"), newcomer: t("คนมาใหม่", "Newcomers"), international: t("ชาวต่างชาติ", "International") };

  return page(
    c,
    { title: t("สุขภาพแบบทดสอบ", "Quiz health"), admin: true },
    <>
      <h1>{t("สุขภาพแบบทดสอบไทป์กรุงเทพฯ", "Bangkok Type quiz health")}</h1>
      <p class="muted">
        {t(
          "ผลรวมเท่านั้น ไม่มีข้อมูลรายคน ช่องที่มีน้อยกว่า 10 คนแสดงเป็น <10 ใช้หาข้อที่ควรเขียนใหม่ (สกิล jurrgun-quiz-measurement)",
          "Totals only, never a person. Anything under 10 people shows as <10. Use it to pick which questions to rewrite (skill jurrgun-quiz-measurement).",
        )}
      </p>

      <h2 id="feel">{t("ผลรู้สึกเหมือนตัวเองไหม", "Does the result feel like them?")}</h2>
      <div class="table-wrap">
        <table>
          {feelHead}
          <tbody>
            <FeelRow label={t("ทั้งหมด", "Everyone")} f={overall} />
            {(["local", "newcomer", "international"] as const).map((s) => (
              <FeelRow label={SEG[s]} f={bySegment.get(s) ?? emptyFeel()} />
            ))}
          </tbody>
        </table>
      </div>
      <details>
        <summary>{t("แยกตามไทป์", "By type")}</summary>
        <div class="table-wrap">
          <table>
            {feelHead}
            <tbody>
              {ARCHETYPE_KEYS.map((k) => (
                <FeelRow label={L(lang, ARCHETYPES[k as ArchetypeKey].name)} f={byType.get(k) ?? emptyFeel()} />
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <h2 id="retakes">{t(`ทำซ้ำ (${RETAKE_DAYS.min} ถึง ${RETAKE_DAYS.max} วันต่อมา)`, `Retakes (${RETAKE_DAYS.min} to ${RETAKE_DAYS.max} days later)`)}</h2>
      <p class="muted">
        {t(
          "คำถามไม่เปลี่ยน การทำซ้ำจึงเป็นการวัดครั้งที่สอง ควรได้ไทป์เดิมราว 70% ขึ้นไป และเกือบทุกคนได้ตัวอักษรเดิม 3 ใน 4 ตัว",
          "The questions are fixed, so a retake is a second measurement. Expect about 70% or more on the same type, and nearly everyone keeping 3 of 4 letters.",
        )}
      </p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">{t("กลุ่ม", "Group")}</th>
              <th scope="col">{t("คนทำซ้ำ", "Retook")}</th>
              <th scope="col">{t("ไทป์เดิม", "Same type")}</th>
              <th scope="col">{t("ตัวอักษรเดิม 3 ตัวขึ้นไป", "3+ letters same")}</th>
            </tr>
          </thead>
          <tbody>
            {([["all", t("ทั้งหมด", "Everyone")], ...(["local", "newcomer", "international"] as const).map((s) => [s, SEG[s]])] as [string, string][]).map(([k, label]) => {
              const s = k === "all" ? stableAll : (stable.get(k) ?? { n: 0, same: 0, kept3: 0 });
              return (
                <tr data-retakes={k}>
                  <th scope="row" style="font-weight:normal">{label}</th>
                  <td>{count(s.n)}</td>
                  <td>{share(s.same, s.n)}</td>
                  <td>{share(s.kept3, s.n)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 id="questions">{t("รายข้อ", "Question by question")}</h2>
      <p class="muted">
        {t(
          `ธงขึ้นเมื่อ: ตอบ "ไม่มีข้อไหนเป็นฉัน" เกิน ${FLAGS.none * 100}% · คำตอบตรงกับไทป์สุดท้ายต่ำกว่าค่าเฉลี่ย ${FLAGS.agreementGap * 100} จุด · คำตอบเดียวได้เกิน ${FLAGS.topPick * 100}%`,
          `Flagged when: over ${FLAGS.none * 100}% say "None of these" · picks match the final type ${FLAGS.agreementGap * 100} points below the quiz average · one answer takes over ${FLAGS.topPick * 100}%`,
        )}
      </p>
      {questions.length === 0 ? (
        <p class="muted">{t("ยังไม่มีคำตอบที่บันทึกรายข้อ", "No per-question answers saved yet.")}</p>
      ) : (
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{t("คำถาม", "Question")}</th>
                <th scope="col">{t("คนตอบ", "Answers")}</th>
                <th scope="col">{t("ไม่มีข้อไหน", "None")}</th>
                <th scope="col">{t("ตรงกับไทป์", "Matches type")}</th>
                <th scope="col">{t("คำตอบยอดนิยม", "Top answer")}</th>
                <th scope="col">{t("ธง", "Flags")}</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => (
                <tr data-scenario={q.scenario}>
                  <th scope="row" style="font-weight:normal">{prompt(q.scenario)}</th>
                  <td>{count(q.n)}</td>
                  <td>{share(q.none, q.n)}</td>
                  <td>{share(q.agree, q.picked)}</td>
                  <td>{share(q.top, q.picked)}</td>
                  <td>{q.flags.map((f) => FLAG_TEXT[f]).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>,
  );
});
