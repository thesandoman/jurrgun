/**
 * City Pulse (PRD §6; owner decisions D62 to D66): short civic questions
 * answered by members who opted in to research. Answers are stored under the
 * member's pseudonymous researchId only, never the account id (PRD §12.3),
 * with district and age band copied in coarse form for aggregation.
 *
 * City Pulse is a main feature, reached from the top bar on every page (D62),
 * not one of the tabs. Its home:
 *   Bangkok now         heat, rain and PM2.5 (Open-Meteo) and Sanroo's headline
 *   This week's question one at a time, at most WEEK_CAP a week (D64)
 *   What the city heard  rounded shares of closed questions, k ≥ 10 (D63, D65)
 *   My answers           your own answers, each one can be taken back (D65)
 *   Suggest a question   once a week; words go only to moderators (D66)
 *
 *   GET  /pulse                 the home
 *   POST /pulse/wellbeing       UCLA-3 follow-up (§18.4)
 *   POST /pulse/suggest         suggest a question
 *   POST /pulse/:id/withdraw    take one of your answers back
 *   POST /pulse/:id             answer one question
 */
import { Hono, type Context } from "hono";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, gt, lte, ne, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { ageBand, ageOn } from "../domain/rules";
import { bkkMonth, bkkWeekKey, bkkWeekStart, heardShares } from "../domain/pulse-heard";
import { DISTRICTS, label, values, districtsAZ } from "../lib/constants";
import { newId } from "../lib/crypto";
import type { AppEnv } from "../lib/env";
import { fmtDate, fmtParts, L, type Lang } from "../lib/i18n";
import { requireMember } from "../lib/session";
import { consents, profiles, pulseQuestions, pulseResponses, pulseSuggestions, registrations, wellbeing } from "../schema";
import { Button, Card, Choices, LinkButton, list, Notice, page, Select, str, TextArea, view, type View } from "../ui/kit";
import { UCLA3, UCLA_SCALE } from "./onboarding";
import { CHANGE_PULSE_ID, CHANGE_PULSE_QUESTION } from "../content/reflections";
import { HEARD_SHOWN, SUGGEST_MAX, WEEK_CAP } from "../content/pulse";
import { bangkokWeather, heatBand, pm25Band, type Weather } from "../services/weather";
import { SANROO_URL, type SanrooHeadline } from "../services/sanroo";
import { cityNow } from "../services/city-now";

export const pulseRoutes = new Hono<AppEnv>();
pulseRoutes.use("/pulse", requireMember);
pulseRoutes.use("/pulse/*", requireMember);

type C = Context<AppEnv>;
type Question = typeof pulseQuestions.$inferSelect;
type Opt = { value: string; th: string; en: string };

const TEXT_MAX = 280;
const FOLLOWUP_EVENTS = 3;
const FOLLOWUP_DAYS = 60;

export async function researchConsent(c: C, accountId: string): Promise<boolean> {
  const [row] = await getDb(c.env)
    .select({ granted: consents.granted })
    .from(consents)
    .where(and(eq(consents.accountId, accountId), eq(consents.category, "research")))
    .orderBy(desc(consents.createdAt))
    .limit(1);
  return !!row?.granted;
}

/**
 * The "what would you change" reflection (content/reflections.ts), counted in
 * City Pulse like any answer: only with research consent, only the option
 * (never the member's words), under the research id. Its question row is
 * archived, so admins see the totals and members are never asked it here.
 * A new answer (quiz retake or Settings → My Bangkok) replaces the earlier
 * one; clearing it withdraws the earlier one.
 */
export async function syncQuizChange(c: C, value: string | undefined): Promise<void> {
  const user = c.var.user;
  const rid = user?.account.researchId;
  if (!user?.profile || !rid) return;
  const db = getDb(c.env);
  if (!value) {
    await db.delete(pulseResponses).where(and(eq(pulseResponses.questionId, CHANGE_PULSE_ID), eq(pulseResponses.researchId, rid)));
    return;
  }
  if (!(await researchConsent(c, user.account.id))) return;
  await db.insert(pulseQuestions).values(CHANGE_PULSE_QUESTION).onConflictDoNothing();
  const seg = segmentOf(c);
  await db
    .insert(pulseResponses)
    .values({ id: newId(), questionId: CHANGE_PULSE_ID, researchId: rid, answer: value, district: seg.district, ageBand: seg.ageBand })
    .onConflictDoUpdate({ target: [pulseResponses.questionId, pulseResponses.researchId], set: { answer: value, district: seg.district, ageBand: seg.ageBand } });
}

/** The member's coarse segment: district and age band. */
function segmentOf(c: C) {
  const p = c.var.user!.profile!;
  return { district: p.district, ageBand: ageBand(ageOn(p.birthDate)) };
}

function inSegment(q: Question, seg: { district: string; ageBand: string }): boolean {
  const s = q.segment ?? {};
  if (s.districts?.length && !s.districts.includes(seg.district)) return false;
  if (s.ageBands?.length && !s.ageBands.includes(seg.ageBand)) return false;
  return true;
}

