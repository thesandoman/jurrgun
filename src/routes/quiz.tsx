/**
 * Bangkok Vibe quiz and Bangkok Types (design/reference/vibe-quiz-v3.md).
 *
 *   GET  /quiz              take / retake (signed in)
 *   POST /quiz              score, save to `vibes`, redirect to the result
 *   GET  /quiz/result       my type
 *   POST /quiz/visibility   show / hide my type to groupmates
 *   GET  /types             public gallery of all 16 types
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
import { QuestionArt, QUESTION_ART_CSS } from "../ui/question-art";
import {
  ARCHETYPES,
  ARCHETYPE_KEYS,
  DEFAULT_TYPE,
  LEGEND,
  MATCH_LABELS,
  codeLetters,
  displayName,
  flavourBadges,
  normalizeType,
  suggestedMatches,
  typeOf,
  type ArchetypeKey,
} from "../vibe/archetypes";
import { generateSession, itemScore, scoreSession, strengthOf, type Answer, type Answers, type Personal, type Question } from "../vibe/generator";

export const quizRoutes = new Hono<AppEnv>();

export type VibeRow = typeof vibes.$inferSelect;

export const PER_CATEGORY = 3;
export const MIN_ANSWERED = 12;
/** Keep the seen-list bounded; the generator only needs recent history. */
const SEEN_MAX = 400;

// ------------------------------------------------------------- helpers --

export async function loadVibe(env: AppEnv["Bindings"], accountId: string): Promise<VibeRow | null> {
  const [row] = await getDb(env).select().from(vibes).where(eq(vibes.accountId, accountId)).limit(1);
  return row ? { ...row, ...normalizeType(row) } : null;
}

/** Server-derived: never read from the client. */
export function quizSeed(accountId: string, row: Pick<VibeRow, "seen"> | null): string {
  return `${accountId}:${row ? row.seen.length : 0}`;
}

/**
 * The member's session: the full v3.1 mix of formats, personalised by their
 * district and interests when known, so even the same seed reads differently
 * for different people.
 */
export function quizQuestions(seed: string, row: Pick<VibeRow, "seen"> | null, personal?: Personal): Question[] {
  return generateSession({ seed, perCategory: PER_CATEGORY, seen: new Set(row?.seen ?? []), formats: "mixed", personal });
}

