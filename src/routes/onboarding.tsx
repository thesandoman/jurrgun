/**
 * Onboarding (PRD §5, §21): a light personality quiz, not a government form.
 * Every stage is a card flow (src/ui/flow.tsx). Few screens before the first
 * event (D42): the quiz, then one screen each for basics and privacy.
 *
 *   0 welcome      one splash screen, and the first question: new friends and group plans (the default),
 *                  or new friends and 💘 open to something more; 💘 members then answer why, and what
 *                  makes dating in Bangkok hard
 *   1 quiz         Bangkok Vibe quiz (skippable) → type reveal (/onboarding/type)
 *   2 basics       one screen: nickname, birth date (18+ gate), district, how you're in Bangkok
 *   3 privacy      one screen: the Terms (if not yet accepted) and the code of conduct; what the
 *                  app needs to run (service, safety: explained, not asked); the optional consents
 *   4 connections  one private screen (relationship, ages, women-only), skippable; romance for dating members
 *   5 wellbeing    optional UCLA-3 baseline on one screen, only with research consent
 *
 * The about-you questions (languages, interests, how you like to meet...) come
 * after the first RSVP as "Help your table get to know you" (/onboarding/you).
 */
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { and, desc, eq } from "drizzle-orm";
import { batch, getDb } from "../db";
import { ageOn, canBeWomenOnly, canSwitchToSingle, MIN_AGE } from "../domain/rules";
import {
  DISTRICTS,
  GENDER_IDENTITIES,
  ORIENTATIONS,
  INTENTS,
  LANGUAGES,
  RELATIONSHIP,
  SOCIAL_STYLES,
  values,
  districtsAZ,
} from "../lib/constants";
import { newId } from "../lib/crypto";
import type { AppEnv, CurrentUser } from "../lib/env";
import type { Lang } from "../lib/i18n";
import { consents, datingIntents, profiles, wellbeing } from "../schema";
import { acceptedTerms, CONSENT_VERSION, consentEffects, consentRow, hasConsent, privateFieldConsents, ROMANCE_CONSENT, termsRow } from "../services/consent";
import { CONSENT_CATEGORIES, NOT_A_CONSENT, RESEARCH_HINT } from "../content/privacy";
import { L } from "../lib/i18n";
import { TermsAgree } from "./policies";
import {
  cleanPrefs,
  DATING_DISTANCE,
  DATING_FIRST,
  DATING_GOALS,
  DATING_KIDS,
  DATING_PACE,
  isMode,
  MAX_FIRST,
  MODE_OPTS,
  offeredMode,
  ROMANCE_EXPLAINER,
} from "../content/dating";
import { requireUser } from "../lib/session";
import { AnswerCard, Flow, FlowStep } from "../ui/flow";
import { Choices, Field, list, Notice, page, Select, str, Toggle, view, type View } from "../ui/kit";
import { INTERNATIONAL_COOKIE, NEWCOMER_COOKIE } from "./newcomers";
import { GROUP_SIZES, groupSizeOrLegacy, SIZE_STYLES, TIME_WINDOWS, timesOrLegacy, withGroupStyle } from "../content/profile";
import { BKK_STORY, cleanBio, INTEREST_VALUES, isResidency, MAX_INTERESTS, parseBangkok, withoutDating } from "../content/profile";
import { InterestPicker, OptChecks, OptRadios, ProfileFormScript } from "../ui/profile-form";
import { safeNext } from "../ui/table-intro";
import { loadVibe, quizQuestions, quizSeed, QuizFlow, ResultView } from "./quiz";
import { INTENT_COOKIE, journeyFor, JourneyTop, type Journey } from "../ui/journey";
import { Script } from "../ui/kit";

export const onboarding = new Hono<AppEnv>();
onboarding.use("*", requireUser);

// Once onboarded, the onboarding steps are closed: they would otherwise let a
// member rewrite fields Settings deliberately locks (birth date, which drives
// event age ranges and the private age preference).
const STEP_PATHS = new Set(["/onboarding/basics", "/onboarding/privacy", "/onboarding/connections", "/onboarding/wellbeing"]);
onboarding.use("*", async (c, next) => {
  if (c.var.user?.profile?.onboardedAt && STEP_PATHS.has(new URL(c.req.url).pathname)) return c.redirect("/");
  await next();
});

const STEPS = ["welcome", "quiz", "basics", "privacy", "connections", "wellbeing"] as const;
type Step = (typeof STEPS)[number];
// One progress bar for the whole first-time journey, with chapter names: src/ui/journey.tsx (D1).

export { CONSENT_VERSION };
export const QUIZ_SKIP_COOKIE = "bkk_quiz_skip";
/** friends | dating, chosen on the welcome screen before a profile exists (dating_only from older visits reads as dating). */
export { INTENT_COOKIE };

/** The first step this user hasn't completed. */
async function nextStep(c: Context<AppEnv>, user: CurrentUser): Promise<Step | "done"> {
  const p = user.profile;
  if (!p) {
    // The quiz comes first; it counts as done once taken or skipped.
    if (getCookie(c, QUIZ_SKIP_COOKIE) === "1") return "basics";
    return (await loadVibe(c.env, user.account.id)) ? "basics" : "welcome";
  }
  if (p.onboardedAt) return "done";
  const db = getDb(c.env);
  const rows = await db
    .select({ category: consents.category })
    .from(consents)
    .where(eq(consents.accountId, user.account.id))
    .limit(50);
  if (!rows.some((r) => r.category === "service")) return "privacy";
  return "connections";
}

const TITLE = "Onboarding";

onboarding.get("/", async (c) => {
  const step = await nextStep(c, c.var.user!);
  return c.redirect(step === "done" ? "/" : `/onboarding/${step}`);
});

// ------------------------------------------------------------- helpers --

type Opt = { value: string; th: string; en: string };

/** Pills without their own legend (the flow step's title is the legend). */
function Pills(props: { name: string; options: Opt[]; values?: string[]; lang: Lang; type?: "checkbox" | "radio" }) {
  const selected = new Set(props.values ?? []);
  return (
    <div class="pills">
      {props.options.map((o) => (
        <label class="pill">
          <input type={props.type ?? "checkbox"} name={props.name} value={o.value} checked={selected.has(o.value)} />
          <span>{props.lang === "en" ? o.en : o.th}</span>
        </label>
      ))}
    </div>
  );
}

/** A required checkbox styled as a toggle row (Toggle has no `required`). */
function MustToggle(props: { name: string; label: string; checked?: boolean }) {
  return (
    <label class="toggle">
      <input type="checkbox" name={props.name} value="1" checked={props.checked} required />
      <span>{props.label}</span>
    </label>
  );
}

// ------------------------------------------------------------- welcome --

/** Love red tints the 💘 card only once it is chosen; friends stays brand green. */
const WELCOME_CSS = `.welcome-mode .answer input[value=dating]:checked+span{border-color:var(--love);background:var(--love-soft);color:var(--ink)}
.welcome-mode .answer input[value=dating]:focus-visible+span{outline-color:color-mix(in srgb,var(--love) 45%,transparent)}`;

