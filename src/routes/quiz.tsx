/**
 * Bangkok Vibe quiz and Bangkok Types (design/reference/vibe-quiz-v3.md).
 *
 *   GET  /quiz              take / retake (signed in)
 *   POST /quiz              score, save to `vibes`, redirect to the result
 *   GET  /quiz/result       my type
 *   POST /quiz/visibility   show / hide my type to groupmates
 *   GET  /types             public gallery of all 13 types
 *   GET  /types/:slug       public type page (shareable)
 *
 * The seed is derived on the server from the account and how many questions
 * it has already seen, so the client can never choose its questions. The
 * hidden seed field only proves the form is the current one.
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import type { AppEnv } from "../lib/env";
import { L, type Lang } from "../lib/i18n";
import { requireUser } from "../lib/session";
import { vibes } from "../schema";
import { Flow, FlowStep, AnswerCard, type Stage } from "../ui/flow";
import { Card, LinkButton, Notice, page, safeNext, str, view, type View } from "../ui/kit";
import { CATEGORIES, POLES } from "../vibe/content";
import {
  ARCHETYPES,
  MATCH_LABELS,
  displayName,
  suggestedMatches,
  typeOf,
  type ArchetypeKey,
} from "../vibe/archetypes";
import { generateSession, scoreSession, strengthOf, type Answers, type Question } from "../vibe/generator";

export const quizRoutes = new Hono<AppEnv>();

export type VibeRow = typeof vibes.$inferSelect;

export const PER_CATEGORY = 3;
export const MIN_ANSWERED = 12;
/** Keep the seen-list bounded; the generator only needs recent history. */
const SEEN_MAX = 400;

// ------------------------------------------------------------- helpers --

export async function loadVibe(env: AppEnv["Bindings"], accountId: string): Promise<VibeRow | null> {
  const [row] = await getDb(env).select().from(vibes).where(eq(vibes.accountId, accountId)).limit(1);
  return row ?? null;
}

/** Server-derived: never read from the client. */
export function quizSeed(accountId: string, row: Pick<VibeRow, "seen"> | null): string {
  return `${accountId}:${row ? row.seen.length : 0}`;
}

export function quizQuestions(seed: string, row: Pick<VibeRow, "seen"> | null): Question[] {
  return generateSession({ seed, perCategory: PER_CATEGORY, seen: new Set(row?.seen ?? []) });
}

