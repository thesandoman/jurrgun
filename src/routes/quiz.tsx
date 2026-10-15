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
import type { AssetPath } from "../assets";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import type { AppEnv } from "../lib/env";
import { L, type Lang } from "../lib/i18n";
import { requireUser } from "../lib/session";
import { datingIntents, vibes } from "../schema";
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
  CODE_AXES,
  displayName,
  flavourBadges,
  normalizeType,
  suggestedMatches,
  typeOf,
  type Archetype,
  type ArchetypeKey,
  type TypeResult,
  resultOf,
} from "../vibe/archetypes";
import { DISTRICTS } from "../lib/constants";
import { AvatarStack, Big, Pill, Tile, artFor } from "../ui/visual";

const districtName = (lang: Lang, key: string) => {
  const d = DISTRICTS.find((x) => x.value === key);
  return d ? (lang === "en" ? d.en : d.th) : key;
};
import { generateSession, itemScore, scoreSession, strengthOf, type Answers, type Personal, type Question } from "../vibe/generator";

export const quizRoutes = new Hono<AppEnv>();

export type VibeRow = typeof vibes.$inferSelect;

export const MIN_ANSWERED = 14;
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
 * The member's session: 20 hand-written scenarios, with one or two answers
 * set near their home district when known, so even the same seed reads differently
 * for different people.
 */
export function quizQuestions(seed: string, row: Pick<VibeRow, "seen"> | null, personal?: Personal, friendsOnly = false): Question[] {
  return generateSession({ seed, seen: new Set(row?.seen ?? []), personal, friendsOnly });
}

/** Members who said "friends only" never get date scenarios. */
export async function isFriendsOnly(env: AppEnv["Bindings"], accountId: string): Promise<boolean> {
  const [row] = await getDb(env).select({ mode: datingIntents.mode }).from(datingIntents).where(eq(datingIntents.accountId, accountId)).limit(1);
  return row?.mode === "friends";
}

/** Personalisation from a profile (null before onboarding basics). */
export function personalOf(profile: { district?: string | null; interests?: readonly string[] | null } | null | undefined): Personal | undefined {
  if (!profile) return undefined;
  const interests = Array.isArray(profile.interests) ? profile.interests.filter((x): x is string => typeof x === "string") : [];
  if (!profile.district) return undefined;
  return { district: profile.district, interests };
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

function AnswerField(props: { v: View; q: Question; i: number }) {
  const { lang } = props.v;
  return (
    <div class="answers answers-six">
      {props.q.options.map((o, j) => (
        <AnswerCard name={`a${props.i}`} value={String(j)} label={L(lang, o.label)} emoji={o.icon} />
      ))}
    </div>
  );
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
        title={t("คุณเป็นไทป์กรุงเทพฯ แบบไหน?", "What's your Bangkok Type?")}
        hint={t("สถานการณ์จริงในกรุงเทพฯ ไม่มีถูกผิด เป็นความลับ", "Real Bangkok moments. No wrong answers. Private.")}
        cta={t("เริ่มเลย", "Start")}
      >
        <div class="tiles" aria-hidden="true">
          <span class="tile"><b>👆</b>{t(`${n} ข้อ แตะเลือก`, `${n} questions, tap to pick`)}</span>
          <span class="tile"><b>⏱️</b>{t("ราว 3 นาที", "About 3 min")}</span>
          <span class="tile"><b>🔒</b>{t("เป็นความลับ", "Private")}</span>
        </div>
      </FlowStep>
      {props.questions.map((q, i) => (
        <FlowStep title={L(lang, q.prompt)} auto class="q q-choice">
          <QuestionArt art={q.art} lang={lang} />
          {i === 0 ? <span class="tap-hint">👆 {t("แตะคำตอบที่ตรงกับคุณที่สุด", "Tap the answer that's most you")}</span> : null}
          <span class="muted q-count">
            {i + 1} / {n}
          </span>
          <AnswerField v={props.v} q={q} i={i} />
        </FlowStep>
      ))}
    </Flow>
  );
}

/**
 * Turns the posted form into answers: question i posts a{i} = option index.
 * A question left blank is just unanswered; anything else that isn't a valid
 * option goes into `invalid` so the route can answer 400.
 */
export function parseAnswers(body: Record<string, unknown>, questions: Question[]): { answers: Answers; invalid: number[] } {
  const answers: Answers = {};
  const invalid: number[] = [];
  questions.forEach((q, i) => {
    const raw = str(body[`a${i}`]);
    if (raw === "") return;
    const answer = /^\d{1,2}$/.test(raw) ? Number(raw) : NaN;
    if (itemScore(q, answer) !== null) answers[q.id] = answer;
    else invalid.push(i);
  });
  return { answers, invalid };
}