onboarding.get("/welcome", (c) => {
  const v = view(c);
  const { t, lang } = v;
  const raw = getCookie(c, INTENT_COOKIE);
  const chosen = raw && isMode(raw) ? offeredMode(raw) : undefined;
  return page(
    c,
    { title: TITLE, bare: true },
    <form method="post" action="/onboarding/welcome">
      <JourneyTop v={v} j={journeyFor(c, "welcome")} />
      <div class="splash">
        <div class="splash-mark" aria-hidden="true">◐</div>
        <h1>{t("ยินดีต้อนรับสู่ Jurrgun", "Welcome to Jurrgun")}</h1>
      </div>
      <h2>{t("มาหาอะไรที่ Jurrgun?", "What brings you here?")}</h2>
      <style dangerouslySetInnerHTML={{ __html: WELCOME_CSS }} />
      <div class="answers welcome-mode">
        {MODE_OPTS.map((o, i) => (
          <AnswerCard name="mode" value={o.value} emoji={o.emoji} label={lang === "en" ? o.label.en : o.label.th} checked={chosen ? chosen === o.value : i === 0} />
        ))}
      </div>
      <p class="muted">🔒 {t("เปลี่ยนได้ทุกเมื่อ เรื่องเดตเป็นความลับเสมอ", "Change it anytime. Dating stays private.")}</p>
      {/* The quiz's own intro screen is folded in here, so the quiz starts at question 1. */}
      <p class="welcome-next">
        🧭 {t("ต่อไป: ไทป์กรุงเทพฯ ของคุณ 16 สถานการณ์สั้น ๆ อาจมีเพิ่มอีก 1 ถึง 2 ข้อ ใช้เวลาราว 3 นาที ตอบตามความรู้สึกแรก มีแค่คุณที่เห็นคำตอบ", "Next: your Bangkok Type. 16 quick Bangkok moments, sometimes 1 or 2 more, about 3 minutes. Go with your gut; only you see your answers.")}
      </p>
      <div class="flow-bar">
        <button type="submit" class="btn primary">{t("ไปกันเลย", "Let's go")}</button>
      </div>
    </form>,
  );
});

onboarding.post("/welcome", async (c) => {
  const body = await c.req.parseBody();
  const raw = str(body.mode);
  const mode = isMode(raw) ? raw : "friends";
  setCookie(c, INTENT_COOKIE, mode, { path: "/", maxAge: 30 * 86_400, sameSite: "Lax", httpOnly: true });
  // The choice stays in the cookie: dating intents are saved only with romance_data consent (R1).
  await saveDatingIntent(getDb(c.env), c.var.user!.account.id, { mode });
  return c.redirect(mode === "friends" ? "/onboarding/quiz" : "/onboarding/dating");
});

const prefOpts = (list: { value: string; emoji: string; label: { th: string; en: string } }[]) => list.map((o) => ({ value: o.value, th: `${o.emoji} ${o.label.th}`, en: `${o.emoji} ${o.label.en}` }));

/** The private dating preference steps, shared by onboarding and /settings/dating. */
export function DatingPrefSteps(props: { t: (th: string, en: string) => string; lang: Lang; prefs?: ReturnType<typeof cleanPrefs> }) {
  const { t, lang } = props;
  const p = props.prefs ?? {};
  const one = (v?: string) => (v ? [v] : []);
  return (
    <>
      <FlowStep emoji="🎯" title={t("กำลังมองหาอะไร", "What are you looking for?")} hint={t("เป็นความลับ ใช้จับคู่เท่านั้น", "Private. Only used for matching.")}>
        <Pills name="goal" type="radio" options={prefOpts(DATING_GOALS)} values={one(p.goal)} lang={lang} />
      </FlowStep>
      <FlowStep emoji="👶" title={t("เรื่องลูก", "Kids")} hint={t("ไม่ตอบก็ได้", "Skip if you'd rather not say.")}>
        <Pills name="kids" type="radio" options={prefOpts(DATING_KIDS)} values={one(p.kids)} lang={lang} />
      </FlowStep>
      <FlowStep emoji="🐢" title={t("จังหวะที่สบายใจ", "Your pace")}>
        <Pills name="pace" type="radio" options={prefOpts(DATING_PACE)} values={one(p.pace)} lang={lang} />
      </FlowStep>
      <FlowStep emoji="☕" title={t("เดตแรกในฝัน", "Ideal first date")} hint={t(`เลือกได้สูงสุด ${MAX_FIRST}`, `Pick up to ${MAX_FIRST}.`)}>
        <Pills name="firstDate" options={prefOpts(DATING_FIRST)} values={p.firstDate} lang={lang} />
      </FlowStep>
      <FlowStep emoji="🚇" title={t("ไปเจอได้ไกลแค่ไหน", "How far would you go?")}>
        <Pills name="distance" type="radio" options={prefOpts(DATING_DISTANCE)} values={one(p.distance)} lang={lang} />
      </FlowStep>
    </>
  );
}

export function prefsFromBody(body: Record<string, unknown>) {
  const list1 = (v: unknown) => (Array.isArray(v) ? v : v === undefined ? [] : [v]).filter((x): x is string => typeof x === "string");
  return cleanPrefs({ goal: body.goal, kids: body.kids, pace: body.pace, distance: body.distance, firstDate: list1(body.firstDate) });
}

/** Onboarding dating answers waiting for the romance_data consent (R1). Never sent anywhere. */
export const DATING_PENDING_COOKIE = "bkk_dating_pending";

type DatingValues = { mode?: string; prefs?: Record<string, unknown> };

/** Insert or update the member's dating intents. Only in the same batch as, or after, a romance_data yes. */
function datingIntentUpsert(db: ReturnType<typeof getDb>, accountId: string, v: DatingValues) {
  return db
    .insert(datingIntents)
    // D3-urgent (owner, 30 Oct): "why you're here" and "what makes dating hard" are no longer asked or kept.
    // Every write empties them, and Privacy & Security's retention step wipes any older rows.
    .values({ accountId, mode: v.mode ?? "dating", reasons: [], challenges: [], prefs: v.prefs ?? {}, updatedAt: new Date() })
    .onConflictDoUpdate({ target: datingIntents.accountId, set: { ...v, reasons: [], challenges: [], updatedAt: new Date() } });
}

/** R1: dating intents are saved only while the member's newest romance_data answer is yes. */
export async function saveDatingIntent(db: ReturnType<typeof getDb>, accountId: string, v: DatingValues): Promise<boolean> {
  if (!(await hasConsent(db, accountId, ROMANCE_CONSENT))) return false;
  await datingIntentUpsert(db, accountId, v);
  return true;
}

/**
 * The upsert for dating answers given in onboarding before consent, to put in the batch
 * that records the romance_data yes. Null when nothing is waiting (no 💘 welcome answer and
 * no dating answers). Clears the cookie either way.
 */
export function pendingDatingIntent(c: Context<AppEnv>, db: ReturnType<typeof getDb>, accountId: string) {
  const raw = getCookie(c, DATING_PENDING_COOKIE);
  const mode = getCookie(c, INTENT_COOKIE);
  if (raw) deleteCookie(c, DATING_PENDING_COOKIE, { path: "/" });
  if (!raw && mode !== "dating" && mode !== "dating_only") return null;
  // An older cookie may still hold reasons and challenges: they're ignored.
  let saved: { prefs?: unknown } = {};
  try {
    saved = raw ? JSON.parse(raw) : {};
  } catch {
    saved = {};
  }
  return datingIntentUpsert(db, accountId, {
    mode: mode === "dating_only" ? "dating_only" : "dating",
    prefs: cleanPrefs(saved.prefs),
  });
}

/** Romance off or romance_data withdrawn: answers waiting in the cookie go too. */
export function dropPendingDating(c: Context<AppEnv>) {
  if (getCookie(c, DATING_PENDING_COOKIE)) deleteCookie(c, DATING_PENDING_COOKIE, { path: "/" });
}

/**
 * The 💘 welcome: the private preference steps only (D3-urgent, owner 30 Oct: the "why" and
 * "what makes it hard" questions are gone). The safety net is linked right here, first.
 */
onboarding.get("/dating", (c) => {
  const v = view(c);
  const { t, lang } = v;
  return page(
    c,
    { title: TITLE, bare: true },
    <Flow v={v} action="/onboarding/dating" submit={t("ต่อไป", "Next")} journey={journeyFor(c, "dating")}>
      <p class="muted">
        🛡️ <a href="/safety">{t("ตัวช่วยความปลอดภัยเวลาไปเดต", "Your dating safety net")}</a>
      </p>
      <DatingPrefSteps t={t} lang={lang} />
    </Flow>,
  );
});