/** "The Connector" → "connector": readable, shareable URLs. */
export function typeSlug(key: ArchetypeKey): string {
  return ARCHETYPES[key].name.en
    .replace(/^The /, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const BY_SLUG = new Map((Object.keys(ARCHETYPES) as ArchetypeKey[]).map((k) => [typeSlug(k), k]));

export function isArchetype(key: string): key is ArchetypeKey {
  return Object.prototype.hasOwnProperty.call(ARCHETYPES, key);
}

const STRENGTH: Record<string, [string, string]> = {
  strong: ["ชัดเจน", "Strong"],
  leans: ["ค่อนข้าง", "Leans"],
  balanced: ["สมดุล", "Balanced"],
};

// ------------------------------------------------------------ the quiz --

export function QuizFlow(props: {
  v: View;
  questions: Question[];
  seed: string;
  next: string;
  stage?: Stage;
  close?: string;
  /** "Skip for now" target (onboarding only). */
  skipAction?: string;
  error?: string;
}) {
  const { t, lang } = props.v;
  return (
    <Flow
      v={props.v}
      action="/quiz"
      submit={t("ดูผลลัพธ์", "See my type")}
      hidden={{ seed: props.seed, next: props.next }}
      stage={props.stage}
      close={props.close}
      autoSubmit
      error={props.error ? <Notice kind="error">{props.error}</Notice> : undefined}
      extra={
        props.skipAction ? (
          <button type="submit" class="skip" formaction={props.skipAction} formnovalidate>
            {t("ข้ามไปก่อน", "Skip for now")}
          </button>
        ) : undefined
      }
    >
      <FlowStep
        emoji="🧭"
        title={t("คุณเป็นคนกรุงเทพฯ แบบไหน?", "What's your Bangkok Type?")}
        hint={t(
          "คำตอบช่วยจัดโต๊ะให้เข้ากับคุณ เฉพาะไลฟ์สไตล์ ไม่มีเรื่องการเมือง และเป็นความลับจนกว่าคุณจะเลือกแสดง",
          "Your answers help seat you at the right table. Lifestyle only, nothing political. Your type stays private unless you choose to show it.",
        )}
        cta={t("เริ่มเลย", "Start")}
      >
        <div class="tiles" aria-hidden="true">
          <span class="tile"><b>👆</b>{t(`${props.questions.length} ข้อ แตะเลือก`, `${props.questions.length} quick taps`)}</span>
          <span class="tile"><b>⏱️</b>{t("ราว 3 นาที", "About 3 min")}</span>
          <span class="tile"><b>🔒</b>{t("เป็นความลับ", "Private")}</span>
        </div>
      </FlowStep>
      {props.questions.map((q, i) => (
        <FlowStep title={L(lang, q.prompt)} auto class="q">
          {i === 0 ? <span class="tap-hint">👆 {t("แตะคำตอบ", "Tap an answer")}</span> : null}
          <span class="muted" style="display:block;font-size:.8rem">
            {i + 1} / {props.questions.length}
          </span>
          {q.format === "choice" ? (
            <div class="answers">
              {q.options.map((o, j) => (
                <AnswerCard name={`a${i}`} value={String(j)} label={L(lang, o.label)} badge={j === 0 ? "A" : "B"} />
              ))}
            </div>
          ) : (
            <>
              <div class="scale">
                {[1, 2, 3, 4, 5].map((n) => (
                  <AnswerCard name={`a${i}`} value={String(n)} label={String(n)} />
                ))}
              </div>
              <div class="scale-ends">
                <span>1 · {L(lang, q.minLabel)}</span>
                <span>{L(lang, q.maxLabel)} · 5</span>
              </div>
            </>
          )}
        </FlowStep>
      ))}
    </Flow>
  );
}

export function answersFrom(body: Record<string, unknown>, questions: Question[]): Answers {
  const answers: Answers = {};
  questions.forEach((q, i) => {
    const raw = str(body[`a${i}`]);
    if (raw !== "" && /^\d$/.test(raw)) answers[q.id] = Number(raw);
  });
  return answers;
}

// ---------------------------------------------------------- the result --

function Meter(props: { lang: Lang; vector: Record<string, number> }) {
  const { lang } = props;
  return (
    <ul class="meter">
      {CATEGORIES.map((c) => {
        const val = Math.max(-1, Math.min(1, props.vector[c] ?? 0));
        const s = strengthOf(val);
        const w = Math.max(Math.abs(val) * 50, 3);
        const left = val >= 0 ? 50 : 50 - w;
        const info = POLES[c];
        const leanPlus = val >= 0;
        return (
          <li>
            <div class="ends">
              <span>{s !== "balanced" && !leanPlus ? <b>{L(lang, info.minus.label)}</b> : L(lang, info.minus.label)}</span>
              <span>
                {L(lang, info.name)} · {lang === "en" ? STRENGTH[s][1] : STRENGTH[s][0]}
              </span>
              <span>{s !== "balanced" && leanPlus ? <b>{L(lang, info.plus.label)}</b> : L(lang, info.plus.label)}</span>
            </div>
            <div class="track" role="img" aria-label={`${L(lang, info.name)}: ${s === "balanced" ? (lang === "en" ? "Balanced" : "สมดุล") : L(lang, leanPlus ? info.plus.label : info.minus.label)}`}>
              <i class={s} style={`left:${left.toFixed(1)}%;width:${w.toFixed(1)}%`} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Matches(props: { v: View; archetype: ArchetypeKey }) {
  const { t, lang } = props.v;
  const m = suggestedMatches(props.archetype);
  type Kind = "natural" | "complementary" | "interesting";
  const all: [Kind, ArchetypeKey | null][] = [
    ["natural", m.natural],
    ["complementary", m.complementary],
    ["interesting", m.interesting],
  ];
  const rows = all.filter((r): r is [Kind, ArchetypeKey] => r[1] !== null);
  return (
    <>
      <h2>{t("ใครชวนคุยสนุก", "Fun to chat with")}</h2>
      <p class="muted">{t("แค่ชวนคุยเล่น ไม่ใช่กฎ คุณเจอได้ทุกคน", "Just for fun. You can meet everyone.")}</p>
      <div class="matches">
        {rows.map(([kind, key]) => (
          <a href={`/types/${typeSlug(key)}`}>
            <b aria-hidden="true">{MATCH_LABELS[kind].emoji}</b>
            <span>
              <strong>{L(lang, MATCH_LABELS[kind].name)}</strong>
              <small>
                {ARCHETYPES[key].emoji} {L(lang, ARCHETYPES[key].name)} · {L(lang, MATCH_LABELS[kind].copy)}
              </small>
            </span>
          </a>
        ))}
      </div>
    </>
  );
}

export function VisibilityToggle(props: { v: View; visible: boolean; next: string }) {
  const { t } = props.v;
  return (
    <form method="post" action="/quiz/visibility" class="card inline-toggle">
      <input type="hidden" name="next" value={props.next} />
      <label class="toggle" style="margin:0">
        <input type="checkbox" name="visible" value="1" checked={props.visible} onchange="this.form.requestSubmit?this.form.requestSubmit():this.form.submit()" />
        <span>
          {t("แสดงไทป์ของฉันให้เพื่อนร่วมกลุ่มเห็น", "Show my type to my groupmates")}
          <small>{t("ปิดไว้เป็นค่าเริ่มต้น", "Off by default")}</small>
        </span>
      </label>
      <noscript>
        <button type="submit" class="btn ghost">{t("บันทึก", "Save")}</button>
      </noscript>
    </form>
  );
}

export function ResultView(props: { v: View; row: VibeRow; continueHref: string; continueLabel: string; visibilityNext: string; reveal?: boolean; retake?: boolean }) {
  const { t, lang } = props.v;
  const key = (isArchetype(props.row.archetype) ? props.row.archetype : "allrounder") as ArchetypeKey;
  const a = ARCHETYPES[key];
  return (
    <>
      <div class={`type-hero ${props.reveal ? "reveal" : ""}`}>
        <span class="muted">{t("ไทป์กรุงเทพฯ ของคุณ", "Your Bangkok Type")}</span>
        <span class="type-emoji" aria-hidden="true">{a.emoji}</span>
        <h1>{L(lang, displayName(key, props.row.modifier))}</h1>
        <p>{L(lang, a.tagline)}</p>
      </div>
      <Card>
        <Meter lang={lang} vector={props.row.vector} />
      </Card>
      <Card>
        <p>📍 <strong>{t("กรุงเทพฯ ของคุณ", "Your Bangkok")}:</strong> {L(lang, a.bangkok)}</p>
        <p>💬 <strong>{t("เปิดบทสนทนา", "Conversation starter")}:</strong> {L(lang, a.starter)}</p>
      </Card>
      <Matches v={props.v} archetype={key} />
      <VisibilityToggle v={props.v} visible={props.row.visible} next={props.visibilityNext} />
      <div class="flow-bar">
        <LinkButton href={props.continueHref}>{props.continueLabel}</LinkButton>
        {props.retake ? (
          <LinkButton href="/quiz" kind="ghost">
            {t("ทำใหม่", "Retake")}
          </LinkButton>
        ) : null}
      </div>
    </>
  );
}

// -------------------------------------------------------------- routes --

quizRoutes.use("/quiz", requireUser);
quizRoutes.use("/quiz/*", requireUser);

quizRoutes.get("/quiz", async (c) => {
  const v = view(c);
  const user = v.user!;
  if (!user.profile?.onboardedAt) return c.redirect("/onboarding");
  const row = await loadVibe(c.env, user.account.id);
  const seed = quizSeed(user.account.id, row);
  return page(
    c,
    { title: v.t("ไทป์กรุงเทพฯ", "Bangkok Type"), bare: true },
    <QuizFlow v={v} questions={quizQuestions(seed, row)} seed={seed} next="/quiz/result" close={row ? "/quiz/result" : "/settings"} />,
  );
});

quizRoutes.post("/quiz", async (c) => {
  const v = view(c);
  const user = v.user!;
  const body = await c.req.parseBody();
  const next = str(body.next) === "/onboarding/type" ? "/onboarding/type" : "/quiz/result";
  const row = await loadVibe(c.env, user.account.id);
  const seed = quizSeed(user.account.id, row);
  if (str(body.seed) !== seed) {
    return page(
      c,
      { title: v.t("ไทป์กรุงเทพฯ", "Bangkok Type"), status: 400, bare: true },
      <>
        <Notice kind="error">{v.t("แบบทดสอบนี้หมดอายุแล้ว", "This quiz has expired.")}</Notice>
        <LinkButton href={next === "/onboarding/type" ? "/onboarding/quiz" : "/quiz"}>{v.t("เริ่มใหม่", "Start again")}</LinkButton>
      </>,
    );
  }
  const questions = quizQuestions(seed, row);
  const result = scoreSession(questions, answersFrom(body, questions));
  if (result.answered < MIN_ANSWERED) {
    return page(
      c,
      { title: v.t("ไทป์กรุงเทพฯ", "Bangkok Type"), status: 400, bare: true },
      <QuizFlow
        v={v}
        questions={questions}
        seed={seed}
        next={next}
        close={next === "/quiz/result" ? (row ? "/quiz/result" : "/settings") : undefined}
        skipAction={next === "/onboarding/type" ? "/onboarding/quiz/skip" : undefined}
        stage={next === "/onboarding/type" ? { at: 1, of: 7 } : undefined}
        error={v.t(`ตอบอย่างน้อย ${MIN_ANSWERED} ข้อ`, `Please answer at least ${MIN_ANSWERED} questions.`)}
      />,
    );
  }
  const { archetype, modifier } = typeOf(result.vector);
  const seen = [...new Set([...(row?.seen ?? []), ...questions.map((q) => q.id)])].slice(-SEEN_MAX);
  const values = { vector: result.vector, archetype, modifier, seen, takenAt: new Date() };
  await getDb(c.env)
    .insert(vibes)
    .values({ accountId: user.account.id, ...values })
    .onConflictDoUpdate({ target: vibes.accountId, set: values });
  return c.redirect(`${next}?new=1`);
});

quizRoutes.get("/quiz/result", async (c) => {
  const v = view(c);
  const user = v.user!;
  const row = await loadVibe(c.env, user.account.id);
  if (!row) return c.redirect(user.profile?.onboardedAt ? "/quiz" : "/onboarding");
  const member = !!user.profile?.onboardedAt;
  return page(
    c,
    { title: v.t("ไทป์กรุงเทพฯ ของฉัน", "My Bangkok Type"), tab: "me" },
    <ResultView
      v={v}
      row={row}
      reveal={c.req.query("new") === "1"}
      continueHref={member ? "/settings" : "/onboarding"}
      continueLabel={member ? v.t("เสร็จ", "Done") : v.t("ต่อไป", "Continue")}
      visibilityNext="/quiz/result"
      retake={member}
    />,
  );
});

quizRoutes.post("/quiz/visibility", async (c) => {
  const user = c.var.user!;
  const body = await c.req.parseBody();
  const next = safeNext(str(body.next), "/quiz/result");
  const row = await loadVibe(c.env, user.account.id);
  if (!row) return c.redirect(user.profile?.onboardedAt ? "/quiz" : "/onboarding");
  await getDb(c.env)
    .update(vibes)
    .set({ visible: str(body.visible) === "1" })
    .where(eq(vibes.accountId, user.account.id));
  return c.redirect(`${next}${next.includes("?") ? "&" : "?"}notice=vibe_saved`);
});

// ------------------------------------------------------- public types --

quizRoutes.get("/types", async (c) => {
  const v = view(c);
  const { t, lang, user } = v;
  const mine = user ? (await loadVibe(c.env, user.account.id))?.archetype : undefined;
  return page(
    c,
    { title: t("ไทป์กรุงเทพฯ ทั้ง 13 แบบ", "The 13 Bangkok Types"), tab: "me" },
    <>
      <h1>{t("ไทป์กรุงเทพฯ ทั้ง 13 แบบ", "The 13 Bangkok Types")}</h1>
      <p class="muted">{t("คุณเป็นแบบไหน? ไม่มีแบบไหนดีกว่ากัน", "Which one are you? No type is better.")}</p>
      <div class="type-grid">
        {(Object.keys(ARCHETYPES) as ArchetypeKey[]).map((k) => (
          <a href={`/types/${typeSlug(k)}`} class={k === mine ? "me" : ""}>
            <b aria-hidden="true">{ARCHETYPES[k].emoji}</b>
            <strong>{L(lang, ARCHETYPES[k].name)}</strong>
            <small class="muted">{L(lang, ARCHETYPES[k].tagline)}</small>
          </a>
        ))}
      </div>
      <TypeCta v={v} hasType={!!mine} />
    </>,
  );
});

function TypeCta(props: { v: View; hasType: boolean }) {
  const { t, user } = props.v;
  if (props.hasType) return <div class="flow-bar"><LinkButton href="/quiz/result">{t("ดูไทป์ของฉัน", "See my type")}</LinkButton></div>;
  const href = !user ? "/signup" : user.profile?.onboardedAt ? "/quiz" : "/onboarding";
  return (
    <div class="flow-bar">
      <LinkButton href={href}>{t("ค้นหาไทป์ของฉัน", "Find my type")}</LinkButton>
    </div>
  );
}

quizRoutes.get("/types/:slug", async (c) => {
  const v = view(c);
  const { t, lang, user } = v;
  const key = BY_SLUG.get(c.req.param("slug"));
  if (!key) return c.json({ error: "Not found" }, 404);
  const a = ARCHETYPES[key];
  const mine = user ? (await loadVibe(c.env, user.account.id))?.archetype : undefined;
  return page(
    c,
    { title: L(lang, a.name), tab: "me" },
    <>
      <p>
        <a href="/types">← {t("ทุกไทป์", "All types")}</a>
      </p>
      <div class="type-hero">
        <span class="type-emoji" aria-hidden="true">{a.emoji}</span>
        <h1>{L(lang, a.name)}</h1>
        <p>{L(lang, a.tagline)}</p>
      </div>
      <Card>
        <p>{L(lang, a.description)}</p>
        <p>📍 <strong>{t("กรุงเทพฯ ของไทป์นี้", "Their Bangkok")}:</strong> {L(lang, a.bangkok)}</p>
        <p>💬 <strong>{t("เปิดบทสนทนา", "Conversation starter")}:</strong> {L(lang, a.starter)}</p>
      </Card>
      <Matches v={v} archetype={key} />
      <TypeCta v={v} hasType={!!mine} />
    </>,
  );
});