export function answersFrom(body: Record<string, unknown>, questions: Question[]): Answers {
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
        const pct = Math.round(50 + Math.abs(val) * 50);
        const pm = Math.round(m * 50);
        const side = L(lang, leanPlus ? info.plus.label : info.minus.label);
        const verdict = unsure ? (en ? "Not sure yet" : "ยังไม่ชัด") : `${pct}% ${side}`;
        const bandL = Math.max(0, 50 + (val - m) * 50);
        const bandR = Math.min(100, 50 + (val + m) * 50);
        return (
          <li class={unsure ? "unsure" : ""}>
            <div class="ends">
              <span>{!unsure && !leanPlus ? <b>{L(lang, info.minus.label)}</b> : L(lang, info.minus.label)}</span>
              <span>
                {L(lang, info.name)} · {verdict}
                {m > 0 ? <small class="pm"> ±{pm}%</small> : null}
              </span>
              <span>{!unsure && leanPlus ? <b>{L(lang, info.plus.label)}</b> : L(lang, info.plus.label)}</span>
            </div>
            <div class="track" role="img" aria-label={`${L(lang, info.name)}: ${verdict}${m > 0 ? ` ±${pm}%` : ""}`}>
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
  const { unsure, consistency } = props.res;
  const letters = unsure.filter((c) => CODE_AXES.some((a) => a.category === c));
  return (
    <>
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
          🔁 {t(`คำถามที่ถามซ้ำด้วยคำต่างกัน: ตอบตรงกัน ${Math.round(consistency * 100)}%`, `Questions asked twice in different words: ${Math.round(consistency * 100)}% consistent`)}
        </p>
      ) : null}
    </>
  );
}

/** Who this type clicks with, and why. */
function Clicks(props: { v: View; a: Archetype }) {
  const { t, lang } = props.v;
  return (
    <Card>
      <h2>🤝 {t("เข้ากันได้ดีกับ", "Clicks with")}</h2>
      <div class="type-row">
        {props.a.clicks.map((x) => (
          <a href={`/types/${typeSlug(x.key)}`} class="type-pick" title={L(lang, x.why)}>
            <AvatarStack items={[{ label: L(lang, ARCHETYPES[x.key].name), emoji: ARCHETYPES[x.key].emoji, seed: x.key }]} size={56} />
            <small>{L(lang, ARCHETYPES[x.key].name).replace(/^The /, "")}</small>
          </a>
        ))}
      </div>
      <details class="how">
        <summary>{t("ทำไมถึงเข้ากัน", "Why you click")}</summary>
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

/** The type, its wing and a third, as three tiles with big percentages. */
function Blend(props: { v: View; blend: TypeResult["types"] }) {
  const { t, lang } = props.v;
  const roles = [t("ไทป์หลัก", "Your type"), t("ไทป์รอง", "Wing"), t("อีกด้าน", "Also in you")];
  return (
    <>
      <h2>🧬 {t("ส่วนผสมของคุณ", "Your blend")}</h2>
      <div class="bento blend3">
        {props.blend.map((b, i) => (
          <Tile href={`/types/${typeSlug(b.key)}`} tone={i === 0 ? "brand" : "plain"}>
            <AvatarStack items={[{ label: L(lang, ARCHETYPES[b.key].name), emoji: ARCHETYPES[b.key].emoji, seed: b.key }]} size={44} />
            <Big n={`${b.fit}%`} label={roles[i]} />
            <small>{L(lang, ARCHETYPES[b.key].name).replace(/^The /, "")}</small>
          </Tile>
        ))}
      </div>
    </>
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
      <h3>🏙️ {t("ที่เที่ยวและย่านที่ใช่", "Hangouts and areas")}</h3>
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
  const others = res.range.filter((k) => k !== key);
  return (
    <>
      <div class={`stack-card type-hero2 ${props.reveal ? "reveal" : ""}`}>
        <Tile tone="brand" art={{ tone: "evening", icons: [], seed: 3 }} lang={lang}>
          <Pill dot>{t("ไทป์กรุงเทพฯ ของคุณ", "Your Bangkok Type")}</Pill>
          <span class="type-emoji" aria-hidden="true">{a.emoji}</span>
          <h1>{L(lang, displayName(key, props.row.modifier))}</h1>
          <small>{L(lang, a.tagline)}</small>
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
        <Certainty v={props.v} res={res} />
        <Meter lang={lang} vector={props.row.vector} margin={res.margin} unsure={res.margin ? res.unsure : undefined} />
      </details>
      <Matches v={props.v} archetype={key} />
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
    <QuizFlow v={v} questions={quizQuestions(seed, row, personalOf(user.profile), await isFriendsOnly(c.env, user.account.id))} seed={seed} next="/quiz/result" close={row ? "/quiz/result" : "/settings"} />,
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
  const questions = quizQuestions(seed, row, next === "/onboarding/type" ? undefined : personalOf(user.profile), await isFriendsOnly(c.env, user.account.id));
  const { answers, invalid } = parseAnswers(body, questions);
  const result = scoreSession(questions, answers);
  if (invalid.length > 0 || result.answered < MIN_ANSWERED) {
    const bad = invalid[0];
    const error =
      bad !== undefined
        ? v.t(
            `ข้อ ${bad + 1} ต้องเลือกจากคำตอบที่มีให้ ลองดูอีกครั้ง`,
            `Question ${bad + 1} needs another look: please pick one of the answers.`,
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
  const { archetype, modifier, blend: types } = typeOf(result.vector, result.affinity, result.unsure);
  const blend: TypeResult = { types, unsure: result.unsure, consistency: result.consistency, margin: result.margin };
  const seen = [...new Set([...(row?.seen ?? []), ...questions.map((q) => q.id)])].slice(-SEEN_MAX);
  const values = { vector: result.vector, archetype, modifier, blend, seen, takenAt: new Date() };
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