function liveWhere(now: Date) {
  return and(
    eq(pulseQuestions.status, "active"),
    or(isNull(pulseQuestions.activeFrom), lte(pulseQuestions.activeFrom, now)),
    or(isNull(pulseQuestions.activeTo), gt(pulseQuestions.activeTo, now)),
  );
}

/** Open questions for me, oldest first, not yet answered. */
async function openQuestions(c: C, researchId: string): Promise<Question[]> {
  const db = getDb(c.env);
  const seg = segmentOf(c);
  const live = (await db.select().from(pulseQuestions).where(liveWhere(new Date())).orderBy(asc(pulseQuestions.sortOrder), asc(pulseQuestions.createdAt)).limit(200)).filter((q) =>
    inSegment(q, seg),
  );
  if (!live.length) return [];
  const answered = await db
    .select({ questionId: pulseResponses.questionId })
    .from(pulseResponses)
    .where(and(eq(pulseResponses.researchId, researchId), inArray(pulseResponses.questionId, live.map((q) => q.id))))
    .limit(live.length);
  const done = new Set(answered.map((a) => a.questionId));
  return live.filter((q) => !done.has(q.id));
}

/** Answers I gave this Bangkok week (the quiz reflection doesn't count). */
async function answeredThisWeek(c: C, researchId: string, now = new Date()): Promise<number> {
  const [row] = await getDb(c.env)
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(pulseResponses)
    .where(and(eq(pulseResponses.researchId, researchId), ne(pulseResponses.questionId, CHANGE_PULSE_ID), gte(pulseResponses.createdAt, bkkWeekStart(now))));
  return row?.n ?? 0;
}

/**
 * UCLA-3 follow-up is due when I have a baseline, no follow-up yet, and
 * either 3+ checked-in events or a baseline at least 60 days old (§18.4).
 */
async function followupDue(c: C, accountId: string, researchId: string): Promise<boolean> {
  const db = getDb(c.env);
  const [rows, [checked]] = await Promise.all([
    db.select({ phase: wellbeing.phase, createdAt: wellbeing.createdAt }).from(wellbeing).where(eq(wellbeing.researchId, researchId)).limit(5),
    db
      .select({ n: sql<number>`count(*)` })
      .from(registrations)
      .where(and(eq(registrations.accountId, accountId), isNotNull(registrations.checkedInAt))),
  ]);
  const baseline = rows.find((r) => r.phase === "baseline");
  if (!baseline || rows.some((r) => r.phase === "followup")) return false;
  const old = Date.now() - baseline.createdAt.getTime() >= FOLLOWUP_DAYS * 86_400_000;
  return Number(checked?.n ?? 0) >= FOLLOWUP_EVENTS || old;
}

/** The labelled options a question's answers are read against. */
function optionsOf(q: Question): Opt[] {
  if (q.kind === "area") return DISTRICTS.map((d) => ({ value: d.value, th: d.th, en: d.en }));
  if (q.kind === "scale")
    return [1, 2, 3, 4, 5].map((n) => {
      const o = q.options.find((x) => x.value === String(n));
      return { value: String(n), th: o ? `${n} · ${o.th}` : String(n), en: o ? `${n} · ${o.en}` : String(n) };
    });
  return q.options;
}

/** One answer as words the member chose (text answers are their own words, shown only to them). */
function answerLabel(q: Question, answer: unknown, lang: Lang): string {
  if (q.kind === "text") return typeof answer === "string" ? answer : "";
  const opts = optionsOf(q);
  const vals = Array.isArray(answer) ? answer.map(String) : [String(answer)];
  return vals.map((v) => label(opts, v, lang) || v).join(", ");
}

// ---------------------------------------------------- what the city heard --

type Heard = { q: Question; city: { value: string; tenths: number }[]; district: { value: string; tenths: number }[] | null };

/** Positional or keyed row → array (pg-proxy hands back either). */
function cols(r: unknown): unknown[] {
  return Array.isArray(r) ? r : Object.values(r as Record<string, unknown>);
}

/**
 * Closed questions with 10+ answers, newest first, as rounded shares; the
 * member's district alongside only when the district itself has 10+.
 */