onboarding.post("/dating", async (c) => {
  const body = await c.req.parseBody({ all: true });
  const prefs = prefsFromBody(body);
  const me = c.var.user!.account.id;
  // Not saved yet (R1): the preferences wait in a private cookie until the romance_data consent is
  // given at "Open to something more?", and are dropped if it isn't. Saved now only when it already was.
  setCookie(c, DATING_PENDING_COOKIE, JSON.stringify({ prefs }), { path: "/", maxAge: 30 * 86_400, sameSite: "Lax", httpOnly: true });
  await saveDatingIntent(getDb(c.env), me, { mode: getCookie(c, INTENT_COOKIE) === "dating_only" ? "dating_only" : "dating", prefs });
  // The "We hear you" screen answered the "what makes it hard" question, which is gone, so
  // the welcome goes straight on (its safety-net link is on the step itself now).
  return c.redirect("/onboarding/quiz");
});

// ---------------------------------------------------------------- quiz --

onboarding.get("/quiz", async (c) => {
  const v = view(c);
  const user = v.user!;
  const row = await loadVibe(c.env, user.account.id);
  const seed = quizSeed(user.account.id, row);
  return page(
    c,
    { title: TITLE, bare: true },
    <QuizFlow v={v} questions={quizQuestions(seed, row, v.lang === "en" ? { explainLocal: true } : undefined)} seed={seed} next="/onboarding/type" journey={journeyFor(c, "quiz")} noIntro skipAction="/onboarding/quiz/skip" />,
  );
});

onboarding.post("/quiz/skip", (c) => {
  setCookie(c, QUIZ_SKIP_COOKIE, "1", { path: "/", maxAge: 30 * 86_400, sameSite: "Lax", httpOnly: true });
  return c.redirect("/onboarding/basics");
});

onboarding.get("/type", async (c) => {
  const v = view(c);
  const row = await loadVibe(c.env, v.user!.account.id);
  if (!row) return c.redirect("/onboarding/quiz");
  return page(
    c,
    { title: TITLE, bare: true },
    <>
      <JourneyTop v={v} j={journeyFor(c, "type")} />
      <ResultView v={v} row={row} reveal continueHref="/onboarding" continueLabel={v.t("ต่อไป", "Continue")} visibilityNext="/onboarding/type" />
    </>,
  );
});

// --------------------------------------------------------------- basics --

function BasicsForm(props: { v: View; j: Journey; values?: Record<string, string>; error?: string }) {
  const { t, lang } = props.v;
  const p = props.v.user?.profile;
  const val = props.values ?? {};
  return (
    <Flow v={props.v} submit={t("ต่อไป", "Next")} journey={props.j} error={props.error ? <Notice kind="error">{props.error}</Notice> : undefined}>
      <FlowStep emoji="👋" title={t("เริ่มจากเรื่องพื้นฐาน", "The basics")} hint={t("วันเกิดใช้เช็กว่าอายุ 18+ ไม่แสดงให้ใครเห็น", "Your birthday is only used to check you're 18+. Never shown to others.")}>
        <Field label={t("อยากให้เพื่อนเรียกว่าอะไร (ชื่อเล่น)", "What should people call you? (nickname)")} name="nickname" value={val.nickname ?? p?.nickname} required maxlength={30} autocomplete="nickname" />
        <BirthDateFields v={props.v} value={val.birthDate ?? p?.birthDate} />
        <Select label={t("ส่วนใหญ่อยู่เขตไหน", "Where do you spend your week? (district)")} name="district" options={districtsAZ(lang)} value={val.district ?? p?.district} lang={lang} required blank={t("เลือกเขต", "Choose a district")} />
        <Toggle name="newcomer" label={t("ฉันเพิ่งมาถึงกรุงเทพฯ", "I'm new in town")} checked={val.newcomer === "1" || !!p?.newcomer} />
      </FlowStep>
    </Flow>
  );
}

const MONTHS: [string, string][] = [
  ["มกราคม", "January"], ["กุมภาพันธ์", "February"], ["มีนาคม", "March"], ["เมษายน", "April"], ["พฤษภาคม", "May"], ["มิถุนายน", "June"],
  ["กรกฎาคม", "July"], ["สิงหาคม", "August"], ["กันยายน", "September"], ["ตุลาคม", "October"], ["พฤศจิกายน", "November"], ["ธันวาคม", "December"],
];
const pad2 = (n: number | string) => String(n).padStart(2, "0");
/** "1996", "5", "3" → "1996-05-03"; empty if any part is missing. */
export function joinBirthDate(day: string, month: string, year: string): string {
  return day && month && year ? `${year}-${pad2(month)}-${pad2(day)}` : "";
}

/**
 * Birthday as day, month and year in the reading order people use here, with
 * Thai month names and Buddhist-era years on the Thai page (the browser's own
 * date box showed a US mm/dd/yyyy). Posts birthDay / birthMonth / birthYear.
 */
