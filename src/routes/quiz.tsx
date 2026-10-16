/**
 * Bangkok Vibe quiz and Bangkok Types (design/reference/vibe-quiz-v3.md).
 *
 *   GET  /quiz              take / retake (signed in)
 *   POST /quiz              score, save to `vibes`, redirect to the result
 *   GET  /quiz/result       my type
 *   POST /quiz/visibility   show / hide my type to people at my Tables
 *   GET  /types             public gallery of all 16 types
 *   GET  /types/:slug       public type page (shareable)
 *
 * The seed is derived on the server from the account and how many questions
 * it has already seen, so the client can never choose its questions. The
 * hidden seed field only proves the form is the current one.
 */
import type { AssetPath } from "../assets";
import { FirstTable, firstTable } from "./newcomers";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import type { AppEnv } from "../lib/env";
import { L, type Lang } from "../lib/i18n";
import { requireUser } from "../lib/session";
import { profiles, vibes } from "../schema";
import { cleanBio } from "../content/profile";
import { romanceEligible } from "../domain/rules";
import { segmentOf } from "../domain/segment";
import { styleLines } from "../vibe/styles";
import { Flow, FlowStep, AnswerCard, type Stage } from "../ui/flow";
import { Card, LinkButton, Notice, page, safeNext, str, view, type View } from "../ui/kit";
import { CATEGORIES, motiveSentence, POLES } from "../vibe/content";
import { QuestionArt, QUESTION_ART_CSS } from "../ui/question-art";
import { REFLECTION_CSS, ReflectionSteps } from "../ui/reflections";
import { reflectionsFromForm, type Reflections } from "../content/reflections";
import { syncQuizChange } from "./pulse";
import { NoneData, NoneOfThese, QUIZ_NONE_CSS, QUIZ_NONE_JS } from "../ui/quiz-none";
import {
  ARCHETYPES,
  ARCHETYPE_KEYS,
  DEFAULT_TYPE,
  LEGEND,
  MATCH_LABELS,
  codeLetters,
  CODE_AXES,
  flavourBadges,
  normalizeType,
  suggestedMatches,
  nearestFree,
  typeOf,
  type Archetype,
  type ArchetypeKey,
  type TypeResult,
  resultOf,
} from "../vibe/archetypes";
import { DISTRICTS } from "../lib/constants";
import { AvatarStack, Pill, Tile, artFor } from "../ui/visual";

const districtName = (lang: Lang, key: string) => {
  const d = DISTRICTS.find((x) => x.value === key);
  return d ? (lang === "en" ? d.en : d.th) : key;
};
import { closeLetters, followUpPlan, MAX_FOLLOW_UPS } from "../vibe/adaptive";
import { letterWords, whyOf, type Why } from "../vibe/explain";
import {
  followUpQuestions,
  generateSession,
  generateStyleQuestions,
  isStyleQuestion,
  itemScore,
  scoreSession,
  strengthOf,
  styleOf,
  typeQuestions,
  type AnyQuestion,
  type Answers,
  type Personal,
} from "../vibe/generator";

export const quizRoutes = new Hono<AppEnv>();

export type VibeRow = typeof vibes.$inferSelect;

/**
 * Every type question needs a response, a pick or "None of these" (D26, D30), and at
 * least one real pick. Fewer than ROUGH_START picks still gives a result, shown as a
 * rough start rather than refused.
 */
export const ROUGH_START = 10;
/** Keep the seen-list bounded; the generator only needs recent history. */
const SEEN_MAX = 400;

// ------------------------------------------------------------- helpers --

export async function loadVibe(env: AppEnv["Bindings"], accountId: string): Promise<VibeRow | null> {
  const [row] = await getDb(env).select().from(vibes).where(eq(vibes.accountId, accountId)).limit(1);
  return row ? { ...row, ...normalizeType(row) } : null;
}

/**
 * Server-derived: never read from the client. It carries the month in Bangkok
 * (seasonal scenarios are preferred in season), so a form sent after the month
 * turns is "expired" rather than scored against a different session.
 */
export function quizSeed(accountId: string, row: Pick<VibeRow, "seen"> | null, now = new Date()): string {
  const bkk = new Date(now.getTime() + 7 * 3_600_000);
  const month = `${bkk.getUTCFullYear()}-${String(bkk.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${accountId}:${row ? row.seen.length : 0}:${month}`;
}

/** The month (1 to 12) a seed was made in, or undefined for a seed without one. */
export function seedMonth(seed: string): number | undefined {
  const m = /:\d{4}-(\d{2})$/.exec(seed);
  return m ? Number(m[1]) : undefined;
}

/**
 * The member's session: their segment's 16 curated questions (the same for
 * everyone in it, D26), worded for them, then the style questions their profile
 * calls for (generator.ts). The POST rebuilds it from the same seed (which
 * carries the month) and profile inputs to score it.
 */
export function quizQuestions(seed: string, row: Pick<VibeRow, "seen"> | null, personal?: Personal): AnyQuestion[] {
  const options = { seed, seen: new Set(row?.seen ?? []), personal, month: seedMonth(seed) };
  return [...generateSession(options), ...generateStyleQuestions(options)];
}

type PersonalProfile = {
  district?: string | null;
  languages?: readonly string[] | null;
  interests?: readonly string[] | null;
  newcomer?: boolean;
  bio?: unknown;
  relationship?: string;
  romanceOn?: boolean;
};

/**
 * The profile inputs the quiz uses (null before onboarding basics): home
 * district, segment (D7), 💘 Open to something more (romanceEligible: single
 * and switched on), Table Host (role circle_head), and language (Task 10):
 * members who don't list Thai, or who are here from abroad, get plain-English
 * wording. Thai text never changes, so the UI language itself isn't needed.
 */
export function personalOf(profile: PersonalProfile | null | undefined, role?: string): Personal | undefined {
  if (!profile) return undefined;
  const interests = Array.isArray(profile.interests) ? profile.interests.filter((x): x is string => typeof x === "string") : [];
  const segment = segmentOf({ newcomer: !!profile.newcomer, bio: profile.bio });
  const speaksThai = Array.isArray(profile.languages) && profile.languages.includes("th");
  return {
    district: profile.district || null,
    interests,
    segment,
    explainLocal: segment === "international" || !speaksThai,
    openToMore: romanceEligible({ relationship: profile.relationship ?? "", romanceOn: !!profile.romanceOn }),
    tableHost: role === "circle_head",
  };
}