async function cityHeard(c: C, district: string, now = new Date()): Promise<Heard[]> {
  const db = getDb(c.env);
  const closed = await db
    .select()
    .from(pulseQuestions)
    .where(and(ne(pulseQuestions.kind, "text"), or(eq(pulseQuestions.status, "archived"), and(eq(pulseQuestions.status, "active"), lte(pulseQuestions.activeTo, now)))))
    .orderBy(desc(sql`coalesce(${pulseQuestions.heardNoteAt}, ${pulseQuestions.activeTo}, ${pulseQuestions.createdAt})`))
    .limit(24);
  if (!closed.length) return [];
  const ids = closed.map((q) => q.id);
  // Same reading as the admin results: values are [a-z0-9_] (or 1-5), so
  // stripping JSON punctuation and splitting on commas reads every kind.
  const [totals, vals] = (await Promise.all([
    db.execute(sql`
      select question_id, (district = ${district}) as mine, count(*) as n
      from research_pulse_responses
      where question_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
      group by question_id, mine
      limit 1000`),
    db.execute(sql`
      select r.question_id, e.v, (r.district = ${district}) as mine, count(*) as n
      from research_pulse_responses r
      cross join lateral unnest(string_to_array(translate(r.answer::text, '"\\[] ', ''), ',')) as e(v)
      where r.question_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
      group by r.question_id, e.v, mine
      limit 20000`),
  ])) as unknown as [unknown[], unknown[]];
  const isMine = (x: unknown) => x === true || x === "t" || x === "true";
  const n = new Map<string, { all: number; mine: number }>();
  for (const r of totals) {
    const [qid, mine, k] = cols(r);
    const x = n.get(String(qid)) ?? { all: 0, mine: 0 };
    x.all += Number(k);
    if (isMine(mine)) x.mine += Number(k);
    n.set(String(qid), x);
  }
  const counts = new Map<string, { all: Map<string, number>; mine: Map<string, number> }>();
  for (const r of vals) {
    const [qid, v, mine, k] = cols(r);
    const key = String(qid);
    let x = counts.get(key);
    if (!x) counts.set(key, (x = { all: new Map(), mine: new Map() }));
    x.all.set(String(v), (x.all.get(String(v)) ?? 0) + Number(k));
    if (isMine(mine)) x.mine.set(String(v), (x.mine.get(String(v)) ?? 0) + Number(k));
  }
  const out: Heard[] = [];
  for (const q of closed) {
    const tot = n.get(q.id);
    const cs = counts.get(q.id);
    if (!tot || !cs) continue;
    const city = heardShares(tot.all, cs.all);
    if (!city) continue;
    out.push({ q, city, district: heardShares(tot.mine, cs.mine) });
    if (out.length >= HEARD_SHOWN) break;
  }
  return out;
}

/** "about 4 in 10" */
function share(t: View["t"], tenths: number): string {
  return tenths < 1 ? t("ไม่ถึง 1 ใน 10", "under 1 in 10") : t(`ราว ${tenths} ใน 10`, `about ${tenths} in 10`);
}

// --------------------------------------------------------- Bangkok now --

/** The Discover line and the City Pulse strip read the same things (D62). */
export async function pulseGlance(c: C): Promise<{ weather: Weather | null; waiting: boolean }> {
  const user = c.var.user;
  const rid = user?.account.researchId;
  const [weather, waiting] = await Promise.all([
    bangkokWeather(c.env).catch(() => null),
    (async () => {
      if (!user?.profile || !rid || !(await researchConsent(c, user.account.id))) return false;
      const [open, week] = await Promise.all([openQuestions(c, rid), answeredThisWeek(c, rid)]);
      return open.length > 0 && week < WEEK_CAP;
    })().catch(() => false),
  ]);
  return { weather, waiting };
}

/** "As of 14:00" (Bangkok time) for a stored reading: the clock refreshes it hourly (owner card D1). */
export function asOf(t: View["t"], lang: Lang, at: number): string {
  const time = fmtParts(new Date(at), lang).time;
  return t(`ข้อมูลเมื่อ ${time}`, `as of ${time}`);
}

/** Short "33° · rain 20% · PM2.5 18" pieces, each only when known. */
export function weatherBits(t: View["t"], w: Weather | null): string[] {
  if (!w) return [];
  const bits: string[] = [];
  if (w.feelsLike !== null) bits.push(t(`รู้สึกเหมือน ${Math.round(w.feelsLike)}°`, `feels ${Math.round(w.feelsLike)}°`));
  if (w.rain3h !== null) bits.push(t(`ฝน ${w.rain3h}%`, `rain ${w.rain3h}%`));
  if (w.pm25 !== null) bits.push(`PM2.5 ${w.pm25}`);
  return bits;
}