/** Personalisation from a profile (null before onboarding basics). */
export function personalOf(profile: { district?: string | null; interests?: readonly string[] | null } | null | undefined): Personal | undefined {
  if (!profile) return undefined;
  const interests = Array.isArray(profile.interests) ? profile.interests.filter((x): x is string => typeof x === "string") : [];
  if (!profile.district && interests.length === 0) return undefined;
  return { district: profile.district ?? null, interests };
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

const STRENGTH: Record<string, [string, string]> = {
  strong: ["ชัดเจน", "Strong"],
  leans: ["ค่อนข้าง", "Leans"],
  balanced: ["สมดุล", "Balanced"],
};

// ------------------------------------------------------------ the quiz --

/** Tap formats advance on their own; the rest wait for Next. */
const TAP_FORMATS = new Set(["choice", "bothers", "scale"]);

function FormatHint(props: { v: View; q: Question; first: boolean }) {
  const { t } = props.v;
  const q = props.q;
  if (q.format === "slider") return <span class="tap-hint">↔️ {t("เลื่อนไปยังจุดที่ใช่ แล้วกดต่อไป", "Slide to your spot, then tap Next")}</span>;
  if (q.format === "rank") return <span class="tap-hint">🏅 {t("แตะตามลำดับ จากที่ชอบที่สุด", "Tap in order, favourite first")}</span>;
  if (q.format === "budget") return <span class="tap-hint">🪙 {t(`ใช้ + และ − วางเหรียญให้ครบ ${q.coins} เหรียญ`, `Use + and − to place all ${q.coins} coins`)}</span>;
  return props.first ? <span class="tap-hint">👆 {t("แตะคำตอบ", "Tap an answer")}</span> : null;
}

function SliderField(props: { v: View; q: Extract<Question, { format: "slider" }>; i: number }) {
  const { t, lang } = props.v;
  const [left, right] = props.q.options;
  const id = `q${props.i}-slider`;
  return (
    <div
      class="q-slider"
      data-slider
      data-left={L(lang, left.label)}
      data-right={L(lang, right.label)}
      data-mid={t("ตรงกลางพอดี", "Right in the middle")}
      data-lean={t("ค่อนไปทาง", "Leaning to")}
      data-all={t("สุดทางที่", "All the way to")}
    >
      <div class="q-slider-ends">
        <span>
          <b aria-hidden="true">{left.icon}</b>
          {L(lang, left.label)}
        </span>
        <span>
          {L(lang, right.label)}
          <b aria-hidden="true">{right.icon}</b>
        </span>
      </div>
      <input
        id={id}
        type="range"
        name={`a${props.i}`}
        min="0"
        max="100"
        step="1"
        value="50"
        aria-label={`${L(lang, left.label)} ↔ ${L(lang, right.label)}`}
        aria-valuetext={t("ตรงกลางพอดี", "Right in the middle")}
      />
      <output for={id} class="q-slider-read" aria-live="polite">
        {t("ตรงกลางพอดี", "Right in the middle")}
      </output>
    </div>
  );
}

function RankField(props: { v: View; q: Extract<Question, { format: "rank" }>; i: number }) {
  const { t, lang } = props.v;
  const n = props.q.options.length;
  return (
    <div
      class="q-rank"
      data-rank
      data-start={t("แตะอันที่ชอบที่สุดก่อน", "Tap your favourite first")}
      data-more={t("ต่อไปคืออันดับ {n}", "Now number {n}")}
      data-done={t("ครบแล้ว กดต่อไปได้เลย", "All set. Tap Next")}
    >
      <ol class="q-rank-list">
        {props.q.options.map((o, j) => (
          <li>
            <button type="button" class="q-rank-btn" data-j={String(j)} aria-pressed="false">
              <b class="q-rank-badge" aria-hidden="true" />
              <b class="answer-emoji" aria-hidden="true">
                {o.icon}
              </b>
              <span>{L(lang, o.label)}</span>
            </button>
            <label class="q-rank-pick">
              <b class="answer-emoji" aria-hidden="true">
                {o.icon}
              </b>
              <span>{L(lang, o.label)}</span>
              <select name={`a${props.i}_${j}`} aria-label={t(`อันดับของ: ${L(lang, o.label)}`, `Position for: ${L(lang, o.label)}`)}>
                <option value="">·</option>
                {Array.from({ length: n }, (_, k) => (
                  <option value={String(k + 1)}>{k + 1}</option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ol>
      <div class="q-rank-tools">
        <button type="button" class="btn ghost q-rank-undo" disabled>
          ↶ {t("ย้อนหนึ่งขั้น", "Undo")}
        </button>
        <span class="q-rank-status" aria-live="polite">
          {t(`ใส่เลข 1 ถึง ${n} ไม่ซ้ำกัน (1 คือชอบที่สุด)`, `Number them 1 to ${n}, each once (1 is your favourite)`)}
        </span>
      </div>
    </div>
  );
}

function BudgetField(props: { v: View; q: Extract<Question, { format: "budget" }>; i: number }) {
  const { t, lang } = props.v;
  const coins = props.q.coins;
  return (
    <div
      class="q-budget"
      data-budget
      data-coins={String(coins)}
      data-left={t("เหลืออีก {n} เหรียญ", "{n} coins left")}
      data-over={t("เกินมา {n} เหรียญ", "{n} too many")}
      data-full={t(`ครบ ${coins} เหรียญแล้ว`, `All ${coins} coins placed`)}
    >
      <div class="q-coins" aria-hidden="true">
        {Array.from({ length: coins }, () => (
          <i class="q-coin" />
        ))}
      </div>
      <p class="q-budget-left" aria-live="polite">
        {t(`วางเหรียญให้ครบ ${coins} เหรียญพอดี`, `Place exactly ${coins} coins`)}
      </p>
      <ul class="q-budget-list">
        {props.q.options.map((o, j) => {
          const id = `q${props.i}-c${j}`;
          const label = L(lang, o.label);
          return (
            <li class="q-budget-row">
              <b class="answer-emoji" aria-hidden="true">
                {o.icon}
              </b>
              <label for={id}>{label}</label>
              <span class="q-budget-ctl">
                <button type="button" class="q-budget-btn" data-d="-1" aria-label={t(`ลดหนึ่งเหรียญ: ${label}`, `One coin less: ${label}`)}>
                  −
                </button>
                <input id={id} type="number" name={`a${props.i}_${j}`} min="0" max={String(coins)} step="1" value="0" inputmode="numeric" />
                <button type="button" class="q-budget-btn" data-d="1" aria-label={t(`เพิ่มหนึ่งเหรียญ: ${label}`, `One coin more: ${label}`)}>
                  +
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AnswerField(props: { v: View; q: Question; i: number }) {
  const { lang } = props.v;
  const { q, i } = props;
  switch (q.format) {
    case "choice":
    case "bothers":
      return (
        <div class="answers">
          {q.options.map((o, j) => (
            <AnswerCard name={`a${i}`} value={String(j)} label={L(lang, o.label)} emoji={o.icon} />
          ))}
        </div>
      );
    case "scale":
      return (
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
      );
    case "slider":
      return <SliderField v={props.v} q={q} i={i} />;
    case "rank":
      return <RankField v={props.v} q={q} i={i} />;
    case "budget":
      return <BudgetField v={props.v} q={q} i={i} />;
  }
}

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
  /** Open on this question (0-based), e.g. the one a server-side error refers to. */
  startAt?: number;
}) {
  const { t, lang } = props.v;
  const firstTap = props.questions.findIndex((q) => TAP_FORMATS.has(q.format));
  const n = props.questions.length;
  return (
    <Flow
      v={props.v}
      action="/quiz"
      submit={t("ดูผลลัพธ์", "See my type")}
      hidden={{ seed: props.seed, next: props.next }}
      stage={props.stage}
      close={props.close}
      autoSubmit
      start={props.startAt !== undefined ? props.startAt + 1 : undefined}
      error={props.error ? <Notice kind="error">{props.error}</Notice> : undefined}
      extra={
        props.skipAction ? (
          <button type="submit" class="skip" formaction={props.skipAction} formnovalidate>
            {t("ข้ามไปก่อน", "Skip for now")}
          </button>
        ) : undefined
      }
    >
      <style dangerouslySetInnerHTML={{ __html: QUESTION_ART_CSS }} />
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
          <span class="tile"><b>👆</b>{t(`${n} ข้อ แตะ เลื่อน เรียง`, `${n} questions: tap, slide, rank`)}</span>
          <span class="tile"><b>⏱️</b>{t("ราว 4 นาที", "About 4 min")}</span>
          <span class="tile"><b>🔒</b>{t("เป็นความลับ", "Private")}</span>
        </div>
      </FlowStep>
      {props.questions.map((q, i) => {
        const tap = TAP_FORMATS.has(q.format);
        return (
          <FlowStep
            title={L(lang, q.prompt)}
            auto={tap}
            class={`q q-${q.format}`}
            sum={q.format === "budget" ? q.coins : undefined}
            allOrNone={q.format === "rank"}
            needText={
              q.format === "budget"
                ? t(`วางให้ครบ ${q.coins} เหรียญพอดี หรือไม่วางเลยเพื่อข้าม`, `Place exactly ${q.coins} coins, or none to skip.`)
                : q.format === "rank"
                  ? t("จัดอันดับให้ครบทุกข้อ หรือกดย้อนจนว่างเพื่อข้าม", "Rank all of them, or undo them all to skip.")
                  : undefined
            }
          >
            <QuestionArt art={q.art} lang={lang} />
            <FormatHint v={props.v} q={q} first={i === firstTap} />
            <span class="muted q-count">
              {i + 1} / {n}
            </span>
            <AnswerField v={props.v} q={q} i={i} />
          </FlowStep>
        );
      })}
      <script dangerouslySetInnerHTML={{ __html: QUIZ_WIDGETS_JS }} />
    </Flow>
  );
}

/**
 * Turns the posted form into answers. Each question i posts:
 *   choice / bothers / scale  a{i} = one digit
 *   slider                    a{i} = 0..100
 *   rank                      a{i}_{j} = position (1..n) of option j, or a{i} = "2,0,3,1" (option indices, favourite first)
 *   budget                    a{i}_{j} = coins on option j (blank counts as 0)
 * A question with nothing filled in is just unanswered. Anything filled in but
 * not valid (a half-done ranking, coins not adding up, out-of-range values)
 * goes into `invalid` so the route can answer 400.
 */
export function parseAnswers(body: Record<string, unknown>, questions: Question[]): { answers: Answers; invalid: number[] } {
  const answers: Answers = {};
  const invalid: number[] = [];
  questions.forEach((q, i) => {
    const raw = str(body[`a${i}`]);
    const parts = q.format === "rank" || q.format === "budget" ? q.options.map((_, j) => str(body[`a${i}_${j}`])) : [];
    let answer: Answer | undefined;
    switch (q.format) {
      case "choice":
      case "bothers":
      case "scale":
      case "slider":
        if (raw === "") return;
        if (/^\d{1,3}$/.test(raw)) answer = Number(raw);
        break;
      case "rank":
        if (raw !== "") {
          if (/^\d(,\d){0,9}$/.test(raw)) answer = raw.split(",").map(Number);
        } else {
          if (parts.every((p) => p === "")) return;
          if (parts.every((p) => /^\d{1,2}$/.test(p))) {
            const order: number[] = new Array(parts.length).fill(-1);
            parts.forEach((p, j) => {
              const pos = Number(p) - 1;
              if (pos >= 0 && pos < order.length && order[pos] === -1) order[pos] = j;
            });
            if (!order.includes(-1)) answer = order;
          }
        }
        break;
      case "budget":
        if (parts.every((p) => p === "" || p === "0")) return;
        if (parts.every((p) => p === "" || /^\d{1,2}$/.test(p))) answer = parts.map((p) => (p === "" ? 0 : Number(p)));
        break;
    }
    if (answer !== undefined && itemScore(q, answer) !== null) answers[q.id] = answer;
    else invalid.push(i);
  });
  return { answers, invalid };
}

export function answersFrom(body: Record<string, unknown>, questions: Question[]): Answers {
  return parseAnswers(body, questions).answers;
}

/**
 * Slider live label, rank taps with numbered badges and undo, and coin
 * buttons with a remaining counter. Without JS the same fields work as a plain
 * range, number selects and number inputs.
 */
const QUIZ_WIDGETS_JS = `(function(){
var f=document.currentScript&&document.currentScript.closest("form");if(!f||f.dataset.quizReady)return;f.dataset.quizReady="1";
function each(sel,fn){[].forEach.call(f.querySelectorAll(sel),fn)}
each("[data-slider]",function(w){
  var r=w.querySelector("input[type=range]"),o=w.querySelector("output"),d=w.dataset;
  function upd(){var v=+r.value,txt;if(v>=40&&v<=60)txt=d.mid;else txt=(v<=10||v>=90?d.all:d.lean)+" "+(v<50?d.left:d.right);o.textContent=txt;r.setAttribute("aria-valuetext",txt);w.style.setProperty("--v",v+"%")}
  r.addEventListener("input",upd);upd();
});
each("[data-rank]",function(w){
  var btns=[].slice.call(w.querySelectorAll(".q-rank-btn")),sels=[].slice.call(w.querySelectorAll("select")),undo=w.querySelector(".q-rank-undo"),st=w.querySelector(".q-rank-status"),order=[];
  var pre=sels.map(function(s,j){return [+s.value||0,j]}).filter(function(x){return x[0]>0}).sort(function(a,b){return a[0]-b[0]});
  if(pre.length===sels.length)order=pre.map(function(x){return x[1]});
  function draw(){
    btns.forEach(function(b,j){var k=order.indexOf(j);b.querySelector(".q-rank-badge").textContent=k<0?"":String(k+1);b.setAttribute("aria-pressed",k<0?"false":"true");b.classList.toggle("on",k>=0)});
    sels.forEach(function(s,j){var k=order.indexOf(j);s.value=k<0?"":String(k+1)});
    undo.disabled=!order.length;
    st.textContent=order.length===btns.length?w.dataset.done:(order.length?w.dataset.more.replace("{n}",order.length+1):w.dataset.start);
  }
  btns.forEach(function(b,j){b.addEventListener("click",function(){var k=order.indexOf(j);if(k<0)order.push(j);else order.splice(k,1);draw()})});
  undo.addEventListener("click",function(){order.pop();draw()});
  draw();
});
each("[data-budget]",function(w){
  var max=+w.dataset.coins||10,ins=[].slice.call(w.querySelectorAll("input[type=number]")),left=w.querySelector(".q-budget-left"),coins=[].slice.call(w.querySelectorAll(".q-coin"));
  function val(x){return Math.max(0,Math.floor(+x.value)||0)}
  function draw(){var tot=ins.reduce(function(t,x){return t+val(x)},0),rem=max-tot;
    left.textContent=rem===0?w.dataset.full:(rem>0?w.dataset.left:w.dataset.over).replace("{n}",String(Math.abs(rem)));
    left.classList.toggle("over",rem<0);left.classList.toggle("full",rem===0);
    coins.forEach(function(c,k){c.classList.toggle("spent",k<tot)});
    [].forEach.call(w.querySelectorAll(".q-budget-btn"),function(b){var x=b.parentNode.querySelector("input");b.disabled=b.dataset.d==="1"?rem<=0:val(x)<=0});
  }
  w.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest(".q-budget-btn");if(!b||b.disabled)return;var x=b.parentNode.querySelector("input");x.value=String(Math.max(0,Math.min(max,val(x)+(+b.dataset.d))));draw()});
  w.addEventListener("input",draw);draw();
});
})();`;

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
  const key = (isArchetype(props.row.archetype) ? props.row.archetype : DEFAULT_TYPE) as ArchetypeKey;
  const a = ARCHETYPES[key];
  return (
    <>
      <div class={`type-hero ${props.reveal ? "reveal" : ""}`}>
        <span class="muted">{t("ไทป์กรุงเทพฯ ของคุณ", "Your Bangkok Type")}</span>
        <span class="type-emoji" aria-hidden="true">{a.emoji}</span>
        <h1>{L(lang, displayName(key, props.row.modifier))}</h1>
        <p>{L(lang, a.tagline)}</p>
        <CodeChips lang={lang} archetype={key} modifier={props.row.modifier} />
      </div>
      <Card>
        <p>{L(lang, a.description)}</p>
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
    <QuizFlow v={v} questions={quizQuestions(seed, row, personalOf(user.profile))} seed={seed} next="/quiz/result" close={row ? "/quiz/result" : "/settings"} />,
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
  // The onboarding quiz (onboarding.tsx) is built without personalisation; match it.
  const questions = quizQuestions(seed, row, next === "/onboarding/type" ? undefined : personalOf(user.profile));
  const { answers, invalid } = parseAnswers(body, questions);
  const result = scoreSession(questions, answers);
  if (invalid.length > 0 || result.answered < MIN_ANSWERED) {
    const bad = invalid[0];
    const error =
      bad !== undefined
        ? v.t(
            `ข้อ ${bad + 1} ยังไม่ครบ: การจัดอันดับใช้เลขละครั้ง และเหรียญต้องรวมกันได้พอดี`,
            `Question ${bad + 1} needs another look: rankings use each number once, and coins must add up exactly.`,
          )
        : v.t(`ตอบอย่างน้อย ${MIN_ANSWERED} ข้อ`, `Please answer at least ${MIN_ANSWERED} questions.`);
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
        error={error}
        startAt={bad}
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
          ? "Four letters make your type; two badges add your flavour."
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
    { title: L(lang, a.name), tab: "me" },
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
        <p>📍 <strong>{t("กรุงเทพฯ ของไทป์นี้", "Their Bangkok")}:</strong> {L(lang, a.bangkok)}</p>
        <p>💬 <strong>{t("เปิดบทสนทนา", "Conversation starter")}:</strong> {L(lang, a.starter)}</p>
      </Card>
      <Matches v={v} archetype={key} />
      <Legend lang={lang} highlight={key.split("")} />
      <TypeCta v={v} hasType={!!mine} />
    </>,
  );
});
