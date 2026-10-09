/**
 * City Pulse (PRD §6): short civic questions answered by members who opted in
 * to research. Answers are stored under the member's pseudonymous researchId
 * only — never the account id (PRD §12.3) — with district and age band copied
 * in coarse form for aggregation.
 *
 *   GET  /pulse              open questions + UCLA-3 follow-up when due (§18.4)
 *   POST /pulse/wellbeing    UCLA-3 follow-up
 *   POST /pulse/:id          answer one question
 */
import { Hono, type Context } from "hono";
import { and, asc, desc, eq, inArray, isNotNull, isNull, gt, lte, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { ageBand, ageOn } from "../domain/rules";
import { DISTRICTS, values } from "../lib/constants";
import { newId } from "../lib/crypto";
import type { AppEnv } from "../lib/env";
import { L } from "../lib/i18n";
import { requireMember } from "../lib/session";
import { consents, pulseQuestions, pulseResponses, registrations, wellbeing } from "../schema";
import { Button, Card, Choices, Empty, LinkButton, list, Notice, page, Select, str, TextArea, view, type View } from "../ui/kit";
import { UCLA3, UCLA_SCALE } from "./onboarding";

export const pulseRoutes = new Hono<AppEnv>();
pulseRoutes.use("/pulse", requireMember);
pulseRoutes.use("/pulse/*", requireMember);

type C = Context<AppEnv>;
type Question = typeof pulseQuestions.$inferSelect;

const TEXT_MAX = 280;
const FOLLOWUP_EVENTS = 3;
const FOLLOWUP_DAYS = 60;

async function researchConsent(c: C, accountId: string): Promise<boolean> {
  const [row] = await getDb(c.env)
    .select({ granted: consents.granted })
    .from(consents)
    .where(and(eq(consents.accountId, accountId), eq(consents.category, "research")))
    .orderBy(desc(consents.createdAt))
    .limit(1);
  return !!row?.granted;
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

/** Open questions for me, in order, not yet answered. */
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

// ------------------------------------------------------------------ UI --

function QuestionCard(props: { v: View; q: Question }) {
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
    case "scale": {
      const opts = [1, 2, 3, 4, 5].map((n) => {
        const o = q.options.find((x) => x.value === String(n));
        return { value: String(n), th: o ? `${n} · ${o.th}` : String(n), en: o ? `${n} · ${o.en}` : String(n) };
      });
      input = <Choices legend={prompt} name="answer" options={opts} lang={lang} type="radio" required hint={t("1 = น้อยที่สุด, 5 = มากที่สุด", "1 = least, 5 = most")} />;
      break;
    }
    case "text":
      input = <TextArea label={prompt} name="answer" rows={3} maxlength={TEXT_MAX} required hint={t(`ไม่เกิน ${TEXT_MAX} ตัวอักษร — อย่าใส่ข้อมูลส่วนตัว`, `Up to ${TEXT_MAX} characters. Please don't include personal details.`)} />;
      break;
    case "area":
      input = <Select label={prompt} name="answer" options={DISTRICTS} lang={lang} required blank={t("เลือกเขต", "Choose a district")} />;
      break;
    default:
      return null;
  }
  return (
    <Card>
      <form method="post" action={`/pulse/${encodeURIComponent(q.id)}`}>
        {input}
        <Button>{t("ส่งคำตอบ", "Submit")}</Button>
      </form>
    </Card>
  );
}

function FollowupCard(props: { v: View }) {
  const { t, lang } = props.v;
  return (
    <Card>
      <h2>{t("ตอนนี้คุณรู้สึกอย่างไรบ้าง?", "How are you feeling these days?")}</h2>
      <p class="muted">{t("3 คำถามเดิมจากตอนสมัคร เพื่อดูว่ากิจกรรมช่วยให้เหงาน้อยลงหรือไม่ ไม่บังคับ", "The same 3 questions as when you joined, to see whether events help with loneliness. Optional.")}</p>
      <form method="post" action="/pulse/wellbeing">
        {UCLA3.map(([th, en], i) => (
          <Choices legend={t(th, en)} name={`q${i + 1}`} options={UCLA_SCALE} lang={lang} type="radio" required />
        ))}
        <Button>{t("ส่งคำตอบ", "Submit")}</Button>
      </form>
    </Card>
  );
}

async function renderPulse(c: C, opts: { error?: string; status?: 200 | 400 | 403 | 404 | 409 } = {}) {
  const v = view(c);
  const { t } = v;
  const user = c.var.user!;
  const title = "City Pulse";
  const rid = user.account.researchId;
  if (!rid || !(await researchConsent(c, user.account.id))) {
    return page(
      c,
      { title, tab: "pulse", status: opts.status ?? 200 },
      <>
        <h1>City Pulse</h1>
        {opts.error ? <Notice kind="error">{opts.error}</Notice> : null}
        <Card>
          <p>
            {t(
              "City Pulse คือคำถามสั้น ๆ เกี่ยวกับการใช้ชีวิตในกรุงเทพฯ เช่น ความปลอดภัย การเดินทาง ที่นั่งสาธารณะ คำตอบเก็บด้วยรหัสวิจัยแทนตัวตน และ กทม. เห็นเฉพาะภาพรวมจากอย่างน้อย 10 คน",
              "City Pulse asks quick questions about life in Bangkok — safety, getting around, places to sit. Answers are stored under a research code instead of your identity, and BMA only sees totals from 10+ people.",
            )}
          </p>
          <p>{t("คุณยังไม่ได้เปิดความยินยอมด้านการวิจัย", "You haven't switched on research consent.")}</p>
          <LinkButton href="/settings/privacy">{t("ไปที่ศูนย์ความเป็นส่วนตัว", "Go to the Privacy Center")}</LinkButton>
        </Card>
      </>,
    );
  }
  const [questions, due] = await Promise.all([openQuestions(c, rid), followupDue(c, user.account.id, rid)]);
  return page(
    c,
    { title, tab: "pulse", status: opts.status ?? 200 },
    <>
      <h1>City Pulse</h1>
      <p class="muted">{t("เสียงของคุณช่วยให้กรุงเทพฯ น่าออกไปพบปะผู้คนมากขึ้น", "Your answers help make Bangkok a better place to meet people.")}</p>
      {opts.error ? <Notice kind="error">{opts.error}</Notice> : null}
      {due ? <FollowupCard v={v} /> : null}
      {questions.length ? questions.map((q) => <QuestionCard v={v} q={q} />) : <Empty>{t("ตอบครบแล้ว! กลับมาใหม่เร็ว ๆ นี้ 🎉", "All caught up! Check back soon 🎉")}</Empty>}
    </>,
  );
}

pulseRoutes.get("/pulse", (c) => renderPulse(c));

pulseRoutes.post("/pulse/wellbeing", async (c) => {
  const { t } = view(c);
  const user = c.var.user!;
  const rid = user.account.researchId;
  if (!rid || !(await researchConsent(c, user.account.id))) {
    return renderPulse(c, { status: 403, error: t("ต้องเปิดความยินยอมด้านการวิจัยก่อน", "Research consent is needed first.") });
  }
  if (!(await followupDue(c, user.account.id, rid))) {
    return renderPulse(c, { status: 403, error: t("ยังไม่ถึงเวลาตอบคำถามนี้", "This check-in isn't open for you right now.") });
  }
  const body = await c.req.parseBody();
  const answers = [body.q1, body.q2, body.q3].map((x) => Number(str(x)));
  if (!answers.every((n) => Number.isInteger(n) && n >= 1 && n <= 3)) {
    return renderPulse(c, { status: 400, error: t("ตอบให้ครบทั้ง 3 ข้อ", "Please answer all three questions.") });
  }
  await getDb(c.env)
    .insert(wellbeing)
    .values({ id: newId(), researchId: rid, phase: "followup", q1: answers[0], q2: answers[1], q3: answers[2] })
    .onConflictDoNothing();
  return c.redirect("/pulse?notice=answered");
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
  const user = c.var.user!;
  const rid = user.account.researchId;
  if (!rid || !(await researchConsent(c, user.account.id))) {
    return renderPulse(c, { status: 403, error: t("ต้องเปิดความยินยอมด้านการวิจัยก่อน", "Research consent is needed first.") });
  }
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
  const body = await c.req.parseBody({ all: true });
  const answer = parseAnswer(q, body.answer);
  if (answer === null) {
    return renderPulse(c, { status: 400, error: t("คำตอบไม่ถูกต้อง ลองใหม่อีกครั้ง", "That answer isn't valid — please try again.") });
  }
  const inserted = await db
    .insert(pulseResponses)
    .values({ id: newId(), questionId: q.id, researchId: rid, answer, district: seg.district, ageBand: seg.ageBand })
    .onConflictDoNothing()
    .returning({ id: pulseResponses.id });
  if (!inserted.length) {
    return renderPulse(c, { status: 409, error: t("คุณตอบคำถามนี้ไปแล้ว ขอบคุณ!", "You've already answered this one — thanks!") });
  }
  return c.redirect("/pulse?notice=answered");
});