function BangkokNow(props: { v: View; weather: Weather | null; sanroo: SanrooHeadline | null }) {
  const { t, lang } = props.v;
  const w = props.weather;
  const rows: [string, string, string][] = [];
  if (w?.feelsLike != null) {
    const b = heatBand(w.feelsLike);
    rows.push([t("ร้อนแค่ไหน", "Heat"), `${Math.round(w.feelsLike)}°`, L(lang, b)]);
  }
  if (w?.rain3h != null) rows.push([t("ฝนใน 3 ชั่วโมง", "Rain, next 3 hours"), `${w.rain3h}%`, w.rain24h != null ? t(`ทั้งวัน ${w.rain24h} มม.`, `${w.rain24h} mm today`) : ""]);
  if (w?.pm25 != null) {
    const b = pm25Band(w.pm25);
    rows.push(["PM2.5", `${w.pm25}`, L(lang, b)]);
  }
  return (
    <section class="cp-sec cp-now" aria-labelledby="cp-now-h">
      <h2 id="cp-now-h">{t("กรุงเทพฯ ตอนนี้", "Bangkok now")}</h2>
      {rows.length ? (
        <dl class="cp-now-grid">
          {rows.map(([k, val, note]) => (
            <div>
              <dt>{k}</dt>
              <dd>
                <b>{val}</b> {note ? <span class="muted">{note}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p class="muted">{t("ตอนนี้ยังดึงข้อมูลอากาศไม่ได้", "Weather isn't available right now.")}</p>
      )}
      {rows.length && w ? <p class="muted cp-asof">{asOf(t, lang, w.fetchedAt)}</p> : null}
      {props.sanroo ? (
        <p class="cp-sanroo">
          {L(lang, props.sanroo)}{" "}
          <a href={`${SANROO_URL}?lang=${lang}`} target="_blank" rel="noopener">
            {t("ดูแผนที่สดที่แสนรู้", "See Sanroo's live map")}
          </a>
        </p>
      ) : (
        <p class="cp-sanroo">
          <a href={`${SANROO_URL}?lang=${lang}`} target="_blank" rel="noopener">
            {t("น้ำ ฝน อากาศ และการจราจรสด ๆ ที่แสนรู้", "Water, rain, air and traffic, live on Sanroo")}
          </a>
        </p>
      )}
      <p class="cp-source">{t("ข้อมูลอากาศจาก Open-Meteo.com · สรุปเมืองจากแสนรู้ (Sanroo) เราส่งแค่ตำแหน่งกลางเมือง ไม่ส่งตำแหน่งของคุณ", "Weather data by Open-Meteo.com · city summary from Sanroo. Only the city centre's position is sent, never yours.")}</p>
    </section>
  );
}

// ------------------------------------------------------------------ UI --

function QuestionForm(props: { v: View; q: Question }) {
  const { t, lang } = props.v;
  const q = props.q;
  const prompt = L(lang, { th: q.promptTh, en: q.promptEn });
  let input;
  switch (q.kind) {
    case "single":
      input = <Choices legend={prompt} name="answer" options={q.options} lang={lang} type="radio" required />;
      break;
    case "multi":
      input = <Choices legend={prompt} name="answer" options={q.options} lang={lang} hint={t("เลือกได้มากกว่า 1", "Pick all that apply")} />;
      break;
    case "scale":
      input = <Choices legend={prompt} name="answer" options={optionsOf(q)} lang={lang} type="radio" required hint={t("1 = น้อยที่สุด, 5 = มากที่สุด", "1 = least, 5 = most")} />;
      break;
    case "text":
      input = <TextArea label={prompt} name="answer" rows={3} maxlength={TEXT_MAX} required hint={t(`ไม่เกิน ${TEXT_MAX} ตัวอักษร อย่าใส่ข้อมูลส่วนตัว คำของคุณไม่แสดงให้ใครเห็น นับเป็นภาพรวมเท่านั้น`, `Up to ${TEXT_MAX} characters. Please don't include personal details. Your words are never shown to anyone, only counted.`)} />;
      break;
    case "area":
      input = <Select label={prompt} name="answer" options={districtsAZ(lang)} lang={lang} required blank={t("เลือกเขต", "Choose a district")} />;
      break;
    default:
      return null;
  }
  return (
    <form method="post" action={`/pulse/${encodeURIComponent(q.id)}`} class="cp-q">
      {input}
      <Button>{t("ส่งคำตอบ", "Send my answer")}</Button>
    </form>
  );
}

function FollowupCard(props: { v: View }) {
  const { t, lang } = props.v;
  return (
    <Card>
      <h3>{t("ช่วงนี้เป็นยังไงบ้าง?", "How are you feeling these days?")}</h3>
      <p class="muted">{t("3 คำถามเดิมจากตอนสมัคร เพื่อดูว่ากิจกรรมช่วยให้เหงาน้อยลงจริงไหม จะตอบหรือไม่ก็ได้", "The same 3 questions as when you joined, to see whether events help with loneliness. Optional.")}</p>
      <form method="post" action="/pulse/wellbeing">
        {UCLA3.map(([th, en], i) => (
          <Choices legend={t(th, en)} name={`q${i + 1}`} options={UCLA_SCALE} lang={lang} type="radio" required />
        ))}
        <Button>{t("ส่งคำตอบ", "Send answers")}</Button>
      </form>
    </Card>
  );
}

/** Next Monday in Bangkok, for "next question from …". */
function nextWeek(now = new Date()): Date {
  return new Date(bkkWeekStart(now).getTime() + 7 * 86_400_000);
}

function ThisWeek(props: { v: View; open: Question[]; week: number; due: boolean; justAnswered: boolean }) {
  const { t, lang } = props.v;
  const { open, week } = props;
  const capped = week >= WEEK_CAP;
  const [first, ...rest] = open;
  let body;
  if (props.due) body = <FollowupCard v={props.v} />;
  else if (capped && open.length)
    body = <p class="cp-quiet">{t(`ครบ ${WEEK_CAP} คำถามของสัปดาห์นี้แล้ว ขอบคุณที่ช่วยเมือง คำถามถัดไปเริ่ม${fmtDate(nextWeek(), lang)}`, `That's this week's ${WEEK_CAP}. Thanks for helping the city. More from ${fmtDate(nextWeek(), lang)}.`)}</p>;
  else if (!first) body = <p class="cp-quiet">{t("ตอนนี้ไม่มีคำถามรออยู่ เดี๋ยวมีคำถามใหม่จะขึ้นตรงนี้", "No question waiting right now. A new one will show up here.")}</p>;
  else if (props.justAnswered)
    // After answering, the next one waits behind a tap instead of appearing on its own (no autopilot, D64).
    body = (
      <details class="cp-more">
        <summary>{rest.length + 1 === 1 ? t("มีอีก 1 ข้อ ถ้าพอมีเวลา", "There's 1 more if you have a minute") : t(`มีอีก ${rest.length + 1} ข้อ ถ้าพอมีเวลา`, `There are ${rest.length + 1} more if you have a minute`)}</summary>
        <QuestionForm v={props.v} q={first} />
      </details>
    );
  else body = <QuestionForm v={props.v} q={first} />;
  return (
    <section class="cp-sec" aria-labelledby="cp-week-h">
      <h2 id="cp-week-h">{t("คำถามสัปดาห์นี้", "This week's question")}</h2>
      {body}
    </section>
  );
}

function CityHeard(props: { v: View; heard: Heard[]; district: string }) {
  const { t, lang } = props.v;
  const dname = label(DISTRICTS, props.district, lang);
  return (
    <section class="cp-sec" aria-labelledby="cp-heard-h">
      <h2 id="cp-heard-h">{t("เมืองได้ยินอะไร", "What the city heard")}</h2>
      {props.heard.length ? (
        <ul class="cp-heard">
          {props.heard.map(({ q, city, district }) => {
            const opts = optionsOf(q);
            return (
              <li>
                <h3>{L(lang, { th: q.promptTh, en: q.promptEn })}</h3>
                <ul class="cp-shares">
                  {city.map((s) => (
                    <li>
                      <span class="cp-bar" style={`--w:${Math.max(s.tenths, 0.4) * 10}%`} aria-hidden="true" />
                      <b>{label(opts, s.value, lang) || s.value}</b> <span class="muted">{share(t, s.tenths)}</span>
                    </li>
                  ))}
                </ul>
                {district?.length ? (
                  <p class="cp-district">
                    {t(`ในเขต${dname}: ส่วนใหญ่ตอบ`, `In ${dname}: most said`)} <b>{label(opts, district[0]!.value, lang) || district[0]!.value}</b> ({share(t, district[0]!.tenths)})
                  </p>
                ) : null}
                {q.heardNoteTh || q.heardNoteEn ? (
                  <div class="cp-changed">
                    <b>{t("สิ่งที่เปลี่ยนไป", "What changed")}</b>
                    <p>{L(lang, { th: q.heardNoteTh || q.heardNoteEn || "", en: q.heardNoteEn || q.heardNoteTh || "" })}</p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p class="cp-quiet">{t("ผลจะขึ้นตรงนี้เมื่อคำถามปิดและมีคนตอบอย่างน้อย 10 คน", "Results show here once a question closes with at least 10 answers.")}</p>
      )}
    </section>
  );
}

type Mine = { q: Question; answer: unknown };

function MyAnswers(props: { v: View; mine: Mine[] }) {
  const { t, lang } = props.v;
  return (
    <section class="cp-sec" aria-labelledby="cp-mine-h">
      <details class="cp-mine">
        <summary>
          <h2 id="cp-mine-h">{t("คำตอบของฉัน", "My answers")}</h2>
          <span class="cp-open" aria-hidden="true">{t("ดู", "Show")}</span>
        </summary>
        <p class="muted">{t("มีแค่คุณที่เห็นตรงนี้ ทีมงานและ กทม. ไม่เห็นว่าใครตอบอะไร", "Only you see this. Staff and the BMA never see who answered what.")}</p>
        {props.mine.length ? (
          <ul class="cp-mine-list">
            {props.mine.map(({ q, answer }) => (
              <li>
                <span>
                  <span class="muted">{L(lang, { th: q.promptTh, en: q.promptEn })}</span>
                  <br />
                  <b>{answerLabel(q, answer, lang)}</b>
                </span>
                <form method="post" action={`/pulse/${encodeURIComponent(q.id)}/withdraw`}>
                  <Button kind="ghost">{t("ถอนคำตอบ", "Take back")}</Button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p class="cp-quiet">{t("ยังไม่มีคำตอบ", "No answers yet.")}</p>
        )}
      </details>
    </section>
  );
}

function Suggest(props: { v: View; done: boolean }) {
  const { t } = props.v;
  return (
    <section class="cp-sec" aria-labelledby="cp-sug-h">
      <h2 id="cp-sug-h">{t("อยากให้เมืองถามอะไร?", "What should the city ask?")}</h2>
      {props.done ? (
        <p class="cp-quiet">{t("ได้รับแล้ว ขอบคุณ ส่งได้อีกครั้งสัปดาห์หน้า", "Got it, thanks. You can suggest another next week.")}</p>
      ) : (
        <form method="post" action="/pulse/suggest">
          <TextArea
            label={t("คำถามที่อยากให้ถาม", "A question you'd like asked")}
            name="body"
            rows={2}
            maxlength={SUGGEST_MAX}
            required
            hint={t("ทีมดูแลอ่านแล้วจัดเป็นหัวข้อ จากนั้นลบข้อความทิ้ง กทม. เห็นแค่จำนวนต่อหัวข้อ สัปดาห์ละ 1 ข้อ", "Moderators read it, sort it into a topic, then delete your words. The BMA only sees counts per topic. One a week.")}
          />
          <Button kind="ghost">{t("ส่งคำถาม", "Send question")}</Button>
        </form>
      )}
    </section>
  );
}

const PULSE_CSS = `
.cp-lede{margin:0 0 8px}
.cp-sec{padding:20px 0;border-top:1px solid var(--line)}
.cp-sec:first-of-type{border-top:0}
.cp-sec h2{font-size:1.15rem;margin:0 0 12px}
.cp-sec h3{font-size:1rem;margin:0 0 8px}
.cp-now-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:0 0 12px}
.cp-now-grid div{margin:0}
.cp-now-grid dt{font-size:.85rem;color:var(--ink-3)}
.cp-now-grid dd{margin:0}
.cp-now-grid dd b{font-size:1.35rem}
.cp-sanroo{margin:0 0 8px}
.cp-source{font-size:.8rem;color:var(--ink-3);margin:0}
.cp-quiet{color:var(--ink-3);margin:0}
.cp-more summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font-weight:600;color:var(--brand)}
.cp-heard{list-style:none;margin:0;padding:0;display:grid;gap:24px}
.cp-shares{list-style:none;margin:0 0 8px;padding:0;display:grid;gap:8px}
.cp-shares li{position:relative;padding:8px 12px;border-radius:10px;overflow:hidden;isolation:isolate}
.cp-bar{position:absolute;inset:0 auto 0 0;width:var(--w);background:var(--info-soft);z-index:-1}
.cp-district{margin:0 0 8px;font-size:.95rem}
.cp-changed{border-left:3px solid var(--brand);padding:4px 0 4px 12px}
.cp-changed p{margin:4px 0 0}
main details.cp-mine,main details.cp-more{background:none;border:0;padding:0;box-shadow:none;margin:0;border-radius:0}
.cp-mine summary{cursor:pointer;min-height:44px;display:flex;align-items:center}
.cp-mine summary h2{display:inline;margin:0}
.cp-mine summary{justify-content:space-between;list-style:none}
.cp-mine summary::-webkit-details-marker{display:none}
.cp-open{color:var(--brand);font-weight:600}
.cp-open::after{content:" ▾"}
.cp-mine[open] .cp-open{visibility:hidden}
.cp-mine-list{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:12px}
.cp-mine-list li{display:flex;gap:12px;align-items:center;justify-content:space-between;border-top:1px solid var(--line);padding-top:12px}
.cp-mine-list form{margin:0;flex:none}
.cp-foot{font-size:.9rem;color:var(--ink-3);border-top:1px solid var(--line);padding-top:16px}
`;

async function renderPulse(c: C, opts: { error?: string; status?: 200 | 400 | 403 | 404 | 409 } = {}) {
  const v = view(c);
  const { t } = v;
  const user = c.var.user!;
  const title = "City Pulse";
  const rid = user.account.researchId;
  const consented = !!rid && (await researchConsent(c, user.account.id));
  // One read of the stored reading (owner card D1): the clock fetches the outside sites, never this page.
  const { weather, sanroo } = await cityNow(c.env);
  if (!consented) {
    return page(
      c,
      { title, tab: "pulse", status: opts.status ?? 200 },
      <>
        <style dangerouslySetInnerHTML={{ __html: PULSE_CSS }} />
        <h1>City Pulse</h1>
        {opts.error ? <Notice kind="error">{opts.error}</Notice> : null}
        <BangkokNow v={v} weather={weather} sanroo={sanroo} />
        <section class="cp-sec">
          <h2>{t("ช่วยเมืองด้วยคำถามสั้น ๆ", "Help the city with quick questions")}</h2>
          <p>
            {t(
              "City Pulse คือคำถามสั้น ๆ เกี่ยวกับการใช้ชีวิตในกรุงเทพฯ เช่น ความปลอดภัย การเดินทาง ที่นั่งสาธารณะ คำตอบจะเก็บไว้โดยใช้รหัสแทนชื่อของคุณ ผลลัพธ์แสดงเป็นภาพรวมจากอย่างน้อย 10 คนเท่านั้น ภาพรวมนี้ส่งให้กรุงเทพมหานคร (กทม.) เพื่อให้เมืองน่าออกไปพบปะผู้คนมากขึ้น และช่วยให้เราเลือกสถานที่ได้ดีขึ้น",
              "City Pulse asks quick questions about life in Bangkok: safety, getting around, places to sit. Answers are kept under a code, not your name, and results are only ever shown as totals from 10+ people. Those totals go to the Bangkok Metropolitan Administration (BMA) to make the city easier to meet people in, and help us pick better places.",
            )}
          </p>
          <p>{t("คุณยังไม่ได้ให้ความยินยอมด้านการวิจัย", "You haven't switched on research consent.")}</p>
          <LinkButton href="/settings/privacy">{t("ไปที่ศูนย์ความเป็นส่วนตัว", "Go to the Privacy centre")}</LinkButton>
        </section>
      </>,
    );
  }
  const seg = segmentOf(c);
  const db = getDb(c.env);
  const [open, week, due, heard, mineRows, prof] = await Promise.all([
    openQuestions(c, rid),
    answeredThisWeek(c, rid),
    followupDue(c, user.account.id, rid),
    cityHeard(c, seg.district),
    db
      .select({ q: pulseQuestions, answer: pulseResponses.answer })
      .from(pulseResponses)
      .innerJoin(pulseQuestions, eq(pulseQuestions.id, pulseResponses.questionId))
      .where(eq(pulseResponses.researchId, rid))
      .orderBy(desc(pulseResponses.createdAt))
      .limit(100),
    db.select({ bio: profiles.bio }).from(profiles).where(eq(profiles.accountId, user.account.id)).limit(1),
  ]);
  const suggested = prof[0]?.bio?.pulseSuggestWeek === bkkWeekKey(new Date());
  return page(
    c,
    { title, tab: "pulse", status: opts.status ?? 200 },
    <>
      <style dangerouslySetInnerHTML={{ __html: PULSE_CSS }} />
      <h1>City Pulse</h1>
      <p class="muted cp-lede">{t("คำตอบของคุณช่วยให้กรุงเทพฯ น่าออกไปเจอผู้คนมากขึ้น เราส่งให้ กทม. เฉพาะภาพรวมจากอย่างน้อย 10 คน", "Your answers help make Bangkok a better place to meet people. Totals from 10+ people go to the BMA.")}</p>
      {opts.error ? <Notice kind="error">{opts.error}</Notice> : null}
      <ThisWeek v={v} open={open} week={week} due={due} justAnswered={c.req.query("notice") === "answered"} />
      <CityHeard v={v} heard={heard} district={seg.district} />
      <BangkokNow v={v} weather={weather} sanroo={sanroo} />
      <MyAnswers v={v} mine={mineRows.map((r) => ({ q: r.q, answer: r.answer }))} />
      <Suggest v={v} done={suggested} />
      <p class="cp-foot">
        {t("ปิดหรือเปิดการวิจัยได้ทุกเมื่อ เมื่อปิด คำตอบทั้งหมดจะถูกลบ", "Switch research off any time; your answers are then deleted.")} <a href="/settings/privacy">{t("ศูนย์ความเป็นส่วนตัว", "Privacy centre")}</a>
      </p>
    </>,
  );
}

pulseRoutes.get("/pulse", (c) => renderPulse(c));

/** Research consent and a research id, or the page with a 403. */
async function gate(c: C): Promise<{ rid: string } | Response> {
  const { t } = view(c);
  const user = c.var.user!;
  const rid = user.account.researchId;
  if (!rid || !(await researchConsent(c, user.account.id))) {
    return renderPulse(c, { status: 403, error: t("ต้องให้ความยินยอมด้านการวิจัยก่อน", "Research consent is needed first.") });
  }
  return { rid };
}

pulseRoutes.post("/pulse/wellbeing", async (c) => {
  const { t } = view(c);
  const user = c.var.user!;
  const g = await gate(c);
  if (g instanceof Response) return g;
  if (!(await followupDue(c, user.account.id, g.rid))) {
    return renderPulse(c, { status: 403, error: t("ยังไม่ถึงเวลาตอบคำถามนี้", "This check-in isn't open for you right now.") });
  }
  const body = await c.req.parseBody();
  const answers = [body.q1, body.q2, body.q3].map((x) => Number(str(x)));
  if (!answers.every((n) => Number.isInteger(n) && n >= 1 && n <= 3)) {
    return renderPulse(c, { status: 400, error: t("ตอบให้ครบทั้ง 3 ข้อ", "Please answer all three questions.") });
  }
  await getDb(c.env)
    .insert(wellbeing)
    .values({ id: newId(), researchId: g.rid, phase: "followup", q1: answers[0], q2: answers[1], q3: answers[2] })
    .onConflictDoNothing();
  return c.redirect("/pulse?notice=answered");
});

/** Suggest a question (D66): once a Bangkok week. The words are stored with the month only, no person. */
pulseRoutes.post("/pulse/suggest", async (c) => {
  const { t } = view(c);
  const user = c.var.user!;
  const g = await gate(c);
  if (g instanceof Response) return g;
  const text = str((await c.req.parseBody()).body).replace(/\s+/g, " ").trim();
  if (!text || text.length > SUGGEST_MAX) {
    return renderPulse(c, { status: 400, error: t(`พิมพ์คำถามสั้น ๆ ไม่เกิน ${SUGGEST_MAX} ตัวอักษร`, `Type a short question, up to ${SUGGEST_MAX} characters.`) });
  }
  const db = getDb(c.env);
  const now = new Date();
  const week = bkkWeekKey(now);
  const [p] = await db.select({ bio: profiles.bio }).from(profiles).where(eq(profiles.accountId, user.account.id)).limit(1);
  if (!p) return c.redirect("/pulse");
  if (p.bio?.pulseSuggestWeek === week) {
    return renderPulse(c, { status: 409, error: t("สัปดาห์นี้ส่งคำถามไปแล้ว ส่งได้อีกครั้งสัปดาห์หน้า", "You've suggested one this week already. Try again next week.") });
  }
  await Promise.all([
    db.insert(pulseSuggestions).values({ id: newId(), body: text, month: bkkMonth(now) }),
    db
      .update(profiles)
      .set({ bio: { ...(p.bio ?? {}), pulseSuggestWeek: week } })
      .where(eq(profiles.accountId, user.account.id)),
  ]);
  return c.redirect("/pulse");
});

/** Take one of my answers back (D65). */
pulseRoutes.post("/pulse/:id/withdraw", async (c) => {
  const g = await gate(c);
  if (g instanceof Response) return g;
  await getDb(c.env)
    .delete(pulseResponses)
    .where(and(eq(pulseResponses.questionId, c.req.param("id")), eq(pulseResponses.researchId, g.rid)));
  return c.redirect("/pulse?notice=saved");
});

/** Validates an answer against the question's kind; null means invalid. */
function parseAnswer(q: Question, raw: unknown): string | string[] | number | null {
  const opts = q.options.map((o) => o.value);
  switch (q.kind) {
    case "single": {
      const v = str(raw);
      return opts.includes(v) ? v : null;
    }
    case "multi": {
      const vs = [...new Set(list(raw))];
      return vs.length && vs.every((x) => opts.includes(x)) ? vs : null;
    }
    case "scale": {
      const s = str(raw);
      const n = Number(s);
      return /^[1-5]$/.test(s) && n >= 1 && n <= 5 ? n : null;
    }
    case "text": {
      const v = str(raw);
      return v && v.length <= TEXT_MAX ? v : null;
    }
    case "area": {
      const v = str(raw);
      return values(DISTRICTS).includes(v) ? v : null;
    }
    default:
      return null;
  }
}

pulseRoutes.post("/pulse/:id", async (c) => {
  const { t } = view(c);
  const g = await gate(c);
  if (g instanceof Response) return g;
  const db = getDb(c.env);
  const [q] = await db
    .select()
    .from(pulseQuestions)
    .where(and(eq(pulseQuestions.id, c.req.param("id")), liveWhere(new Date())))
    .limit(1);
  const seg = segmentOf(c);
  if (!q || !inSegment(q, seg)) {
    return renderPulse(c, { status: 404, error: t("ไม่พบคำถามนี้หรือปิดไปแล้ว", "That question isn't available.") });
  }
  if ((await answeredThisWeek(c, g.rid)) >= WEEK_CAP) {
    return renderPulse(c, { status: 409, error: t(`สัปดาห์นี้ตอบครบ ${WEEK_CAP} ข้อแล้ว ไว้สัปดาห์หน้านะ`, `You've answered this week's ${WEEK_CAP}. More next week.`) });
  }
  const body = await c.req.parseBody({ all: true });
  const answer = parseAnswer(q, body.answer);
  if (answer === null) {
    return renderPulse(c, { status: 400, error: t("คำตอบไม่ถูกต้อง ลองใหม่อีกครั้ง", "That answer isn't valid. Please try again.") });
  }
  const inserted = await db
    .insert(pulseResponses)
    .values({ id: newId(), questionId: q.id, researchId: g.rid, answer, district: seg.district, ageBand: seg.ageBand })
    .onConflictDoNothing()
    .returning({ id: pulseResponses.id });
  if (!inserted.length) {
    return renderPulse(c, { status: 409, error: t("คุณตอบคำถามนี้ไปแล้ว ขอบคุณที่ช่วยตอบ", "You've already answered this one. Thanks!") });
  }
  return c.redirect("/pulse?notice=answered");
});