/** "The Connector" → "connector": readable, shareable URLs. */
export function typeSlug(key: ArchetypeKey): string {
  return ARCHETYPES[key].name.en
    .replace(/^The /, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const BY_SLUG = new Map(ARCHETYPE_KEYS.map((k) => [typeSlug(k), k]));

export function isArchetype(key: string): key is ArchetypeKey {
  return Object.prototype.hasOwnProperty.call(ARCHETYPES, key);
}

// ------------------------------------------------------------ the quiz --

function AnswerField(props: { v: View; q: AnyQuestion; i: number }) {
  const { lang } = props.v;
  return (
    <div class="answers answers-six">
      {props.q.options.map((o, j) => (
        <AnswerCard name={`a${props.i}`} value={String(j)} label={L(lang, o.label)} emoji={o.icon} />
      ))}
    </div>
  );
}

/** The label above a style question, so it's clear it's a short extra and not part of the type. */
function StyleLabel(props: { v: View; q: AnyQuestion }) {
  const { t } = props.v;
  if (!isStyleQuestion(props.q)) return null;
  return props.q.set === "open-to-more" ? (
    <span class="q-set q-set-date">💘 {t("เปิดใจมากกว่าเพื่อน · ไม่มีผลกับไทป์", "Open to something more · doesn't change your type")}</span>
  ) : (
    <span class="q-set">🍽️ {t("เจ้าภาพโต๊ะ · ไม่มีผลกับไทป์", "Table Host · doesn't change your type")}</span>
  );
}

const STYLE_SET_CSS = `.q-set{display:inline-block;font-size:.82rem;border-radius:999px;padding:2px 10px;margin:0 8px 8px 0;background:var(--brand-soft);color:var(--brand)}
.q-extra{display:table;margin:2px 0 10px;font-weight:600}
.q-set-date{background:var(--love-soft);color:var(--love-ink)}`;

/** "How you host", from the Table Host questions, on the host's own result. */
function HostStyle(props: { v: View; bio: unknown }) {
  const { t, lang } = props.v;
  const lines = styleLines("table-host", cleanBio(props.bio).hostStyle, lang);
  if (!lines.length) return null;
  return (
    <Card>
      <h2>🍽️ {t("สไตล์เจ้าภาพโต๊ะของคุณ", "How you host")}</h2>
      <ul>
        {lines.map((x) => (
          <li>
            <span aria-hidden="true">{x.emoji}</span> {x.title}: <b>{x.label}</b>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Onboarding's quiz is step 1 of 4 (quiz, basics, privacy, private settings). */
export const ONBOARDING_QUIZ_STAGE = { at: 0, of: 4 };

export function QuizFlow(props: {
  v: View;
  questions: AnyQuestion[];
  /** Which questions this page asks (indices into `questions`); default all. Q7's follow-ups ask only the last 1 or 2. */
  ask?: number[];
  /** Earlier answers carried as hidden fields (a{i}, a{i}_{j}, "none"), and anything else to post back. */
  carry?: Record<string, string | string[]>;
  seed: string;
  next: string;
  stage?: Stage;
  close?: string;
  /** "Skip for now" target (onboarding only). */
  skipAction?: string;
  error?: string;
  /** Open on this question (0-based), e.g. the one a server-side error refers to. */
  startAt?: number;
  /** "My Bangkok" reflections after the questions (member quiz only, never onboarding), prefilled with these. */
  reflect?: Reflections | null;
  /** Onboarding: the welcome screen already said what the quiz is, so start at question 1. */
  noIntro?: boolean;
  /** "1 of 4" beside the bar (onboarding). */
  count?: { at: number; of: number };
}) {
  const { t, lang } = props.v;
  const ask = props.ask ?? props.questions.map((_, i) => i);
  const followUp = props.ask !== undefined && ask[0] > 0;
  const n = props.questions.length;
  // The intro counts the Bangkok Type questions; the 💘 and Table Host style questions are said separately.
  const typeN = props.questions.filter((q) => !isStyleQuestion(q)).length;
  const inSet = (set: string) => props.questions.filter((q) => isStyleQuestion(q) && q.set === set);
  const dateN = inSet("open-to-more").length;
  const hostN = inSet("table-host").length;
  // About 9 seconds a question, over the real total.
  const minutes = Math.max(2, Math.round((n * 9) / 60));
  // The quiz stage spans its page and up to 2 follow-ups: the bar fills 16 of 18 here and carries on there, never backwards.
  const stage: Stage | undefined = props.stage;
  const mainSteps = followUp ? n - ask.length : ask.length + (props.noIntro || followUp ? 0 : 1);
  const span = props.stage ? { from: followUp ? n - ask.length : 0, total: mainSteps + MAX_FOLLOW_UPS } : undefined;
  return (
    <Flow
      v={props.v}
      action="/quiz"
      submit={t("ดูผลลัพธ์", "See my type")}
      hidden={{ seed: props.seed, next: props.next }}
      stage={stage}
      span={span}
      count={props.count}
      close={props.close}
      autoSubmit
      start={props.startAt !== undefined ? props.startAt + (followUp ? 0 : 1) : undefined}
      error={props.error ? <Notice kind="error">{props.error}</Notice> : undefined}
      extra={
        props.skipAction ? (
          <button type="submit" class="skip" formaction={props.skipAction} formnovalidate>
            {t("ข้ามไปก่อน", "Skip for now")}
          </button>
        ) : undefined
      }
    >
      <style dangerouslySetInnerHTML={{ __html: QUESTION_ART_CSS + STYLE_SET_CSS + QUIZ_NONE_CSS + REFLECTION_CSS }} />
      <NoneData v={props.v} />
      {followUp || props.noIntro ? null : <FlowStep
        emoji="🧭"
        title={t("คุณเป็นไทป์กรุงเทพฯ แบบไหน?", "What's your Bangkok Type?")}
        hint={t(
          `${typeN} สถานการณ์สั้น ๆ ในกรุงเทพฯ ตอบตามความรู้สึกแรก ใช้เวลาราว ${minutes} นาที และมีแค่คุณที่เห็นคำตอบ`,
          `${typeN} quick Bangkok moments. Go with your gut. About ${minutes} minutes, and only you see your answers.`,
        )}
        cta={t("เริ่มเลย", "Start")}
      >
        {dateN ? (
          <p class="q-set q-set-date q-extra">{t(`+ ${dateN} คำถามเรื่องสไตล์การเดต เพราะคุณเปิด 💘 ไว้`, `+ ${dateN} about how you date, because 💘 is on`)}</p>
        ) : null}
        {hostN ? <p class="q-set q-extra">{t(`+ ${hostN} เรื่องสไตล์เจ้าภาพ`, `+ ${hostN} about how you host`)}</p> : null}
        <div class="tiles" aria-hidden="true">
          <span class="tile"><b>👆</b>{t("แตะข้อที่เป็นคุณที่สุด", "Tap what's most you")}</span>
          <span class="tile"><b>🤷</b>{t("ไม่ตรงเลย ก็บอกได้", "Nothing fits? Just say so")}</span>
          <span class="tile"><b>🔒</b>{t("มีแค่คุณที่เห็น", "Only you see it")}</span>
        </div>
      </FlowStep>}
      {ask.map((i, k) => {
        const q = props.questions[i];
        const style = isStyleQuestion(q) ? q.set : null;
        const ofSet = style ? props.questions.filter((x) => isStyleQuestion(x) && x.set === style) : [];
        const inSetAt = ofSet.indexOf(q);
        return (
          <FlowStep title={L(lang, q.prompt)} auto class="q q-choice">
            <QuestionArt art={q.art} lang={lang} />
            <StyleLabel v={props.v} q={q} />
            {i === 0 ? <span class="tap-hint">👆 {t("แตะคำตอบที่ตรงกับคุณที่สุด", "Tap the answer that's most you")}</span> : null}
            {followUp && k === 0 ? (
              <span class="muted q-more">{t("อีกนิดเดียว ให้เราเดาน้อยลง", "A couple more, so we guess less.")}</span>
            ) : null}
            {style && inSetAt === 0 ? (
              <span class="muted q-more">
                {style === "open-to-more" ? t("ต่อด้วยคำถามเรื่องสไตล์การเดตอีกนิด", "Now a few about how you date") : t("ต่อด้วยเรื่องสไตล์เจ้าภาพอีกนิด", "Now a couple about how you host")}
              </span>
            ) : null}
            <span class="muted q-count">
              {followUp ? `${i + 1} / ${n}` : style ? `${style === "open-to-more" ? "💘" : "🍽️"} ${inSetAt + 1} / ${ofSet.length}` : `${i + 1} / ${typeN}`}
            </span>
            <AnswerField v={props.v} q={q} i={i} />
            <NoneOfThese v={props.v} q={q} i={i} />
          </FlowStep>
        );
      })}
      {props.reflect !== undefined && !followUp ? <ReflectionSteps v={props.v} value={props.reflect} /> : null}
      {/* Q7: the first page's answers (and reflections) ride along on the follow-up page. */}
      {Object.entries(props.carry ?? {}).flatMap(([k, val]) => (Array.isArray(val) ? val : [val]).map((x) => <input type="hidden" name={k} value={x} />))}
      {/* After the steps, so the radios it sets up are already parsed. */}
      <script dangerouslySetInnerHTML={{ __html: QUIZ_NONE_JS }} />
    </Flow>
  );
}

/**
 * Turns the posted form into answers: question i posts a{i} = option index.
 * "none" is "None of these are me" (D26, no cap per D29): it casts no vote, so
 * it stays out of `answers` (scoreSession sees it as unanswered) and goes into
 * `none`. A question left blank is just unanswered; anything else that isn't a
 * valid option goes into `invalid` so the route can answer 400.
 */
export function parseAnswers(body: Record<string, unknown>, questions: AnyQuestion[]): { answers: Answers; invalid: number[]; none: number[] } {
  const answers: Answers = {};
  const invalid: number[] = [];
  const none: number[] = [];
  questions.forEach((q, i) => {
    const raw = str(body[`a${i}`]);
    if (raw === "") return;
    if (raw === "none") {
      none.push(i);
      return;
    }
    const answer = /^\d{1,2}$/.test(raw) ? Number(raw) : NaN;
    if (itemScore(q, answer) !== null) answers[q.id] = answer;
    else invalid.push(i);
  });
  return { answers, invalid, none };
}

/** The follow-ups a form says it asked: distinct valid indices, at most MAX_FOLLOW_UPS. */
export function followUpsFrom(raw: string, count: number): number[] {
  const out: number[] = [];
  for (const part of raw.split(",")) {
    const k = /^\d$/.test(part) ? Number(part) : -1;
    if (k >= 0 && k < count && !out.includes(k)) out.push(k);
  }
  return out.slice(0, MAX_FOLLOW_UPS);
}

/** The first page's answers (a{i}, a{i}_{j}, "none") as hidden fields for the follow-up page, plus which follow-ups it asks. */
function carryFrom(body: Record<string, unknown>, first: number, fu: number[]): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = { fu: fu.join(",") };
  for (const [k, val] of Object.entries(body)) {
    const m = /^a(\d+)(?:_\d+)?$/.exec(k);
    // The first page's answers, and its "My Bangkok" reflections (r_*, some sent more than once).
    if (!(m && Number(m[1]) < first) && !k.startsWith("r_")) continue;
    if (typeof val === "string") out[k] = val;
    else if (Array.isArray(val)) out[k] = val.filter((x): x is string => typeof x === "string");
  }
  return out;
}

export function answersFrom(body: Record<string, unknown>, questions: AnyQuestion[]): Answers {
  return parseAnswers(body, questions).answers;
}

// ---------------------------------------------------------- the result --

/**
 * Each letter as a % bar with its margin of error as a band. A letter whose
 * band crosses the middle reads "Not sure yet" instead of a winner.
 */
function Meter(props: { lang: Lang; vector: Record<string, number>; margin?: Partial<Record<string, number>>; unsure?: readonly string[] }) {
  const { lang } = props;
  const en = lang === "en";
  return (
    <ul class="meter">
      {CATEGORIES.map((c) => {
        const val = Math.max(-1, Math.min(1, props.vector[c] ?? 0));
        const m = Math.max(0, Math.min(1, props.margin?.[c] ?? 0));
        const unsure = props.unsure ? props.unsure.includes(c) : strengthOf(val) === "balanced";
        const s = unsure ? "balanced" : strengthOf(val);
        const w = Math.max(Math.abs(val) * 50, 3);
        const left = val >= 0 ? 50 : 50 - w;
        const info = POLES[c];
        const leanPlus = val >= 0;
        const side = L(lang, leanPlus ? info.plus.label : info.minus.label);
        // Words, not percentages (owner, D26): the person sees a lean, never a score.
        const verdict = unsure ? (en ? "Not sure yet" : "ยังไม่ชัด") : s === "strong" ? (en ? `Clearly ${side}` : `${side} ชัดเจน`) : en ? `Leans ${side}` : `ค่อนไปทาง${side}`;
        const bandL = Math.max(0, 50 + (val - m) * 50);
        const bandR = Math.min(100, 50 + (val + m) * 50);
        return (
          <li class={unsure ? "unsure" : ""}>
            <div class="ends">
              <span>{!unsure && !leanPlus ? <b>{L(lang, info.minus.label)}</b> : L(lang, info.minus.label)}</span>
              <span>
                {L(lang, info.name)} · {verdict}
              </span>
              <span>{!unsure && leanPlus ? <b>{L(lang, info.plus.label)}</b> : L(lang, info.plus.label)}</span>
            </div>
            <div class="track" role="img" aria-label={`${L(lang, info.name)}: ${verdict}`}>
              {m > 0 ? <em class="band" style={`left:${bandL.toFixed(1)}%;width:${(bandR - bandL).toFixed(1)}%`} /> : null}
              <i class={s} style={`left:${left.toFixed(1)}%;width:${w.toFixed(1)}%`} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** How sure the result is: unsure letters and twin-question consistency. */
function Certainty(props: { v: View; res: TypeResult & { range: ArchetypeKey[] } }) {
  const { t, lang } = props.v;
  const { unsure, consistency, answered } = props.res;
  const letters = unsure.filter((c) => CODE_AXES.some((a) => a.category === c));
  return (
    <>
      {answered !== undefined && answered < ROUGH_START ? (
        <p class="muted">
          🌱{" "}
          {t(
            "ตอนนี้เป็นแค่ภาพร่างแรก เพราะหลายข้อไม่มีคำตอบที่ตรงกับคุณ ลองทำใหม่ได้ทุกเมื่อ",
            "This is a rough start: many questions had nothing that fit you. Retake it whenever you like.",
          )}
        </p>
      ) : null}
      <p class="muted">
        {letters.length === 0
          ? t("ทุกตัวอักษรชัดเจน พ้นค่าความคลาดเคลื่อนทั้งหมด", "Every letter is clear beyond the margin of error.")
          : t(
              `${letters.map((c) => L(lang, POLES[c].name)).join(", ")} ยังก้ำกึ่ง อยู่ในค่าความคลาดเคลื่อน คนเรามีหลายมุม ผลจึงแสดงไทป์ที่ใกล้เคียงไว้ด้วย`,
              `${letters.map((c) => L(lang, POLES[c].name)).join(", ")} ${letters.length === 1 ? "is" : "are"} within the margin of error. People have more than one side, so we show the types you're between.`,
            )}
      </p>
      {consistency !== null ? (
        <p class="muted">
          🔁{" "}
          {consistency >= 0.75
            ? t("คำถามที่ถามซ้ำด้วยคำต่างกัน คุณตอบไปทางเดียวกัน", "Questions asked twice in different words: you answered them the same way.")
            : t("คำถามที่ถามซ้ำด้วยคำต่างกัน คุณตอบต่างกันบ้าง คุณอาจอยู่ระหว่างสองแบบ", "Questions asked twice in different words: you answered them a little differently, so you may sit between two types.")}
        </p>
      ) : null}
    </>
  );
}

/** Types you might meet at a table, and what each brings the other (D31: no compatibility language). */
function Clicks(props: { v: View; a: Archetype }) {
  const { t, lang } = props.v;
  return (
    <Card>
      <h2>🤝 {t("ไทป์ที่คุณอาจได้เจอที่โต๊ะ", "Types you might meet at a table")}</h2>
      <div class="type-row">
        {props.a.clicks.map((x) => (
          <a href={`/types/${typeSlug(x.key)}`} class="type-pick" title={L(lang, x.why)}>
            <AvatarStack items={[{ label: L(lang, ARCHETYPES[x.key].name), emoji: ARCHETYPES[x.key].emoji, seed: x.key }]} size={56} />
            <small>{L(lang, ARCHETYPES[x.key].name).replace(/^The /, "")}</small>
          </a>
        ))}
      </div>
      <details class="how">
        <summary>{t("เจอกันแล้วได้อะไร", "What you'd bring each other")}</summary>
        <ul>
          {props.a.clicks.map((x) => (
            <li>
              {ARCHETYPES[x.key].emoji} {L(lang, x.why)}
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

function Matches(props: { v: View; archetype: ArchetypeKey; /** Types already on the page (Your blend): not shown again. */ shown?: ArchetypeKey[] }) {
  const { t, lang } = props.v;
  const m = suggestedMatches(props.archetype);
  type Kind = "natural" | "complementary" | "interesting";
  const all: [Kind, ArchetypeKey | null][] = [
    ["natural", m.natural],
    ["complementary", m.complementary],
    ["interesting", m.interesting],
  ];
  const taken = new Set<string>(props.shown ?? []);
  const rows: [Kind, ArchetypeKey][] = [];
  for (const [kind, key] of all) {
    if (!key) continue;
    if (!taken.has(key)) {
      rows.push([kind, key]);
      taken.add(key);
      continue;
    }
    // Your own type is already "Closest right now"; any other repeat gives way to the nearest type not shown yet.
    if (kind === "natural") continue;
    const alt = nearestFree(key, taken);
    if (alt) {
      rows.push([kind, alt]);
      taken.add(alt);
    }
  }
  return (
    <>
      <h2>{t("ไทป์อื่นที่น่ารู้จัก", "More types worth meeting")}</h2>
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

/**
 * What was picked on each type question (the 16 and any follow-ups): the
 * scenario and the chosen answer's type code, or "none". Kept with the result
 * so staff can see, in totals of 10 or more only, which questions work
 * (/admin/quiz-health). Style answers (how you date or host) are never kept here.
 */
export function picksOf(questions: AnyQuestion[], answers: Answers, none: number[]): [string, string][] {
  const out: [string, string][] = [];
  questions.forEach((q, i) => {
    if (isStyleQuestion(q)) return;
    const a = answers[q.id];
    if (none.includes(i)) out.push([q.scenario, "none"]);
    else if (typeof a === "number" && q.options[a]) out.push([q.scenario, q.options[a].type]);
  });
  return out;
}

/** "Does this feel like you?" answers, kept with the result and only ever counted in totals. */
export const FEELS = ["yes", "partly", "no"] as const;
export type Feel = (typeof FEELS)[number];

/**
 * One tap after the result: the only real check on accuracy (the simulations
 * only test simulated people). Stored with the result (blend.feel), cleared by a
 * retake, and only ever read as totals of 10 or more (skill
 * jurrgun-quiz-measurement). Nothing changes on the page except the choice.
 */
function FeelsLikeYou(props: { v: View; feel?: Feel; next: string }) {
  const { t } = props.v;
  const labels: Record<Feel, string> = {
    yes: t("ใช่ เป็นเราเลย", "Yes, that's me"),
    partly: t("ใช่บางส่วน", "Partly"),
    no: t("ไม่ค่อยใช่", "Not really"),
  };
  return (
    <form method="post" action="/quiz/feel" class="card feels-like" id="feel" aria-labelledby="feel-q">
      <input type="hidden" name="next" value={props.next} />
      <p id="feel-q" style="margin:0 0 8px;font-weight:700">{t("ผลนี้รู้สึกเหมือนตัวคุณไหม?", "Does this feel like you?")}</p>
      <div class="row" role="group" aria-labelledby="feel-q">
        {FEELS.map((f) => (
          <button type="submit" name="feel" value={f} class={`btn ${props.feel === f ? "primary" : "ghost"}`} aria-pressed={props.feel === f ? "true" : "false"}>
            {labels[f]}
          </button>
        ))}
      </div>
      <small class="muted">{props.feel ? t("ขอบคุณ คำตอบนี้ช่วยให้แบบทดสอบดีขึ้น", "Thanks. This helps us make the quiz better.") : t("ไม่มีใครเห็นคำตอบของคุณ เรานับแค่ผลรวม", "Nobody sees your answer; we only count totals.")}</small>
    </form>
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
          {t("แสดงไทป์ของฉันให้คนที่โต๊ะเห็น", "Show my type to people at my Tables")}
          <small>{t("เฉพาะคนในโต๊ะประจำของคุณที่เห็น", "Only people at your Tables see it")}</small>
        </span>
      </label>
      <noscript>
        <button type="submit" class="btn ghost">{t("บันทึก", "Save")}</button>
      </noscript>
    </form>
  );
}

/** The type, its wing and a third, as three tiles with big percentages. */
function Blend(props: { v: View; blend: TypeResult["types"] }) {
  const { t, lang } = props.v;
  const roles = [t("ตอนนี้ใกล้สุด", "Closest right now"), t("ใกล้เคียงรองลงมา", "A close second"), t("อีกด้านของคุณ", "Also in you")];
  return (
    <>
      <h2>🧬 {t("ส่วนผสมของคุณ", "Your blend")}</h2>
      <div class="bento blend3">
        {props.blend.map((b, i) => (
          <Tile href={`/types/${typeSlug(b.key)}`} tone={i === 0 ? "brand" : "plain"}>
            <AvatarStack items={[{ label: L(lang, ARCHETYPES[b.key].name), emoji: ARCHETYPES[b.key].emoji, seed: b.key }]} size={44} />
            {/* No percentages: a blend, not a score (owner, D26). */}
            <b class="blend-role">{roles[i]}</b>
            <small>{L(lang, ARCHETYPES[b.key].name).replace(/^The /, "")}</small>
          </Tile>
        ))}
      </div>
    </>
  );
}

/** "Why you got this": two of the person's own picks and the letters they share with the type. No numbers. */
function WhyYou(props: { v: View; archetype: ArchetypeKey; why?: Why }) {
  const { t, lang } = props.v;
  const why = props.why;
  if (!why || why.picks.length === 0) return null;
  const quotes = why.picks.map((p) => `“${L(lang, p)}”`);
  const name = L(lang, ARCHETYPES[props.archetype].name);
  const words = L(lang, letterWords(why.letters));
  return (
    <section class="card why-you" aria-label={t("ทำไมได้ไทป์นี้", "Why you got this")}>
      <h2>🔎 {t("ทำไมคุณได้ไทป์นี้", "Why you got this")}</h2>
      <p>{t(`คุณเลือก ${quotes.join(" และ ")}`, `You picked ${quotes.join(" and ")}.`)}</p>
      {why.letters.length > 0 ? (
        <p class="muted">{t(`นี่แหละสาย${words} แบบ${name}`, `That's ${words}, like ${name.replace(/^The /, "a ")}.`)}</p>
      ) : null}
    </section>
  );
}

/** What drives and drains a type, and when it shines: three tiles. */
function TypeFacts(props: { v: View; a: Archetype }) {
  const { t, lang } = props.v;
  const a = props.a;
  const facts: [string, string, { en: string; th: string }][] = [
    ["🎯", t("อะไรทำให้คุณมีไฟ", "What drives you"), a.drive],
    ["🪫", t("อะไรทำให้คุณหมดแรง", "What drains you"), a.drain],
    ["🕰️", t("ช่วงเวลาที่ใช่", "Best time"), a.bestTime],
  ];
  return (
    <div class="facts3">
      {facts.map(([icon, label, text]) => (
        <div class="fact">
          <b aria-hidden="true">{icon}</b>
          <small>{label}</small>
          <span>{L(lang, text)}</span>
        </div>
      ))}
    </div>
  );
}

/** The type's places as swipeable postcards: classic spots, then hangouts. */
function TypeSpots(props: { v: View; a: Archetype; mine?: boolean }) {
  const { t, lang } = props.v;
  const a = props.a;
  return (
    <>
      <h2>📍 {props.mine ? t("กรุงเทพฯ ของคุณ", "Your Bangkok") : t(`จะเจอ${L(lang, a.name)}ได้ที่ไหน`, `Where to find ${L(lang, a.name)}`)}</h2>
      <div class="rail2">
        {a.spots.map((sp) => (
          <div class="place-card">
            <QuestionArt art={artFor(sp.name.en, sp.emoji, sp.area)} lang={lang} />
            <div>
              <strong>{L(lang, sp.name)}</strong>
              <small>{L(lang, sp.why)}</small>
            </div>
          </div>
        ))}
      </div>
      <h3>🏙️ {t("ที่เที่ยวและย่านที่ใช่", "Places and areas")}</h3>
      <div class="rail2">
        {a.hangouts.map((h) => (
          <div class="place-card">
            <QuestionArt art={artFor(h.name.en, h.emoji, { en: districtName("en", h.district), th: districtName("th", h.district) })} lang={lang} />
            <div>
              <strong>{L(lang, h.name)}</strong>
              <small>{L(lang, h.why)}</small>
            </div>
          </div>
        ))}
      </div>
      <p class="chips2">
        <span>💬 {L(lang, a.starter)}</span>
      </p>
    </>
  );
}

export function ResultView(props: { v: View; row: VibeRow; continueHref: string; continueLabel: string; visibilityNext: string; reveal?: boolean; retake?: boolean }) {
  const { t, lang } = props.v;
  const key = (isArchetype(props.row.archetype) ? props.row.archetype : DEFAULT_TYPE) as ArchetypeKey;
  const a = ARCHETYPES[key];
  const res = resultOf({ archetype: key, vector: props.row.vector, blend: props.row.blend });
  // Only genuinely close letters read as "not sure yet" or bring near types into the headline (owner, 10-15).
  const close = closeLetters(props.row.vector, res.unsure);
  const others = close.length > 0 ? res.range.filter((k) => k !== key) : [];
  return (
    <>
      <div class={`stack-card type-hero2 ${props.reveal ? "reveal" : ""}`}>
        <Tile tone="brand" art={{ tone: "evening", icons: [], seed: 3 }} lang={lang}>
          <Pill dot>{t("ตอนนี้คุณดูจะชอบกรุงเทพฯ แบบนี้", "How you seem to enjoy Bangkok right now")}</Pill>
          <span class="type-emoji" aria-hidden="true">{a.emoji}</span>
          <h1>{L(lang, a.name)}</h1>
          <small>{L(lang, a.tagline)}</small>
          <small class="starting-point">
            {t("เป็นจุดเริ่มต้น ไม่ใช่ป้ายติดตัว คนเราเปลี่ยนได้ ทำใหม่เมื่อไหร่ก็ได้", "A starting point, not a label. People change; retake it any time.")}
          </small>
          {others.length > 0 ? (
            <span class="type-range">
              {t("ใกล้เคียง", "Close to")}{" "}
              {others.map((k, i) => (
                <>
                  {i > 0 ? " · " : null}
                  <a href={`/types/${typeSlug(k)}`}>
                    {ARCHETYPES[k].emoji} {L(lang, ARCHETYPES[k].name)}
                  </a>
                </>
              ))}
            </span>
          ) : null}
        </Tile>
      </div>
      <CodeChips lang={lang} archetype={key} modifier={props.row.modifier} />
      {res.moves ? <p class="type-moves">{L(lang, motiveSentence(res.moves.motive, res.moves.place))}</p> : null}
      <WhyYou v={props.v} archetype={key} why={(props.row.blend as { why?: Why } | null)?.why} />
      <FeelsLikeYou v={props.v} feel={(props.row.blend as { feel?: Feel } | null)?.feel} next={props.visibilityNext} />
      <TypeFacts v={props.v} a={a} />
      <details class="how">
        <summary>{t("เกี่ยวกับไทป์นี้", "About this type")}</summary>
        <p style="margin:8px 0 0">{L(lang, a.description)}</p>
      </details>
      <Blend v={props.v} blend={res.types} />
      <TypeSpots v={props.v} a={a} mine />
      <Clicks v={props.v} a={a} />
      <details class="how card">
        <summary>🎯 {t("ผลแม่นแค่ไหน และตัวอักษรของคุณ", "How sure we are, and your letters")}</summary>
        <Certainty v={props.v} res={{ ...res, unsure: close }} />
        <Meter lang={lang} vector={props.row.vector} margin={res.margin} unsure={res.margin ? close : undefined} />
      </details>
      <Matches v={props.v} archetype={key} shown={res.types.map((x) => x.key)} />
      <ShareType v={props.v} archetype={key} />
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

/**
 * Share my type: the public type page, whose link preview is that type's card
 * (design/assets/og/types). Uses the phone's share sheet when there is one,
 * else LINE and copy. Shares the type only, never anything about me.
 */
function ShareType(props: { v: View; archetype: ArchetypeKey }) {
  const { t, lang } = props.v;
  const a = ARCHETYPES[props.archetype];
  const path = `/types/${typeSlug(props.archetype)}`;
  const text = t(`ฉันเป็น ${a.name.th} ${a.emoji} แล้วคุณล่ะ เป็นไทป์กรุงเทพฯ แบบไหน?`, `I'm ${a.name.en} ${a.emoji}. What's your Bangkok Type?`);
  return (
    <section class="card share-type" aria-label={t("แชร์ไทป์ของคุณ", "Share your type")}>
      <h2>📣 {t("แชร์ไทป์ของคุณ", "Share your type")}</h2>
      <p class="muted">{t("ชวนเพื่อนมาลองทำ แชร์แค่ไทป์ ไม่มีข้อมูลส่วนตัว", "Get friends to try it. Only your type is shared, nothing personal.")}</p>
      <div class="row">
        <button type="button" class="btn primary" data-share={path} data-text={text}>
          {t("แชร์", "Share")}
        </button>
        <a class="btn ghost" data-line={path} href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(path)}`} target="_blank" rel="noopener noreferrer">
          LINE
        </a>
        <button type="button" class="btn ghost" data-copy={path}>
          {t("คัดลอกลิงก์", "Copy link")}
        </button>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){var s=document.currentScript.parentNode,abs=function(p){return location.origin+p};
var sh=s.querySelector("[data-share]"),ln=s.querySelector("[data-line]"),cp=s.querySelector("[data-copy]");
ln.href="https://social-plugins.line.me/lineit/share?url="+encodeURIComponent(abs(ln.dataset.line));
if(!navigator.share)sh.hidden=true;
sh.addEventListener("click",function(){navigator.share({title:"Jurrgun",text:sh.dataset.text,url:abs(sh.dataset.share)}).catch(function(){})});
cp.addEventListener("click",function(){navigator.clipboard&&navigator.clipboard.writeText(abs(cp.dataset.copy)).then(function(){cp.textContent=${JSON.stringify(lang === "en" ? "Copied ✓" : "คัดลอกแล้ว ✓")}})})})();`,
        }}
      />
    </section>
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
    <QuizFlow
      v={v}
      questions={quizQuestions(seed, row, personalOf(user.profile, user.account.role))}
      seed={seed}
      next="/quiz/result"
      close={row ? "/quiz/result" : "/settings"}
      reflect={cleanBio(user.profile.bio).reflections ?? null}
    />,
  );
});

quizRoutes.post("/quiz", async (c) => {
  const v = view(c);
  const user = v.user!;
  // all: the reflections post some fields more than once (checkboxes).
  const body = await c.req.parseBody({ all: true });
  const next = str(body.next) === "/onboarding/type" ? "/onboarding/type" : "/quiz/result";
  // Reflections come only from the member quiz (onboarding has no profile to keep them in yet).
  const member = next === "/quiz/result" && !!user.profile;
  const reflections = member ? reflectionsFromForm(body) : undefined;
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
  // The onboarding quiz (onboarding.tsx) is built without profile inputs, only plain English for English readers; match it.
  const personal = next === "/onboarding/type" ? (v.lang === "en" ? { explainLocal: true } : undefined) : personalOf(user.profile, user.account.role);
  const base = quizQuestions(seed, row, personal);
  // Q7: the follow-ups this form asked, if any (fu = their indices in the member's curated follow-ups).
  const followUps = followUpQuestions(personal);
  const fu = followUpsFrom(str(body.fu), followUps.length);
  const questions: AnyQuestion[] = [...base, ...fu.map((k) => followUps[k])];
  const { answers, invalid, none } = parseAnswers(body, questions);
  // Only the type questions score (the 16 and any follow-ups): style answers never move the type.
  const result = scoreSession(typeQuestions(questions), answers);
  // Every type question needs a response; "None of these" is one, it just isn't a vote.
  const typeIdx = typeQuestions(questions).map((q) => questions.indexOf(q));
  const missing = typeIdx.filter((i) => !(questions[i].id in answers) && !none.includes(i));
  if (invalid.length > 0 || missing.length > 0 || result.answered < 1) {
    const bad = invalid[0] ?? missing[0];
    const error =
      invalid.length > 0
        ? v.t(
            `ข้อ ${bad + 1} ต้องเลือกจากคำตอบที่มีให้ ลองดูอีกครั้ง`,
            `Question ${bad + 1} needs another look: please pick one of the answers.`,
          )
        : missing.length > 0
          ? v.t(
              `ข้อ ${bad + 1} ยังไม่ได้ตอบ เลือกคำตอบหรือ "ไม่มีข้อไหนเป็นฉัน" ได้เลย`,
              `Question ${bad + 1} still needs an answer: pick one, or "None of these are me".`,
            )
          : v.t("เลือกคำตอบที่ใกล้ตัวคุณที่สุดอย่างน้อยหนึ่งข้อ", "Pick the closest answer on at least one question.");
    // On the follow-up page, show only the follow-ups again; the 16 ride along as they were.
    const onFollowUps = fu.length > 0 && bad >= base.length;
    return page(
      c,
      { title: v.t("ไทป์กรุงเทพฯ", "Bangkok Type"), status: 400, bare: true },
      <QuizFlow
        v={v}
        questions={questions}
        ask={onFollowUps ? fu.map((_, k) => base.length + k) : undefined}
        carry={onFollowUps ? carryFrom(body, base.length, fu) : undefined}
        seed={seed}
        next={next}
        close={next === "/quiz/result" ? (row ? "/quiz/result" : "/settings") : undefined}
        skipAction={next === "/onboarding/type" ? "/onboarding/quiz/skip" : undefined}
        stage={next === "/onboarding/type" ? ONBOARDING_QUIZ_STAGE : undefined}
          count={next === "/onboarding/type" ? { at: 1, of: 4 } : undefined}
          noIntro={next === "/onboarding/type"}
        error={error}
        startAt={onFollowUps ? bad - base.length : bad}
        reflect={member ? (reflections ?? null) : undefined}
      />,
    );
  }
  // Q7: a letter still unsure after the 16? Ask 1 or 2 curated follow-ups first (18 at most).
  if (fu.length === 0) {
    const plan = followUpPlan(typeQuestions(base), answers, followUps);
    if (plan.length > 0) {
      const withFollowUps: AnyQuestion[] = [...base, ...plan.map((k) => followUps[k])];
      return page(
        c,
        { title: v.t("ไทป์กรุงเทพฯ", "Bangkok Type"), bare: true },
        <QuizFlow
          v={v}
          questions={withFollowUps}
          ask={plan.map((_, k) => base.length + k)}
          carry={carryFrom(body, base.length, plan)}
          seed={seed}
          next={next}
          close={next === "/quiz/result" ? (row ? "/quiz/result" : "/settings") : undefined}
          stage={next === "/onboarding/type" ? ONBOARDING_QUIZ_STAGE : undefined}
          count={next === "/onboarding/type" ? { at: 1, of: 4 } : undefined}
          noIntro={next === "/onboarding/type"}
        />,
      );
    }
  }
  const { archetype, modifier, blend: types } = typeOf(result.vector, result.affinity, result.unsure);
  // A retake keeps only the last type (owner card 10-16), so staff can count how many
  // get the same type again (Quiz health, totals of 10+). Never a full history.
  const prev = row ? { archetype: row.archetype, unsure: row.blend?.unsure ?? [], at: row.takenAt.toISOString() } : undefined;
  const blend: TypeResult & { why: Why; picks: [string, string][]; prev?: typeof prev } = {
    types,
    unsure: result.unsure,
    consistency: result.consistency,
    margin: result.margin,
    answered: result.answered,
    why: whyOf(typeQuestions(questions), answers, archetype),
    picks: picksOf(questions, answers, none),
    ...(prev ? { prev } : {}),
    ...(result.moves ? { moves: result.moves } : {}),
  };
  const seen = [...new Set([...(row?.seen ?? []), ...questions.map((q) => q.id)])].slice(-SEEN_MAX);
  const values = { vector: result.vector, archetype, modifier, blend, seen, takenAt: new Date() };
  const db = getDb(c.env);
  await db
    .insert(vibes)
    .values({ accountId: user.account.id, ...values })
    .onConflictDoUpdate({ target: vibes.accountId, set: values });
  // Style cards go on the profile, merged with earlier answers. "How you date" is
  // romance data, so it lives in the bio and is cleared with romance mode (withoutDating).
  const dateStyle = personal?.openToMore ? styleOf(questions, answers, "open-to-more") : {};
  const hostStyle = personal?.tableHost ? styleOf(questions, answers, "table-host") : {};
  // The reflections were prefilled, so what comes back is the whole answer: it replaces the last one (all blank clears it).
  if (user.profile && (member || Object.keys(dateStyle).length || Object.keys(hostStyle).length)) {
    const { reflections: _old, ...bio } = cleanBio(user.profile.bio);
    const kept = member ? {} : _old ? { reflections: _old } : {};
    await db
      .update(profiles)
      .set({
        bio: {
          ...bio,
          ...kept,
          ...(member && reflections ? { reflections } : {}),
          ...(Object.keys(dateStyle).length ? { dateStyle: { ...bio.dateStyle, ...dateStyle } } : {}),
          ...(Object.keys(hostStyle).length ? { hostStyle: { ...bio.hostStyle, ...hostStyle } } : {}),
        },
        updatedAt: new Date(),
      })
      .where(eq(profiles.accountId, user.account.id));
  }
  if (member) await syncQuizChange(c, reflections?.change);
  return c.redirect(`${next}?new=1`);
});

quizRoutes.get("/quiz/result", async (c) => {
  const v = view(c);
  const user = v.user!;
  const row = await loadVibe(c.env, user.account.id);
  if (!row) return c.redirect(user.profile?.onboardedAt ? "/quiz" : "/onboarding");
  const member = !!user.profile?.onboardedAt;
  const pick = member ? await firstTable(c.env, user.profile!) : null;
  return page(
    c,
    { title: v.t("ไทป์กรุงเทพฯ ของฉัน", "My Bangkok Type"), tab: "me" },
    <>
    {pick ? <FirstTable v={v} pick={pick} /> : null}
    <ResultView
      v={v}
      row={row}
      reveal={c.req.query("new") === "1"}
      continueHref={member ? "/settings" : "/onboarding"}
      continueLabel={member ? v.t("เสร็จ", "Done") : v.t("ต่อไป", "Continue")}
      visibilityNext="/quiz/result"
      retake={member}
    />
    {user.account.role === "circle_head" && user.profile ? <HostStyle v={v} bio={user.profile.bio} /> : null}
    </>,
  );
});

quizRoutes.post("/quiz/feel", async (c) => {
  const user = c.var.user!;
  const body = await c.req.parseBody();
  const next = safeNext(str(body.next), "/quiz/result");
  const feel = str(body.feel) as Feel;
  const row = await loadVibe(c.env, user.account.id);
  if (!row) return c.redirect(user.profile?.onboardedAt ? "/quiz" : "/onboarding");
  if (!FEELS.includes(feel)) return c.redirect(`${next}#feel`);
  await getDb(c.env)
    .update(vibes)
    .set({ blend: { ...(row.blend ?? { types: [], unsure: [], consistency: null }), feel } as typeof row.blend })
    .where(eq(vibes.accountId, user.account.id));
  return c.redirect(`${next}#feel`);
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
    { title: t("ไทป์กรุงเทพฯ ทั้ง 16 แบบ", "The 16 Bangkok Types"), tab: "me" },
    <>
      <h1>{t("ไทป์กรุงเทพฯ ทั้ง 16 แบบ", "The 16 Bangkok Types")}</h1>
      <p class="muted">{t("คุณเป็นแบบไหน? ไม่มีแบบไหนดีกว่ากัน", "Which one are you? No type is better.")}</p>
      <div class="type-grid">
        {ARCHETYPE_KEYS.map((k) => (
          <a href={`/types/${typeSlug(k)}`} class={k === mine ? "me" : ""}>
            <b aria-hidden="true">{ARCHETYPES[k].emoji}</b>
            <strong>{L(lang, ARCHETYPES[k].name)}</strong>
            <code class="type-code">{k}</code>
            <small class="muted">{L(lang, ARCHETYPES[k].tagline)}</small>
          </a>
        ))}
      </div>
      <Legend lang={lang} />
      <TypeCta v={v} hasType={!!mine} />
    </>,
  );
});

/** What each letter and badge means. Used on type pages and in Learn. */
export function Legend(props: { lang: Lang; highlight?: string[] }) {
  const { lang } = props;
  const on = new Set(props.highlight ?? []);
  return (
    <section class="legend" aria-label={lang === "en" ? "Legend" : "คำอธิบายสัญลักษณ์"}>
      <h2>{lang === "en" ? "Legend" : "คำอธิบายสัญลักษณ์"}</h2>
      <p class="muted">
        {lang === "en"
          ? "Four letters make your type; two icons add your flavour."
          : "ตัวอักษร 4 ตัวคือไทป์ของคุณ และสัญลักษณ์ 2 แบบบอกสไตล์เพิ่มเติม"}
      </p>
      <ul>
        {LEGEND.map((l) => (
          <li class={on.has(l.key) ? "on" : ""}>
            <b aria-hidden="true">{l.icon}</b>
            <span>
              <strong>{l.key.length === 1 ? `${l.key} · ` : ""}{L(lang, l.name)}</strong>
              <small>{L(lang, l.meaning)}</small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The four letters of a code, each with its icon. */
export function CodeChips(props: { lang: Lang; archetype: ArchetypeKey; modifier?: string | null }) {
  const { lang } = props;
  return (
    <div class="code-chips">
      {codeLetters(props.archetype).map((l) => (
        <span title={L(lang, l.meaning)}>
          <b aria-hidden="true">{l.icon}</b>
          {l.key}
        </span>
      ))}
      {flavourBadges(props.modifier ?? null).map((b) => (
        <span class="flavour">
          <b aria-hidden="true">{b.icon}</b>
          {L(lang, b.name)}
        </span>
      ))}
    </div>
  );
}

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
    {
      title: L(lang, a.name),
      tab: "me",
      share: {
        image: `og/types/${typeSlug(key)}.jpg` as AssetPath,
        title: `${a.emoji} ${a.name.th} · ${a.name.en} | Jurrgun`,
        description: `${a.tagline.th} · ${a.tagline.en} คุณเป็นไทป์ไหน? What's your Bangkok Type?`,
      },
    },
    <>
      <p>
        <a href="/types">← {t("ทุกไทป์", "All types")}</a>
      </p>
      <div class="type-hero">
        <span class="type-emoji" aria-hidden="true">{a.emoji}</span>
        <h1>{L(lang, a.name)}</h1>
        <p>{L(lang, a.tagline)}</p>
        <CodeChips lang={lang} archetype={key} />
      </div>
      <Card>
        <p>{L(lang, a.description)}</p>
        <TypeFacts v={v} a={a} />
      </Card>
      <TypeSpots v={v} a={a} />
      <Clicks v={v} a={a} />
      <Matches v={v} archetype={key} />
      <Legend lang={lang} highlight={key.split("")} />
      <TypeCta v={v} hasType={!!mine} />
    </>,
  );
});