function BirthDateFields(props: { v: View; value?: string | null }) {
  const { t, lang } = props.v;
  const [y, m, d] = (props.value ?? "").split("-");
  const thisYear = new Date().getUTCFullYear();
  const years = Array.from({ length: 83 }, (_, i) => thisYear - 18 - i);
  return (
    <fieldset class="birth-fields">
      <legend>{t("วันเกิด", "Date of birth")}</legend>
      <div class="birth-row">
        <label>
          <span>{t("วัน", "Day")}</span>
          <select name="birthDay" required>
            <option value="">-</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
              <option value={String(n)} selected={d ? +d === n : undefined}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("เดือน", "Month")}</span>
          <select name="birthMonth" required>
            <option value="">-</option>
            {MONTHS.map(([th, en], i) => (
              <option value={String(i + 1)} selected={m ? +m === i + 1 : undefined}>{lang === "en" ? en : th}</option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("ปี (พ.ศ.)", "Year")}</span>
          <select name="birthYear" required>
            <option value="">-</option>
            {years.map((n) => (
              <option value={String(n)} selected={y ? +y === n : undefined}>{lang === "en" ? n : n + 543}</option>
            ))}
          </select>
        </label>
      </div>
    </fieldset>
  );
}

// Came in through /new (the newcomer front door): "I'm new in town" starts ticked.
onboarding.get("/basics", (c) =>
  page(c, { title: TITLE, bare: true }, <BasicsForm v={view(c)} j={journeyFor(c, "basics")} values={getCookie(c, NEWCOMER_COOKIE) === "1" ? { newcomer: "1" } : undefined} />),
);

onboarding.post("/basics", async (c) => {
  const v = view(c);
  const { t } = v;
  const user = c.var.user!;
  const body = await c.req.parseBody();
  const vals = {
    nickname: str(body.nickname).slice(0, 30),
    // Day, month and year pickers (Thai months, Buddhist-era years in Thai); the old single date field still works.
    birthDate: str(body.birthDate) || joinBirthDate(str(body.birthDay), str(body.birthMonth), str(body.birthYear)),
    district: str(body.district),
    // "livesInBangkok=1" is the old single checkbox (a page left open mid-sign-up).
    residency: str(body.residency) || (str(body.livesInBangkok) === "1" ? "lives" : ""),
    newcomer: str(body.newcomer),
  };
  const fail = (error: string, _field?: number) => page(c, { title: TITLE, status: 400, bare: true }, <BasicsForm v={v} j={journeyFor(c, "basics")} values={vals} error={error} />);
  if (!vals.nickname) return fail(t("กรอกชื่อเล่น", "Please add a nickname."), 0);
  // A real calendar date: "1990-02-31" passes the pattern but isn't one.
  const parsed = new Date(`${vals.birthDate}T00:00:00Z`);
  const realDate = /^\d{4}-\d{2}-\d{2}$/.test(vals.birthDate) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === vals.birthDate;
  if (!realDate) return fail(t("กรอกวันเกิด", "Please add your date of birth."), 1);
  const age = ageOn(vals.birthDate);
  if (!(age >= MIN_AGE && age < 120)) return fail(t("Jurrgun เปิดให้ใช้เฉพาะคนอายุ 18 ปีขึ้นไป", "Jurrgun is for adults aged 18 and over."), 1);
  if (!values(DISTRICTS).includes(vals.district)) return fail(t("เลือกเขต", "Please choose a district."), 2);
  // Card D3 (owner, 2026-10-30): residency is no longer asked here. It only shows on the profile card,
  // so it's optional in Settings. An old page that still sends it is kept when valid.

  const db = getDb(c.env);
  const bio = { ...cleanBio(user.profile?.bio), ...(isResidency(vals.residency) ? { residency: vals.residency } : {}) };
  const data = { nickname: vals.nickname, birthDate: vals.birthDate, district: vals.district, newcomer: vals.newcomer === "1", bio, locale: v.lang, updatedAt: new Date() };
  if (user.profile) await db.update(profiles).set(data).where(eq(profiles.accountId, user.account.id));
  // Languages start on the app language; the table intro after the first RSVP asks properly.
  else await db.insert(profiles).values({ accountId: user.account.id, ...data, languages: [v.lang] });
  return c.redirect("/onboarding/privacy");
});

// -------------------------------------------------------------- privacy --

/**
 * Service and safety are needed to run the app, so they are explained, never
 * asked: no box to tick. Their rows are still written when this step is done,
 * as a dated acknowledgement for the history. The rest are real choices.
 */
const CONSENT_ITEMS: { key: string; required: boolean; emoji: string; th: string; en: string }[] = [
  { key: "service", required: true, emoji: "🎟️", th: "บัญชีและบริการกิจกรรม", en: "Account and events" },
  { key: "safety", required: true, emoji: "🛡️", th: "ความปลอดภัยและการดูแลชุมชน", en: "Safety and moderation" },
  { key: "personalization", required: false, emoji: "🪑", th: "จัดโต๊ะตามความสนใจ", en: "Seat me by my interests" },
  { key: "research", required: false, emoji: "📊", th: "City Pulse: ช่วยวิจัยเมือง", en: "City Pulse: city research" },
  { key: "notifications", required: false, emoji: "🔔", th: "แจ้งเตือนกิจกรรม", en: "Event reminders" },
];

function PrivacyForm(props: { v: View; j: Journey; error?: string; needTerms: boolean; values?: Record<string, string> }) {
  const { t, lang } = props.v;
  const val = props.values ?? {};
  const hintOf = (key: string) => CONSENT_CATEGORIES.find((c) => c.key === key)!.hint;
  return (
    <Flow v={props.v} submit={t("ต่อไป", "Next")} journey={props.j} error={props.error ? <Notice kind="error">{props.error}</Notice> : undefined}>
      <FlowStep
        emoji="🤝"
        title={t("สิ่งที่จำเป็น", "The must-haves")}
        hint={t("ยอมรับข้อตกลงก่อนเริ่มใช้งาน", "Agree to these to get started.")}
        info={
          <p>
            <a href="/privacy" target="_blank">{t("นโยบายความเป็นส่วนตัว", "Privacy notice")}</a> ·{" "}
            <a href="/code-of-conduct" target="_blank">{t("หลักปฏิบัติของชุมชน", "Code of conduct")}</a>
          </p>
        }
      >
        {props.needTerms ? <TermsAgree v={props.v} checked={val.terms === "1"} /> : null}
        <MustToggle name="conduct" label={`📜 ${t("ฉันยอมรับหลักปฏิบัติของชุมชน", "I agree to the code of conduct")}`} checked={val.conduct === "1"} />
        <h3 class="flow-sub">{L(lang, NOT_A_CONSENT)}</h3>
        <ul class="needed-list">
          {CONSENT_ITEMS.filter((i) => i.required).map((i) => (
            <li>
              <span aria-hidden="true">{i.emoji}</span>
              <span>
                <b>{t(i.th, i.en)}</b>
                <small>{L(lang, hintOf(i.key))}</small>
              </span>
            </li>
          ))}
        </ul>
        <h3 class="flow-sub">
          <span aria-hidden="true">✨</span> {t("ตัวเลือกเพิ่มเติม", "Optional extras")}
        </h3>
        <div class="flow-hint with-info">
          <span>{t("ไม่เลือกก็ใช้แอปได้ เปลี่ยนได้ทุกเมื่อในการตั้งค่า", "You can use the app without these. Change them any time in Settings.")}</span>
          <details class="more-info">
            <summary aria-label={`ⓘ ${t("ตัวเลือกเพิ่มเติม", "Optional extras")}`}>
              <span aria-hidden="true">ⓘ</span>
            </summary>
            <div class="more-info-body">
              {t(
                "จัดโต๊ะ: ใช้ความสนใจและภาษาของคุณ แจ้งเตือน: เตือนก่อนกิจกรรมเริ่ม และเมื่อมีที่ว่าง และหากคุณเปิดไว้ จะมีข้อความสัปดาห์ละครั้งเมื่อมีกิจกรรมเปิดในเขตของคุณ",
                "Seating uses your interests and languages. Reminders: before events and when a spot opens, and, if you turn it on, a weekly note when something opens in your district.",
              )}
            </div>
          </details>
        </div>
        {CONSENT_ITEMS.filter((i) => !i.required).map((i) => (
          <Toggle name={`consent_${i.key}`} label={`${i.emoji} ${t(i.th, i.en)}`} hint={i.key === "research" ? L(lang, RESEARCH_HINT) : undefined} checked={val[`consent_${i.key}`] === "1"} />
        ))}
      </FlowStep>
    </Flow>
  );
}

onboarding.get("/privacy", async (c) => {
  const user = c.var.user!;
  if (!user.profile) return c.redirect("/onboarding/basics");
  // Password sign-ups ticked the Terms on /signup; Google and LINE sign-ups agree here.
  const needTerms = !(await acceptedTerms(getDb(c.env), user.account.id));
  return page(c, { title: TITLE, bare: true }, <PrivacyForm v={view(c)} j={journeyFor(c, "privacy")} needTerms={needTerms} />);
});

onboarding.post("/privacy", async (c) => {
  const v = view(c);
  const user = c.var.user!;
  if (!user.profile) return c.redirect("/onboarding/basics");
  const body = await c.req.parseBody();
  const db = getDb(c.env);
  // Service and safety aren't asked (no box): their rows are the acknowledgement, always yes.
  const granted = (k: string) => CONSENT_ITEMS.some((i) => i.key === k && i.required) || str(body[`consent_${k}`]) === "1";
  const needTerms = !(await acceptedTerms(db, user.account.id));
  const termsOk = !needTerms || str(body.terms) === "1";
  if (!termsOk || str(body.conduct) !== "1") {
    const values: Record<string, string> = { terms: str(body.terms), conduct: str(body.conduct) };
    for (const i of CONSENT_ITEMS) values[`consent_${i.key}`] = str(body[`consent_${i.key}`]);
    return page(
      c,
      { title: TITLE, status: 400, bare: true },
      <PrivacyForm
        v={v}
        j={journeyFor(c, "privacy")}
        needTerms={needTerms}
        values={values}
        error={
          needTerms
            ? v.t("ต้องยอมรับข้อกำหนดการใช้งานและหลักปฏิบัติของชุมชน ก่อนจึงจะไปต่อได้", "Please agree to the Terms of service and the code of conduct to continue.")
            : v.t("ต้องยอมรับหลักปฏิบัติของชุมชน ก่อนจึงจะไปต่อได้", "Please agree to the code of conduct to continue.")
        }
      />,
    );
  }
  await batch(c.env, [
    ...(needTerms ? [termsRow(db, user.account.id)] : []),
    ...CONSENT_ITEMS.flatMap((i) => [
      consentRow(db, user.account.id, i.key, granted(i.key)),
      // A research yes is what issues the research_id (privacy R7).
      ...consentEffects(db, user.account.id, i.key, granted(i.key), user.account.researchId),
    ]),
  ]);
  return c.redirect("/onboarding/connections");
});

const PRONOUN_PICKS: [string, string][] = [["she/her", "she/her"], ["he/him", "he/him"], ["they/them", "they/them"], ["ใช้ชื่อฉัน", "use my name"]];

/** Pronouns: quick picks that fill the box, or type your own. */
export function PronounField(props: { v: View; value?: string | null }) {
  const { t } = props.v;
  return (
    <div class="pronoun-field">
      <Field label={t("สรรพนาม (ไม่บังคับ)", "Pronouns (optional)")} name="pronouns" value={props.value ?? undefined} maxlength={30} placeholder={t("หรือพิมพ์เอง", "or type your own")} />
      <div class="pronoun-picks" role="group" aria-label={t("เลือกสรรพนามแบบเร็ว", "Quick picks")}>
        {PRONOUN_PICKS.map(([th, en]) => (
          <button type="button" class="chip-btn" data-pronoun={t(th, en)} aria-pressed={props.value === t(th, en) ? "true" : "false"}>
            {t(th, en)}
          </button>
        ))}
      </div>
      <Script
        dangerouslySetInnerHTML={{
          __html: `(function(){var w=document.currentScript.parentNode,i=w.querySelector('input[name="pronouns"]'),b=[].slice.call(w.querySelectorAll("[data-pronoun]"));function u(){b.forEach(function(x){x.setAttribute("aria-pressed",String(x.dataset.pronoun===i.value))})}b.forEach(function(x){x.addEventListener("click",function(){i.value=x.getAttribute("aria-pressed")==="true"?"":x.dataset.pronoun;u()})});i.addEventListener("input",u)})();`,
        }}
      />
    </div>
  );
}

// ------------------------------------------------------------------ you --
// "Help your table get to know you" (D42): asked after the first RSVP, not at
// sign-up. Open to members who have finished onboarding; skippable as a whole.

function YouForm(props: { v: View; next: string; error?: string; storyHint?: string }) {
  const { t, lang } = props.v;
  const p = props.v.user?.profile;
  const bio = cleanBio(p?.bio);
  return (
    <>
    <Flow
      v={props.v}
      action={`/onboarding/you?next=${encodeURIComponent(props.next)}`}
      submit={t("บันทึก", "Save")}
      close={props.next}
      count="steps"
      error={props.error ? <Notice kind="error">{props.error}</Notice> : undefined}
      extra={<a class="skip" href={props.next}>{t("ข้ามไปก่อน", "Skip for now")}</a>}
    >
      <FlowStep emoji="🗣️" title={t("พูดภาษาอะไรได้บ้าง?", "Which languages do you speak?")} hint={t("ช่วยให้โต๊ะรู้จักคุณ 4 คำถามสั้น ๆ เราใช้ภาษาเพื่อจัดให้นั่งกับคนที่คุยกันได้", "Help your table get to know you. 4 quick questions. We use your languages to seat you with people you can talk to.")} need={1} needText={t("เลือกอย่างน้อย 1 ภาษา", "Pick at least one")}>
        <Pills name="languages" options={LANGUAGES} values={p?.languages.length ? p.languages : [lang]} lang={lang} />
      </FlowStep>
      <FlowStep
        emoji="🍜"
        title={t("สนใจอะไรบ้าง?", "What are you into?")}
        hint={t(`เลือก 1 ถึง ${MAX_INTERESTS} อย่าง ค้นหาได้ เราใช้เพื่อให้โต๊ะมีเรื่องคุยร่วมกัน`, `Pick 1 to ${MAX_INTERESTS}. You can search. We use them so your table has something in common.`)}
        need={1}
        needText={t("เลือกอย่างน้อย 1", "Pick at least one")}
      >
        <InterestPicker v={props.v} values={p?.interests} />
      </FlowStep>
      <FlowStep emoji="👥" title={t("ชอบเจอคนแบบไหน?", "How do you like to meet people?")} hint={t("ไม่บังคับ ข้ามได้", "Optional. You can skip this.")}>
        <Pills name="socialStyles" options={SOCIAL_STYLES.filter((o) => !SIZE_STYLES.includes(o.value))} values={p?.socialStyles} lang={lang} />
        <p class="field-label">{t("ขนาดกลุ่มที่สบายใจ", "Group size I'm comfortable with")}</p>
        <OptRadios v={props.v} name="groupSize" options={GROUP_SIZES} value={groupSizeOrLegacy(bio.groupSize, p?.socialStyles ?? [])} />
        <p class="field-label">{t("ช่วงเวลาที่มักว่าง", "When I'm usually free")}</p>
        <OptChecks v={props.v} name="times" options={TIME_WINDOWS} values={timesOrLegacy(bio.times, p?.eventStyle)} />
        <p class="field-label">{t("มาที่นี่เพื่อ…", "I'm here for…")}</p>
        <Pills name="intents" options={INTENTS} values={p?.intents.filter((i) => i !== "romance").length ? p.intents : ["friends"]} lang={lang} />
      </FlowStep>
      <FlowStep emoji="🛺" title={t("คุณกับกรุงเทพฯ", "You and Bangkok")} hint={t("คนกรุงเทพฯ คนต่างจังหวัด หรือมาจากแดนไกล ยินดีต้อนรับทุกคน เราใช้เพื่อคละคนในโต๊ะ ไม่บังคับ", "Locals, people from the provinces, from abroad: everyone's welcome. We use it to mix your table. Optional.")}>
        <fieldset class="choices">
          <legend class="sr-only">{t("เรื่องของฉันกับกรุงเทพฯ", "My Bangkok story")}</legend>
          <OptRadios v={props.v} name="story" options={BKK_STORY} value={bio.story ?? props.storyHint} />
        </fieldset>
        <p class="muted small">{t("งาน การเรียน สรรพนาม และเรื่องอื่น ๆ ใส่ได้ที่ ฉัน › โปรไฟล์ เมื่อไหร่ก็ได้ แสดงแค่ในการ์ดโปรไฟล์ของคุณ", "Work, study, pronouns and more can go on your profile any time, at Me › Profile. They only show on your profile card.")}</p>
      </FlowStep>
    </Flow>
    <ProfileFormScript />
    </>
  );
}

const youNext = (c: Context<AppEnv>) => safeNext(c.req.query("next"), c.var.user?.profile?.onboardedAt ? "/" : "/onboarding");

onboarding.get("/you", (c) => {
  if (!c.var.user!.profile) return c.redirect("/onboarding/basics");
  // Came in through /international: start the Bangkok story on "expat" (they can change it).
  return page(c, { title: TITLE, bare: true }, <YouForm v={view(c)} next={youNext(c)} storyHint={getCookie(c, INTERNATIONAL_COOKIE) === "1" ? "expat" : undefined} />);
});

onboarding.post("/you", async (c) => {
  const v = view(c);
  const user = c.var.user!;
  if (!user.profile) return c.redirect("/onboarding/basics");
  const next = youNext(c);
  const body = await c.req.parseBody({ all: true });
  const pickAll = (key: string, allowed: string[]) => list(body[key]).filter((x) => allowed.includes(x));
  const languages = pickAll("languages", values(LANGUAGES));
  const interests = [...new Set(pickAll("interests", INTEREST_VALUES))];
  const groupSize = GROUP_SIZES.some((g) => g.value === str(body.groupSize)) ? str(body.groupSize) : undefined;
  const times = [...new Set(pickAll("times", TIME_WINDOWS.map((x) => x.value)))];
  // Small / big group follow the group size answer (seating reads them).
  const socialStyles = withGroupStyle(pickAll("socialStyles", values(SOCIAL_STYLES)), groupSize);
  const intents = pickAll("intents", values(INTENTS)).filter((i) => i !== "romance");
  if (languages.length === 0 || interests.length === 0) {
    return page(c, { title: TITLE, status: 400, bare: true }, <YouForm v={v} next={next} error={v.t("เลือกภาษาและความสนใจอย่างน้อยอย่างละ 1", "Pick at least one language and one interest.")} />);
  }
  if (interests.length > MAX_INTERESTS) {
    return page(
      c,
      { title: TITLE, status: 400, bare: true },
      <YouForm v={v} next={next} error={v.t(`เลือกความสนใจได้ไม่เกิน ${MAX_INTERESTS} อย่าง`, `Pick at most ${MAX_INTERESTS} interests.`)} />,
    );
  }
  // Keep romance if it was already on; this form only edits non-romance intents.
  const keepRomance = user.profile.intents.includes("romance") ? ["romance"] : [];
  await getDb(c.env)
    .update(profiles)
    .set({
      languages,
      interests,
      socialStyles,
      intents: [...(intents.length ? intents : ["friends"]), ...keepRomance],
      // Card D3: this flow asks only what seating uses. Work, study, keeping in touch, time in Bangkok,
      // hometown and pronouns live in Settings now, so what's stored there is kept as it is.
      bio: (() => {
        const old = cleanBio(user.profile.bio);
        return { ...old, groupSize, times, ...parseBangkok(str(body.story), old.bkkTime ?? "", old.hometown ?? "", old.guide ? "1" : "") };
      })(),
      updatedAt: new Date(),
    })
    .where(eq(profiles.accountId, user.account.id));
  return c.redirect(next);
});

// ---------------------------------------------------------- connections --

/** Used by Settings (one form). Onboarding uses the same field names, split into screens. */
export function ConnectionsFields(props: { v: View }) {
  const { t, lang } = props.v;
  const p = props.v.user?.profile;
  const openTo = p?.romanceOpenTo;
  return (
    <>
      <Select
        label={t("สถานะความสัมพันธ์ (ส่วนตัว ไม่แสดงต่อผู้อื่น)", "Relationship status (private, never shown)")}
        name="relationship"
        options={RELATIONSHIP}
        value={p?.relationship ?? "prefer_not"}
        lang={lang}
      />
      <div class="grid2">
        <Field label={t("อายุต่ำสุดที่อยากรู้จัก", "Youngest you'd like to connect with")} name="ageMin" type="number" min={18} max={99} value={p?.ageMin ?? 18} />
        <Field label={t("อายุสูงสุดที่อยากรู้จัก", "Oldest you'd like to connect with")} name="ageMax" type="number" min={18} max={99} value={p?.ageMax ?? 99} />
      </div>
      <small>{t("ใช้หลังกิจกรรมเท่านั้น และเป็นความลับ", "Only used after events, and kept private.")}</small>
      <WomenOnlyFields v={props.v} />
      <details open={!!p?.romanceOn}>
        <summary>{t("เปิดใจมากกว่าเพื่อน (ไม่บังคับ เฉพาะคนโสด)", "Open to something more (optional, Single only)")}</summary>
        <p class="muted">{t(ROMANCE_INFO[0], ROMANCE_INFO[1])}</p>
        <RomanceFields v={props.v} openTo={openTo} />
        <PronounField v={props.v} value={p?.pronouns} />
        <Toggle name="showPronouns" label={t("แสดงสรรพนามในโปรไฟล์", "Show my pronouns on my profile")} checked={!!p?.showPronouns} />
        <p class="muted">{t(ROMANCE_EXPLAINER.th, ROMANCE_EXPLAINER.en)}</p>
        <Toggle name="romanceConsent" label={t("ยินยอมให้เก็บข้อมูลส่วนนี้ (ข้อมูลอ่อนไหวตาม PDPA)", "I consent to this sensitive data being stored (PDPA)")} checked={!!p?.romanceOn} />
      </details>
    </>
  );
}

const ROMANCE_INFO: [string, string] = [
  "ค่าเริ่มต้นคือโหมดเพื่อน ถ้าเปิดโหมดนี้ คุณจะเลือก 'เปิดใจมากกว่าเพื่อน' กับคนที่เจอหลังกิจกรรมได้ และจะรู้ผลก็ต่อเมื่ออีกฝ่ายเลือกเหมือนกัน ข้อมูลด้านล่างเป็นความลับ เจ้าหน้าที่ดูไม่ได้ และจะถูกลบเมื่อคุณปิดโหมดนี้",
  "Friends-only is the default. If you switch this on, you can choose 'open to something more' after events, and you'll only find out if it's mutual. The details below are private, invisible to staff, and deleted when you switch this off.",
];

function RomanceFields(props: { v: View; openTo: string[] | "everyone" | null | undefined; on?: boolean }) {
  const { t, lang } = props.v;
  const p = props.v.user?.profile;
  const openTo = props.openTo;
  return (
    <>
      <Toggle name="romanceOn" label={t("เปิดโหมดนี้", "Switch this on")} checked={props.on ?? !!p?.romanceOn} />
      <Select label={t("อัตลักษณ์ทางเพศของคุณ (ไม่บังคับ)", "Your gender identity (optional)")} name="genderIdentity" options={GENDER_IDENTITIES} value={p?.genderIdentity} lang={lang} blank="-" />
      {/* "Self-described" gets somewhere to describe it: private, deleted with romance mode. */}
      <div data-dating-self hidden={p?.genderIdentity === "self" ? undefined : true}>
        <Field label={t("อธิบายด้วยคำของคุณเอง (เป็นความลับ)", "In your own words (private)")} name="datingGenderSelf" value={cleanBio(p?.bio).datingGenderSelf} maxlength={30} />
      </div>
      <Script
        dangerouslySetInnerHTML={{
          __html: `(function(){var w=document.currentScript.previousElementSibling,s=w&&w.parentNode.querySelector('select[name="genderIdentity"]');if(!s)return;s.addEventListener("change",function(){w.hidden=s.value!=="self"})})();`,
        }}
      />
      <Choices
        legend={t("อยากเจอ…", "Open to meeting…")}
        name="romanceOpenTo"
        options={[{ value: "everyone", th: "ทุกคน", en: "Everyone" }, ...GENDER_IDENTITIES.filter((g) => g.value !== "prefer_not" && g.value !== "self")]}
        values={openTo === "everyone" ? ["everyone"] : Array.isArray(openTo) ? openTo : []}
        lang={lang}
      />
      <Select label={t("รสนิยมทางเพศของคุณ (ไม่บังคับ)", "Your orientation (optional)")} name="orientation" options={ORIENTATIONS} value={p?.orientation} lang={lang} blank="-" />
      <Choices
        legend={t("แมตช์เฉพาะคนที่เป็น… (ไม่บังคับ ถ้าไม่เลือกเลย = ทุกคน)", "Only match people who are… (optional; none ticked = anyone)")}
        name="orientationOpenTo"
        options={ORIENTATIONS}
        values={p?.orientationOpenTo ?? []}
        lang={lang}
      />
      <Toggle
        name="showDatingPrefs"
        label={t("แสดงสรรพนาม รสนิยม และคนที่อยากเจอ ให้สมาชิกที่เปิดใจมากกว่าเพื่อนเหมือนกันเห็น", "Show my pronouns, orientation and who I'm open to, to members who are also open to dating")}
        hint={t("ไม่บังคับ คนที่อยู่โหมดเพื่อนจะไม่เห็นเลย", "Optional. Friends-only members never see it.")}
        checked={!!p?.showDatingPrefs}
      />
    </>
  );
}

/** Optional women-only spaces. The gender here is private and never shown. */
export function WomenOnlyFields(props: { v: View }) {
  const { t, lang } = props.v;
  const p = props.v.user?.profile;
  const eligible = canBeWomenOnly(p?.gender);
  // The women-only option only exists for women and non-binary members: it is
  // hidden for everyone else, and appears the moment one of those is picked.
  return (
    <fieldset class="card" data-women-fields>
      <legend>{t("เพศของคุณ (ไม่บังคับ)", "Your gender (optional)")}</legend>
      <Select label={t("เพศของคุณ (เป็นความลับ ไม่แสดงต่อใคร)", "Your gender (private, never shown)")} name="gender" options={GENDER_IDENTITIES} value={p?.gender} lang={lang} blank="-" />
      <div data-gender-self hidden={p?.gender === "self" ? undefined : true}>
        <Field label={t("อธิบายด้วยคำของคุณเอง (เป็นความลับ)", "In your own words (private)")} name="genderSelf" value={cleanBio(p?.bio).genderSelf} maxlength={30} />
      </div>
      <div data-women-only hidden={eligible ? undefined : true}>
        <Toggle
          name="womenOnly"
          label={t("🌸 บัดดี้ การ์ด แมตช์ และแชต เฉพาะผู้หญิงและนอนไบนารี", "🌸 Women & non-binary only: buddies, the deck, matches and chats")}
          hint={t("คุณจะเห็นกิจกรรมเฉพาะผู้หญิงและนอนไบนารีด้วย ไม่ว่าจะเปิดตัวเลือกนี้หรือไม่", "You'll also see women & non-binary events, whether or not this is on.")}
          checked={!!p?.womenOnly}
        />
      </div>
      <Script
        dangerouslySetInnerHTML={{
          __html: `(function(){var f=document.currentScript.parentNode,s=f.querySelector('select[name="gender"]'),w=f.querySelector("[data-women-only]"),g=f.querySelector("[data-gender-self]");if(!s||!w)return;s.addEventListener("change",function(){var ok=s.value==="woman"||s.value==="non-binary";w.hidden=!ok;if(!ok){var c=w.querySelector("input");if(c)c.checked=false}if(g)g.hidden=s.value!=="self"})})();`,
        }}
      />
    </fieldset>
  );
}

/** The bio with the self-described gender set, or removed (and the dating one, when given). */
export function withGenderSelf<B extends object>(bio: B, genderSelf: string | null, datingGenderSelf?: string | null): B {
  const { genderSelf: _old, datingGenderSelf: _oldDating, ...rest } = bio as B & { genderSelf?: string; datingGenderSelf?: string };
  const keep = datingGenderSelf === undefined ? (_oldDating ? { datingGenderSelf: _oldDating } : {}) : datingGenderSelf ? { datingGenderSelf } : {};
  return { ...rest, ...(genderSelf ? { genderSelf } : {}), ...keep } as B;
}

/** Shared by onboarding and Settings: validates and returns the profile patch. */
export async function connectionsPatch(
  body: Record<string, unknown>,
  current: { relationship: string; lastSingleSwitchAt: Date | null },
): Promise<{ patch: Partial<typeof profiles.$inferInsert>; romanceConsent: boolean | null; genderSelf: string | null; datingGenderSelf: string | null } | { error: [string, string] }> {
  const relationship = values(RELATIONSHIP).includes(str(body.relationship)) ? str(body.relationship) : "prefer_not";
  // Whole years only (the columns are integers; "30.5" used to be a 500).
  const ageMin = Math.max(18, Math.min(99, Math.trunc(Number(str(body.ageMin))) || 18));
  const ageMax = Math.max(ageMin, Math.min(99, Math.trunc(Number(str(body.ageMax))) || 99));
  const switchingToSingle = relationship === "single" && current.relationship !== "single";
  if (switchingToSingle && !canSwitchToSingle(current.lastSingleSwitchAt)) {
    return { error: ["เปลี่ยนเป็น 'โสด' ได้ไม่เกิน 1 ครั้งใน 30 วัน", "You can switch to Single at most once every 30 days."] };
  }
  const wantsRomance = str(body.romanceOn) === "1" && relationship === "single";
  const consent = str(body.romanceConsent) === "1";
  if (wantsRomance && !consent) {
    return { error: ["ต้องให้ความยินยอมก่อนเปิดโหมดนี้", "Please give consent before switching romance mode on."] };
  }
  const openToRaw = list(body.romanceOpenTo);
  const identities = values(GENDER_IDENTITIES);
  const openTo: string[] | "everyone" | null = openToRaw.includes("everyone")
    ? "everyone"
    : openToRaw.filter((x) => identities.includes(x)).length
      ? openToRaw.filter((x) => identities.includes(x))
      : null;
  const identity = identities.includes(str(body.genderIdentity)) ? str(body.genderIdentity) : null;
  const pronouns = str(body.pronouns).slice(0, 30) || null;
  const gender = identities.includes(str(body.gender)) ? str(body.gender) : null;
  const orientations = values(ORIENTATIONS);
  const orientation = orientations.includes(str(body.orientation)) ? str(body.orientation) : null;
  const orientationOpenTo = [...new Set(list(body.orientationOpenTo).filter((x) => orientations.includes(x)))];
  const patch: Partial<typeof profiles.$inferInsert> = {
    relationship,
    ageMin,
    ageMax,
    pronouns,
    gender,
    womenOnly: canBeWomenOnly(gender) && str(body.womenOnly) === "1",
    showPronouns: !!pronouns && str(body.showPronouns) === "1",
    updatedAt: new Date(),
    ...(switchingToSingle ? { lastSingleSwitchAt: new Date() } : {}),
  };
  if (wantsRomance) {
    Object.assign(patch, {
      romanceOn: true,
      genderIdentity: identity,
      romanceOpenTo: openTo ?? "everyone",
      orientation,
      orientationOpenTo: orientationOpenTo.length ? orientationOpenTo : null,
      showDatingPrefs: str(body.showDatingPrefs) === "1",
    });
  } else {
    // Off (or not Single): delete the sensitive fields immediately (PRD §3.4).
    Object.assign(patch, { romanceOn: false, genderIdentity: null, romanceOpenTo: null, orientation: null, orientationOpenTo: null, showDatingPrefs: false });
  }
  // Self-described gender: the member's own words, kept only while "self" is picked.
  const genderSelf = gender === "self" ? str(body.genderSelf).slice(0, 30) || null : null;
  const datingGenderSelf = wantsRomance && identity === "self" ? str(body.datingGenderSelf).slice(0, 30) || null : null;
  return { patch, romanceConsent: wantsRomance ? true : current.relationship === "single" ? false : null, genderSelf, datingGenderSelf };
}

function ConnectionsFlow(props: { v: View; j: Journey; error?: string; start?: number; mode?: string }) {
  const { t, lang } = props.v;
  const p = props.v.user?.profile;
  const rel = p?.relationship ?? "prefer_not";
  return (
    <Flow
      v={props.v}
      submit={t("ต่อไป", "Next")}
      journey={props.j}
      start={props.start}
      error={props.error ? <Notice kind="error">{props.error}</Notice> : undefined}
      extra={
        <button type="submit" class="skip" name="skip" value="1" formnovalidate>
          {t("ข้ามไปก่อน", "Skip for now")}
        </button>
      }
    >
      <FlowStep emoji="🔒" title={t("เรื่องส่วนตัว ไม่บังคับ", "Just for you, all optional")} hint={t("ไม่แสดงต่อใคร ใช้หลังกิจกรรมเท่านั้น เปลี่ยนได้ในการตั้งค่า", "Never shown to anyone, only used after events. Change it in Settings.")}>
        <p class="field-label" id="rel-h">{t("สถานะความสัมพันธ์", "Relationship status")}</p>
        <div class="answers" role="radiogroup" aria-labelledby="rel-h">
          {RELATIONSHIP.map((o) => (
            <AnswerCard name="relationship" value={o.value} label={lang === "en" ? o.en : o.th} checked={rel === o.value} />
          ))}
        </div>
        <p class="field-label">{t("อยากรู้จักคนช่วงอายุไหน?", "Which ages would you like to connect with?")}</p>
        <div class="grid2" style="grid-template-columns:1fr 1fr">
          <Field label={t("ตั้งแต่", "From")} name="ageMin" type="number" min={18} max={99} value={p?.ageMin ?? 18} />
          <Field label={t("ถึง", "To")} name="ageMax" type="number" min={18} max={99} value={p?.ageMax ?? 99} />
        </div>
        <WomenOnlyFields v={props.v} />
      </FlowStep>
      {props.mode === "friends" && !p?.romanceOn ? null : (
      <FlowStep
        emoji="💘"
        title={t("เปิดใจมากกว่าเพื่อน?", "Open to something more?")}
        hint={t("ไม่บังคับ เฉพาะคนโสด ค่าเริ่มต้นคือโหมดเพื่อน", "Optional, Single only. Friends-only by default.")}
        info={t(ROMANCE_INFO[0], ROMANCE_INFO[1])}
      >
        <RomanceFields v={props.v} openTo={p?.romanceOpenTo} on={props.mode === "dating" || props.mode === "dating_only" ? true : undefined} />
        <p class="muted">{t(ROMANCE_EXPLAINER.th, ROMANCE_EXPLAINER.en)}</p>
        <Toggle name="romanceConsent" label={t("ยินยอมให้เก็บข้อมูลส่วนนี้ (ข้อมูลอ่อนไหวตาม PDPA)", "I consent to this sensitive data being stored (PDPA)")} checked={!!p?.romanceOn} />
      </FlowStep>
      )}
    </Flow>
  );
}

onboarding.get("/connections", (c) => {
  const v = view(c);
  if (!v.user!.profile) return c.redirect("/onboarding/basics");
  return page(c, { title: TITLE, bare: true }, <ConnectionsFlow v={v} j={journeyFor(c, "connections")} mode={getCookie(c, INTENT_COOKIE)} />);
});

onboarding.post("/connections", async (c) => {
  const v = view(c);
  const user = c.var.user!;
  const p = user.profile;
  if (!p) return c.redirect("/onboarding/basics");
  // "Skip for now": keep the private defaults (prefer not to say, ages 18 to 99, friends only).
  const body = await c.req.parseBody({ all: true });
  if (str(body.skip) === "1") return c.redirect("/onboarding/wellbeing");
  // Pronouns live in the table intro now; keep whatever is already saved.
  if (body.pronouns === undefined) {
    body.pronouns = p.pronouns ?? "";
    if (p.showPronouns) body.showPronouns = "1";
  }
  const result = await connectionsPatch(body, p);
  if ("error" in result) {
    const start = result.error[1].includes("consent") ? 1 : 0;
    return page(c, { title: TITLE, status: 400, bare: true }, <ConnectionsFlow v={v} j={journeyFor(c, "connections")} error={v.t(...result.error)} start={start} mode={getCookie(c, INTENT_COOKIE)} />);
  }
  const db = getDb(c.env);
  const intents = p.intents.filter((i) => i !== "romance");
  const queries = [
    db
      .update(profiles)
      // Dating prompts exist only while romance mode is on.
      .set({ ...result.patch, intents: result.patch.romanceOn ? [...intents, "romance"] : intents, bio: withGenderSelf(result.patch.romanceOn ? cleanBio(p.bio) : withoutDating(cleanBio(p.bio)), result.genderSelf, result.datingGenderSelf) })
      .where(eq(profiles.accountId, user.account.id)),
  ];
  if (result.romanceConsent !== null) queries.push(consentRow(db, user.account.id, ROMANCE_CONSENT, result.romanceConsent) as never);
  if (result.patch.romanceOn) {
    // The romance_data yes is in this batch, so the onboarding dating answers can be saved now (R1).
    const pending = pendingDatingIntent(c, db, user.account.id);
    if (pending) queries.push(pending as never);
  } else {
    // Romance off: no dating intents, saved or waiting (R1, R2).
    dropPendingDating(c);
    queries.push(...(consentEffects(db, user.account.id, ROMANCE_CONSENT, false, null) as never[]));
  }
  // R3: giving a relationship status or a private gender records that consent.
  queries.push(...((await privateFieldConsents(db, user.account.id, { relationship: result.patch.relationship, gender: result.patch.gender })) as never[]));
  await batch(c.env, queries);
  return c.redirect("/onboarding/wellbeing");
});

// ------------------------------------------------------------ wellbeing --

/** UCLA 3-item loneliness scale (1 hardly ever – 3 often). */
export const UCLA3: [string, string][] = [
  ["คุณรู้สึกว่าขาดเพื่อนบ่อยแค่ไหน", "How often do you feel that you lack companionship?"],
  ["คุณรู้สึกเป็นคนนอกบ่อยแค่ไหน", "How often do you feel left out?"],
  ["คุณรู้สึกโดดเดี่ยวจากผู้อื่นบ่อยแค่ไหน", "How often do you feel isolated from others?"],
];
export const UCLA_SCALE = [
  { value: "1", th: "แทบไม่เคย", en: "Hardly ever" },
  { value: "2", th: "บางครั้ง", en: "Some of the time" },
  { value: "3", th: "บ่อย", en: "Often" },
];

async function hasResearchConsent(env: AppEnv["Bindings"], accountId: string): Promise<boolean> {
  const [row] = await getDb(env)
    .select({ granted: consents.granted })
    .from(consents)
    .where(and(eq(consents.accountId, accountId), eq(consents.category, "research")))
    .orderBy(desc(consents.createdAt))
    .limit(1);
  return !!row?.granted;
}

async function finish(c: { env: AppEnv["Bindings"] }, accountId: string) {
  await getDb(c.env).update(profiles).set({ onboardedAt: new Date() }).where(eq(profiles.accountId, accountId));
}

/** The last step can only finish onboarding once consents and interests are in. */
async function unfinishedStep(c: Context<AppEnv>, user: CurrentUser): Promise<Step | null> {
  const step = await nextStep(c, user);
  return step === "connections" || step === "done" ? null : step;
}

onboarding.get("/wellbeing", async (c) => {
  const v = view(c);
  const user = v.user!;
  const missing = await unfinishedStep(c, user);
  if (missing) return c.redirect(`/onboarding/${missing}`);
  if (!(await hasResearchConsent(c.env, user.account.id))) {
    await finish(c, user.account.id);
    // New members see the one-time guide first.
  return c.redirect("/guide");
  }
  const { t, lang } = v;
  return page(
    c,
    { title: TITLE, bare: true },
    <Flow
      v={v}
      submit={t("ส่งคำตอบ", "Send answers")}
      journey={journeyFor(c, "wellbeing")}
      extra={
        <button type="submit" class="skip" name="skip" value="1" formnovalidate>
          {t("ข้ามไปก่อน", "Skip for now")}
        </button>
      }
    >
      <FlowStep
        emoji="🌱"
        title={t("ช่วงนี้เป็นอย่างไรบ้าง", "How have you been lately?")}
        hint={t("ไม่บังคับ คำตอบไม่ผูกกับตัวตนของคุณ", "Optional. Not linked to your identity.")}
        info={t("ทำให้เรารู้ว่ากิจกรรมช่วยให้คนเหงาน้อยลงจริงไหม", "Helps us learn whether meetups reduce loneliness.")}
      >
        {UCLA3.map(([th, en], i) => (
          <>
            <p class="field-label" id={`ucla-${i + 1}`}>{t(th, en)}</p>
            <div class="answers" role="radiogroup" aria-labelledby={`ucla-${i + 1}`}>
              {UCLA_SCALE.map((o) => (
                <AnswerCard name={`q${i + 1}`} value={o.value} label={lang === "en" ? o.en : o.th} />
              ))}
            </div>
          </>
        ))}
      </FlowStep>
    </Flow>,
  );
});

onboarding.post("/wellbeing", async (c) => {
  const user = c.var.user!;
  const missing = await unfinishedStep(c, user);
  if (missing) return c.redirect(`/onboarding/${missing}`);
  const body = await c.req.parseBody();
  const answers = [body.q1, body.q2, body.q3].map((x) => Number(str(x)));
  if (str(body.skip) !== "1" && answers.every((n) => Number.isInteger(n) && n >= 1 && n <= 3) && user.account.researchId) {
    if (await hasResearchConsent(c.env, user.account.id)) {
      await getDb(c.env)
        .insert(wellbeing)
        .values({ id: newId(), researchId: user.account.researchId, phase: "baseline", q1: answers[0], q2: answers[1], q3: answers[2] })
        .onConflictDoNothing();
    }
  }
  await finish(c, user.account.id);
  // New members see the one-time guide first.
  return c.redirect("/guide");
});
