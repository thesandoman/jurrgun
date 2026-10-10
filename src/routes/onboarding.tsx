/**
 * Onboarding (PRD §5, §21): a light personality quiz, not a government form.
 * Every stage is a card flow (src/ui/flow.tsx): one decision per screen.
 *
 *   0 welcome      one splash screen
 *   1 quiz         Bangkok Vibe quiz (skippable) → type reveal (/onboarding/type)
 *   2 basics       nickname, birth date (18+ gate), district, lives-in-Bangkok
 *   3 privacy      required consents + code of conduct, then optional extras
 *   4 you          languages, interests (grouped, searchable), keeping in touch, social style, times, what you're here for
 *   5 connections  relationship (private), age preference, optional romance mode
 *   6 wellbeing    optional UCLA-3 baseline, only with research consent
 */
import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { and, desc, eq } from "drizzle-orm";
import { batch, getDb } from "../db";
import { ageOn, canSwitchToSingle, MIN_AGE } from "../domain/rules";
import {
  DISTRICTS,
  EVENT_STYLES,
  GENDER_IDENTITIES,
  INTENTS,
  LANGUAGES,
  RELATIONSHIP,
  SOCIAL_STYLES,
  values,
} from "../lib/constants";
import { newId } from "../lib/crypto";
import type { AppEnv, CurrentUser } from "../lib/env";
import type { Lang } from "../lib/i18n";
import { consents, profiles, wellbeing } from "../schema";
import { requireUser } from "../lib/session";
import { AnswerCard, Flow, FlowStep } from "../ui/flow";
import { Choices, Field, list, LinkButton, Notice, page, Select, str, Toggle, view, type View } from "../ui/kit";
import { cleanBio, COMM_STYLES, INTEREST_VALUES, isResidency, MAX_COMM, MAX_INTERESTS, parseBangkok, RESIDENCY, parseEducation, parseOccupation } from "../content/profile";
import { BangkokStory, CommPicker, EducationPicker, InterestPicker, OccupationPicker, ProfileFormScript } from "../ui/profile-form";
import { loadVibe, quizQuestions, quizSeed, QuizFlow, ResultView } from "./quiz";

export const onboarding = new Hono<AppEnv>();
onboarding.use("*", requireUser);

// Once onboarded, the onboarding steps are closed: they would otherwise let a
// member rewrite fields Settings deliberately locks (birth date, which drives
// event age ranges and the private age preference).
const STEP_PATHS = new Set(["/onboarding/basics", "/onboarding/privacy", "/onboarding/you", "/onboarding/connections", "/onboarding/wellbeing"]);
onboarding.use("*", async (c, next) => {
  if (c.var.user?.profile?.onboardedAt && STEP_PATHS.has(new URL(c.req.url).pathname)) return c.redirect("/events");
  await next();
});

const STEPS = ["welcome", "quiz", "basics", "privacy", "you", "connections", "wellbeing"] as const;
type Step = (typeof STEPS)[number];
const stage = (s: Step) => ({ at: STEPS.indexOf(s), of: STEPS.length });

export const CONSENT_VERSION = "2026-10-proto";
export const QUIZ_SKIP_COOKIE = "bkk_quiz_skip";

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
  if (p.interests.length === 0) return "you";
  return "connections";
}

const TITLE = "Onboarding";

onboarding.get("/", async (c) => {
  const step = await nextStep(c, c.var.user!);
  return c.redirect(step === "done" ? "/events" : `/onboarding/${step}`);
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

onboarding.get("/welcome", (c) => {
  const { t } = view(c);
  return page(
    c,
    { title: TITLE, bare: true },
    <>
      <div class="flow-top">
        <div class="flow-progress"><i style="width:4%" /></div>
      </div>
      <div class="splash">
        <div class="splash-mark" aria-hidden="true">◐</div>
        <h1>{t("ยินดีต้อนรับสู่ Jurrgun", "Welcome to Jurrgun")}</h1>
        <p class="muted">{t("เจอเพื่อนใหม่ในกลุ่มเล็ก ที่สถานที่จริงในกรุงเทพฯ", "New friends, small groups, real Bangkok places.")}</p>
      </div>
      <div class="tiles">
        <span class="tile"><b>🧭</b>{t("ค้นหาไทป์ของคุณ", "Find your type")}</span>
        <span class="tile"><b>👥</b>{t("โต๊ะละ 4 ถึง 6 คน", "Tables of 4 to 6")}</span>
        <span class="tile"><b>🔒</b>{t("เป็นส่วนตัวเสมอ", "Private by default")}</span>
      </div>
      <div class="flow-bar">
        <LinkButton href="/onboarding/quiz">{t("ไปกันเลย", "Let's go")}</LinkButton>
      </div>
    </>,
  );
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
    <QuizFlow v={v} questions={quizQuestions(seed, row)} seed={seed} next="/onboarding/type" stage={stage("quiz")} skipAction="/onboarding/quiz/skip" />,
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
    <ResultView v={v} row={row} reveal continueHref="/onboarding" continueLabel={v.t("ต่อไป", "Continue")} visibilityNext="/onboarding/type" />,
  );
});

// --------------------------------------------------------------- basics --

function BasicsForm(props: { v: View; values?: Record<string, string>; error?: string; start?: number }) {
  const { t, lang } = props.v;
  const p = props.v.user?.profile;
  const val = props.values ?? {};
  return (
    <Flow v={props.v} submit={t("ต่อไป", "Next")} stage={stage("basics")} start={props.start} error={props.error ? <Notice kind="error">{props.error}</Notice> : undefined}>
      <FlowStep emoji="👋" title={t("อยากให้เพื่อนเรียกว่าอะไร?", "What should people call you?")}>
        <Field label={t("ชื่อเล่น", "Nickname")} name="nickname" value={val.nickname ?? p?.nickname} required maxlength={30} autocomplete="nickname" />
      </FlowStep>
      <FlowStep emoji="🎂" title={t("วันเกิดของคุณ", "When's your birthday?")} hint={t("สำหรับ 18+ เท่านั้น ไม่แสดงต่อผู้อื่น", "18+ only. Never shown to others.")}>
        <Field label={t("วันเกิด", "Date of birth")} name="birthDate" type="date" value={val.birthDate ?? p?.birthDate} required />
      </FlowStep>
      <FlowStep emoji="📍" title={t("ส่วนใหญ่อยู่เขตไหน?", "Where do you spend your week?")}>
        <Select label={t("เขต", "District")} name="district" options={DISTRICTS} value={val.district ?? p?.district} lang={lang} required blank={t("เลือกเขต", "Choose a district")} />
      </FlowStep>
      <FlowStep
        emoji="🏙️"
        title={t("ตอนนี้คุณกับกรุงเทพฯ", "You and Bangkok right now")}
        hint={t("ทุกคนที่อยู่ในหรือรอบ ๆ กรุงเทพฯ ร่วมได้ ทะเบียนบ้านอยู่ที่ไหนก็ได้", "Anyone in or around Bangkok can join. Your household registration can be anywhere.")}
      >
        <div class="answers">
          {RESIDENCY.map((o) => (
            <AnswerCard name="residency" value={o.value} label={lang === "en" ? o.en : o.th} emoji={o.emoji} required checked={(val.residency ?? cleanBio(p?.bio).residency ?? (p ? "lives" : "")) === o.value} />
          ))}
        </div>
        <Toggle name="newcomer" label={t("ฉันเพิ่งมาถึงกรุงเทพฯ", "I'm new in town")} checked={val.newcomer === "1" || !!p?.newcomer} />
      </FlowStep>
    </Flow>
  );
}

onboarding.get("/basics", (c) => page(c, { title: TITLE, bare: true }, <BasicsForm v={view(c)} />));

onboarding.post("/basics", async (c) => {
  const v = view(c);
  const { t } = v;
  const user = c.var.user!;
  const body = await c.req.parseBody();
  const vals = {
    nickname: str(body.nickname).slice(0, 30),
    birthDate: str(body.birthDate),
    district: str(body.district),
    // "livesInBangkok=1" is the old single checkbox (a page left open mid-sign-up).
    residency: str(body.residency) || (str(body.livesInBangkok) === "1" ? "lives" : ""),
    newcomer: str(body.newcomer),
  };
  const fail = (error: string, start: number) => page(c, { title: TITLE, status: 400, bare: true }, <BasicsForm v={v} values={vals} error={error} start={start} />);
  if (!vals.nickname) return fail(t("กรอกชื่อเล่น", "Please add a nickname."), 0);
  // A real calendar date: "1990-02-31" passes the pattern but isn't one.
  const parsed = new Date(`${vals.birthDate}T00:00:00Z`);
  const realDate = /^\d{4}-\d{2}-\d{2}$/.test(vals.birthDate) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === vals.birthDate;
  if (!realDate) return fail(t("กรอกวันเกิด", "Please add your date of birth."), 1);
  const age = ageOn(vals.birthDate);
  if (!(age >= MIN_AGE && age < 120)) return fail(t("Jurrgun สำหรับผู้มีอายุ 18 ปีขึ้นไปเท่านั้น", "Jurrgun is for adults aged 18 and over."), 1);
  if (!values(DISTRICTS).includes(vals.district)) return fail(t("เลือกเขต", "Please choose a district."), 2);
  if (!isResidency(vals.residency)) return fail(t("เลือกว่าตอนนี้คุณอยู่กับกรุงเทพฯ แบบไหน", "Please pick how you're in Bangkok right now."), 3);

  const db = getDb(c.env);
  const bio = { ...cleanBio(user.profile?.bio), residency: vals.residency };
  const data = { nickname: vals.nickname, birthDate: vals.birthDate, district: vals.district, newcomer: vals.newcomer === "1", bio, locale: v.lang, updatedAt: new Date() };
  if (user.profile) await db.update(profiles).set(data).where(eq(profiles.accountId, user.account.id));
  else await db.insert(profiles).values({ accountId: user.account.id, ...data });
  return c.redirect("/onboarding/privacy");
});

// -------------------------------------------------------------- privacy --

const CONSENT_ITEMS: { key: string; required: boolean; emoji: string; th: string; en: string }[] = [
  { key: "service", required: true, emoji: "🎟️", th: "บัญชีและบริการกิจกรรม", en: "Account and events" },
  { key: "safety", required: true, emoji: "🛡️", th: "ความปลอดภัยและการดูแลชุมชน", en: "Safety and moderation" },
  { key: "personalization", required: false, emoji: "🪑", th: "จัดโต๊ะตามความสนใจ", en: "Seat me by my interests" },
  { key: "research", required: false, emoji: "📊", th: "City Pulse วิจัยเมืองแบบไม่ระบุตัวตน", en: "City Pulse anonymous research" },
  { key: "notifications", required: false, emoji: "🔔", th: "แจ้งเตือนกิจกรรม", en: "Event reminders" },
];

function PrivacyForm(props: { v: View; error?: string }) {
  const { t } = props.v;
  return (
    <Flow v={props.v} submit={t("ต่อไป", "Next")} stage={stage("privacy")} error={props.error ? <Notice kind="error">{props.error}</Notice> : undefined}>
      <FlowStep
        emoji="🤝"
        title={t("สิ่งที่จำเป็น", "The must-haves")}
        hint={t("ต้องมี 3 ข้อนี้เพื่อใช้งาน", "These three keep the app working and safe.")}
        info={
          <>
            <p>
              {t(
                "บริการ: ใช้บัญชีและการจองกิจกรรมของคุณ ความปลอดภัย: ใช้ตรวจสอบรายงานและป้องกันการคุกคาม",
                "Service: your account and bookings. Safety: used to review reports and prevent harassment.",
              )}
            </p>
            <p>
              <a href="/privacy" target="_blank">{t("นโยบายความเป็นส่วนตัว", "Privacy notice")}</a> ·{" "}
              <a href="/code-of-conduct" target="_blank">{t("หลักปฏิบัติของชุมชน", "Code of conduct")}</a>
            </p>
          </>
        }
      >
        {CONSENT_ITEMS.filter((i) => i.required).map((i) => (
          <MustToggle name={`consent_${i.key}`} label={`${i.emoji} ${t(i.th, i.en)}`} checked />
        ))}
        <MustToggle name="conduct" label={`📜 ${t("ฉันยอมรับหลักปฏิบัติของชุมชน", "I agree to the code of conduct")}`} />
      </FlowStep>
      <FlowStep
        emoji="✨"
        title={t("ตัวเลือกเพิ่มเติม", "Optional extras")}
        hint={t("เปลี่ยนได้ทุกเมื่อในการตั้งค่า", "Change any of these later in Settings.")}
        info={t(
          "จัดโต๊ะ: ใช้ความสนใจและภาษาของคุณ City Pulse: กทม. เห็นเฉพาะภาพรวมจากอย่างน้อย 10 คน แจ้งเตือน: เตือนก่อนงานและเมื่อมีที่ว่าง",
          "Seating uses your interests and languages. City Pulse: BMA only sees totals from 10 or more people. Reminders: before events and when a spot opens.",
        )}
      >
        {CONSENT_ITEMS.filter((i) => !i.required).map((i) => (
          <Toggle name={`consent_${i.key}`} label={`${i.emoji} ${t(i.th, i.en)}`} />
        ))}
      </FlowStep>
    </Flow>
  );
}

onboarding.get("/privacy", (c) => {
  if (!c.var.user!.profile) return c.redirect("/onboarding/basics");
  return page(c, { title: TITLE, bare: true }, <PrivacyForm v={view(c)} />);
});

onboarding.post("/privacy", async (c) => {
  const v = view(c);
  const user = c.var.user!;
  if (!user.profile) return c.redirect("/onboarding/basics");
  const body = await c.req.parseBody();
  const granted = (k: string) => str(body[`consent_${k}`]) === "1";
  if (!granted("service") || !granted("safety") || str(body.conduct) !== "1") {
    return page(
      c,
      { title: TITLE, status: 400, bare: true },
      <PrivacyForm v={v} error={v.t("ต้องยอมรับบริการ ความปลอดภัย และหลักปฏิบัติ เพื่อใช้งานต่อ", "Service, safety and the code of conduct are needed to continue.")} />,
    );
  }
  const db = getDb(c.env);
  await batch(
    c.env,
    CONSENT_ITEMS.map((i) =>
      db.insert(consents).values({ id: newId(), accountId: user.account.id, category: i.key, granted: granted(i.key), version: CONSENT_VERSION }),
    ),
  );
  return c.redirect("/onboarding/you");
});

// ------------------------------------------------------------------ you --

function YouForm(props: { v: View; error?: string }) {
  const { t, lang } = props.v;
  const p = props.v.user?.profile;
  return (
    <>
    <Flow v={props.v} submit={t("ต่อไป", "Next")} stage={stage("you")} error={props.error ? <Notice kind="error">{props.error}</Notice> : undefined}>
      <FlowStep emoji="🗣️" title={t("พูดภาษาอะไรได้บ้าง?", "Which languages do you speak?")} need={1} needText={t("เลือกอย่างน้อย 1", "Pick at least one")}>
        <Pills name="languages" options={LANGUAGES} values={p?.languages.length ? p.languages : [lang]} lang={lang} />
      </FlowStep>
      <FlowStep
        emoji="🍜"
        title={t("สนใจอะไรบ้าง?", "What are you into?")}
        hint={t(`เลือก 1 ถึง ${MAX_INTERESTS} อย่าง ค้นหาได้`, `Pick 1 to ${MAX_INTERESTS}. You can search.`)}
        need={1}
        needText={t("เลือกอย่างน้อย 1", "Pick at least one")}
      >
        <InterestPicker v={props.v} values={p?.interests} />
      </FlowStep>
      <FlowStep emoji="🛺" title={t("คุณกับกรุงเทพฯ", "You and Bangkok")} hint={t("คนกรุงเทพฯ คนต่างจังหวัด หรือคนจากที่ไกล ทุกคนยินดีต้อนรับ ไม่บังคับ", "Locals, people from the provinces, from abroad: everyone's welcome. Optional.")}>
        <BangkokStory v={props.v} story={cleanBio(p?.bio).story} time={cleanBio(p?.bio).bkkTime} hometown={cleanBio(p?.bio).hometown} compact />
      </FlowStep>
      <FlowStep emoji="💼" title={t("ทำงานและเรียนอะไร?", "Work and study")} hint={t("ไม่บังคับ ข้ามได้", "Optional. You can skip this.")}>
        <OccupationPicker v={props.v} value={cleanBio(p?.bio).occupation} other={cleanBio(p?.bio).occupationOther} />
        <EducationPicker v={props.v} bio={cleanBio(p?.bio)} />
      </FlowStep>
      <FlowStep emoji="💬" title={t("ปกติติดต่อกับเพื่อนแบบไหน?", "How do you like to keep in touch?")} hint={t(`เลือกได้สูงสุด ${MAX_COMM} แบบ ข้ามได้`, `Pick up to ${MAX_COMM}, or skip`)}>
        <CommPicker v={props.v} values={cleanBio(p?.bio).comm} />
      </FlowStep>
      <FlowStep emoji="👥" title={t("ชอบเจอคนแบบไหน?", "How do you like to meet people?")}>
        <Pills name="socialStyles" options={SOCIAL_STYLES} values={p?.socialStyles} lang={lang} />
      </FlowStep>
      <FlowStep emoji="🕐" title={t("เวลาไหนสะดวกที่สุด?", "When suits you best?")} auto>
        <div class="answers">
          {EVENT_STYLES.map((o) => (
            <AnswerCard name="eventStyle" value={o.value} label={lang === "en" ? o.en : o.th} checked={p?.eventStyle === o.value} />
          ))}
        </div>
      </FlowStep>
      <FlowStep emoji="🎯" title={t("มาที่นี่เพื่อ…", "I'm here for…")}>
        <Pills name="intents" options={INTENTS} values={p?.intents ?? ["friends"]} lang={lang} />
      </FlowStep>
    </Flow>
    <ProfileFormScript />
    </>
  );
}

onboarding.get("/you", (c) => {
  if (!c.var.user!.profile) return c.redirect("/onboarding/basics");
  return page(c, { title: TITLE, bare: true }, <YouForm v={view(c)} />);
});

onboarding.post("/you", async (c) => {
  const v = view(c);
  const user = c.var.user!;
  if (!user.profile) return c.redirect("/onboarding/basics");
  const body = await c.req.parseBody({ all: true });
  const pickAll = (key: string, allowed: string[]) => list(body[key]).filter((x) => allowed.includes(x));
  const languages = pickAll("languages", values(LANGUAGES));
  const interests = [...new Set(pickAll("interests", INTEREST_VALUES))];
  const comm = [...new Set(pickAll("comm", COMM_STYLES.map((x) => x.value)))];
  const socialStyles = pickAll("socialStyles", values(SOCIAL_STYLES));
  const eventStyle = pickAll("eventStyle", values(EVENT_STYLES))[0] ?? null;
  const intents = pickAll("intents", values(INTENTS));
  if (languages.length === 0 || interests.length === 0) {
    return page(c, { title: TITLE, status: 400, bare: true }, <YouForm v={v} error={v.t("เลือกภาษาและความสนใจอย่างน้อยอย่างละ 1", "Pick at least one language and one interest.")} />);
  }
  if (interests.length > MAX_INTERESTS || comm.length > MAX_COMM) {
    return page(
      c,
      { title: TITLE, status: 400, bare: true },
      <YouForm v={v} error={v.t(`เลือกความสนใจได้ไม่เกิน ${MAX_INTERESTS} และสไตล์การสื่อสารไม่เกิน ${MAX_COMM}`, `Pick at most ${MAX_INTERESTS} interests and ${MAX_COMM} ways to keep in touch.`)} />,
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
      eventStyle,
      intents: [...(intents.length ? intents : ["friends"]), ...keepRomance],
      bio: { ...cleanBio(user.profile.bio), comm, ...parseOccupation(str(body.occupation), str(body.occupationOther)), ...parseEducation({ level: str(body.education), detail: str(body.educationDetail), university: str(body.university), universityName: str(body.universityName), gradYear: str(body.gradYear) }), ...parseBangkok(str(body.story), str(body.bkkTime), str(body.hometown), str(body.guide)) },
      updatedAt: new Date(),
    })
    .where(eq(profiles.accountId, user.account.id));
  return c.redirect("/onboarding/connections");
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
        label={t("สถานะความสัมพันธ์ (ส่วนตัว ไม่แสดงต่อผู้อื่น)", "Relationship status (private — never shown)")}
        name="relationship"
        options={RELATIONSHIP}
        value={p?.relationship ?? "prefer_not"}
        lang={lang}
      />
      <div class="grid2">
        <Field label={t("อายุต่ำสุดที่สะดวกเชื่อมต่อ", "Youngest you'd like to connect with")} name="ageMin" type="number" min={18} max={99} value={p?.ageMin ?? 18} />
        <Field label={t("อายุสูงสุดที่สะดวกเชื่อมต่อ", "Oldest you'd like to connect with")} name="ageMax" type="number" min={18} max={99} value={p?.ageMax ?? 99} />
      </div>
      <small>{t("ใช้หลังกิจกรรมเท่านั้น และเป็นความลับ", "Only used after events, and kept private.")}</small>
      <details open={!!p?.romanceOn}>
        <summary>{t("เปิดใจมากกว่าเพื่อน (ไม่บังคับ — เฉพาะคนโสด)", "Open to something more (optional — Single only)")}</summary>
        <p class="muted">{t(ROMANCE_INFO[0], ROMANCE_INFO[1])}</p>
        <RomanceFields v={props.v} openTo={openTo} />
        <Field label={t("สรรพนาม (ไม่บังคับ)", "Pronouns (optional)")} name="pronouns" value={p?.pronouns} maxlength={30} />
        <Toggle name="showPronouns" label={t("แสดงสรรพนามในโปรไฟล์", "Show my pronouns on my profile")} checked={!!p?.showPronouns} />
        <Toggle name="romanceConsent" label={t("ยินยอมให้เก็บข้อมูลส่วนนี้ (ข้อมูลอ่อนไหวตาม PDPA)", "I consent to this sensitive data being stored (PDPA)")} checked={!!p?.romanceOn} />
      </details>
    </>
  );
}

const ROMANCE_INFO: [string, string] = [
  "ค่าเริ่มต้นคือโหมดเพื่อนเท่านั้น หากเปิด คุณจะเลือก 'เปิดใจมากกว่าเพื่อน' ได้หลังกิจกรรม และจะรู้ก็ต่อเมื่ออีกฝ่ายเลือกเหมือนกัน ข้อมูลด้านล่างเป็นความลับ เจ้าหน้าที่ดูไม่ได้ และจะถูกลบเมื่อปิดโหมดนี้",
  "Friends-only is the default. If you switch this on, you can choose 'open to something more' after events, and you'll only find out if it's mutual. The details below are private, invisible to staff, and deleted when you switch this off.",
];

function RomanceFields(props: { v: View; openTo: string[] | "everyone" | null | undefined }) {
  const { t, lang } = props.v;
  const p = props.v.user?.profile;
  const openTo = props.openTo;
  return (
    <>
      <Toggle name="romanceOn" label={t("เปิดโหมดนี้", "Switch this on")} checked={!!p?.romanceOn} />
      <Select label={t("อัตลักษณ์ทางเพศของคุณ (ไม่บังคับ)", "Your gender identity (optional)")} name="genderIdentity" options={GENDER_IDENTITIES} value={p?.genderIdentity} lang={lang} blank="—" />
      <Choices
        legend={t("เปิดใจที่จะพบ…", "Open to meeting…")}
        name="romanceOpenTo"
        options={[{ value: "everyone", th: "ทุกคน", en: "Everyone" }, ...GENDER_IDENTITIES.filter((g) => g.value !== "prefer_not" && g.value !== "self")]}
        values={openTo === "everyone" ? ["everyone"] : Array.isArray(openTo) ? openTo : []}
        lang={lang}
      />
    </>
  );
}

/** Shared by onboarding and Settings: validates and returns the profile patch. */
export async function connectionsPatch(
  body: Record<string, unknown>,
  current: { relationship: string; lastSingleSwitchAt: Date | null },
): Promise<{ patch: Partial<typeof profiles.$inferInsert>; romanceConsent: boolean | null } | { error: [string, string] }> {
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
  const patch: Partial<typeof profiles.$inferInsert> = {
    relationship,
    ageMin,
    ageMax,
    pronouns,
    showPronouns: !!pronouns && str(body.showPronouns) === "1",
    updatedAt: new Date(),
    ...(switchingToSingle ? { lastSingleSwitchAt: new Date() } : {}),
  };
  if (wantsRomance) {
    Object.assign(patch, { romanceOn: true, genderIdentity: identity, romanceOpenTo: openTo ?? "everyone" });
  } else {
    // Off (or not Single): delete the sensitive fields immediately (PRD §3.4).
    Object.assign(patch, { romanceOn: false, genderIdentity: null, romanceOpenTo: null });
  }
  return { patch, romanceConsent: wantsRomance ? true : current.relationship === "single" ? false : null };
}

function ConnectionsFlow(props: { v: View; error?: string; start?: number }) {
  const { t, lang } = props.v;
  const p = props.v.user?.profile;
  const rel = p?.relationship ?? "prefer_not";
  return (
    <Flow v={props.v} submit={t("ต่อไป", "Next")} stage={stage("connections")} start={props.start} error={props.error ? <Notice kind="error">{props.error}</Notice> : undefined}>
      <FlowStep emoji="💬" title={t("สถานะความสัมพันธ์", "Relationship status")} hint={t("ส่วนตัว ไม่แสดงต่อใคร", "Private. Never shown to anyone.")} auto>
        <div class="answers">
          {RELATIONSHIP.map((o) => (
            <AnswerCard name="relationship" value={o.value} label={lang === "en" ? o.en : o.th} checked={rel === o.value} />
          ))}
        </div>
      </FlowStep>
      <FlowStep emoji="🎈" title={t("อยากเชื่อมต่อกับช่วงอายุไหน?", "Which ages would you like to connect with?")} hint={t("ใช้หลังกิจกรรมเท่านั้น และเป็นความลับ", "Only used after events. Private.")}>
        <div class="grid2" style="grid-template-columns:1fr 1fr">
          <Field label={t("ตั้งแต่", "From")} name="ageMin" type="number" min={18} max={99} value={p?.ageMin ?? 18} />
          <Field label={t("ถึง", "To")} name="ageMax" type="number" min={18} max={99} value={p?.ageMax ?? 99} />
        </div>
      </FlowStep>
      <FlowStep emoji="🏷️" title={t("สรรพนาม (ไม่บังคับ)", "Pronouns (optional)")}>
        <Field label={t("สรรพนาม", "Pronouns")} name="pronouns" value={p?.pronouns} maxlength={30} placeholder={t("เช่น she/her", "e.g. they/them")} />
        <Toggle name="showPronouns" label={t("แสดงในโปรไฟล์", "Show on my profile")} checked={!!p?.showPronouns} />
      </FlowStep>
      <FlowStep
        emoji="💘"
        title={t("เปิดใจมากกว่าเพื่อน?", "Open to something more?")}
        hint={t("ไม่บังคับ เฉพาะคนโสด ค่าเริ่มต้นคือเพื่อน", "Optional, Single only. Friends-only by default.")}
        info={t(ROMANCE_INFO[0], ROMANCE_INFO[1])}
      >
        <RomanceFields v={props.v} openTo={p?.romanceOpenTo} />
        <Toggle name="romanceConsent" label={t("ยินยอมให้เก็บข้อมูลส่วนนี้ (ข้อมูลอ่อนไหวตาม PDPA)", "I consent to this sensitive data being stored (PDPA)")} checked={!!p?.romanceOn} />
      </FlowStep>
    </Flow>
  );
}

onboarding.get("/connections", (c) => {
  const v = view(c);
  if (!v.user!.profile) return c.redirect("/onboarding/basics");
  return page(c, { title: TITLE, bare: true }, <ConnectionsFlow v={v} />);
});

onboarding.post("/connections", async (c) => {
  const v = view(c);
  const user = c.var.user!;
  const p = user.profile;
  if (!p) return c.redirect("/onboarding/basics");
  const body = await c.req.parseBody({ all: true });
  const result = await connectionsPatch(body, p);
  if ("error" in result) {
    const start = result.error[1].includes("consent") ? 3 : 0;
    return page(c, { title: TITLE, status: 400, bare: true }, <ConnectionsFlow v={v} error={v.t(...result.error)} start={start} />);
  }
  const db = getDb(c.env);
  const intents = p.intents.filter((i) => i !== "romance");
  const queries = [
    db.update(profiles).set({ ...result.patch, intents: result.patch.romanceOn ? [...intents, "romance"] : intents }).where(eq(profiles.accountId, user.account.id)),
  ];
  if (result.romanceConsent !== null) {
    queries.push(db.insert(consents).values({ id: newId(), accountId: user.account.id, category: "romance_data", granted: result.romanceConsent, version: CONSENT_VERSION }) as never);
  }
  await batch(c.env, queries);
  return c.redirect("/onboarding/wellbeing");
});

// ------------------------------------------------------------ wellbeing --

/** UCLA 3-item loneliness scale (1 hardly ever – 3 often). */
export const UCLA3: [string, string][] = [
  ["คุณรู้สึกว่าขาดเพื่อนบ่อยแค่ไหน", "How often do you feel that you lack companionship?"],
  ["คุณรู้สึกถูกทิ้งไว้ข้างหลังบ่อยแค่ไหน", "How often do you feel left out?"],
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
    return c.redirect("/events?notice=welcome");
  }
  const { t, lang } = v;
  return page(
    c,
    { title: TITLE, bare: true },
    <Flow
      v={v}
      submit={t("ส่งคำตอบ", "Submit")}
      stage={stage("wellbeing")}
      autoSubmit
      extra={
        <button type="submit" class="skip" name="skip" value="1" formnovalidate>
          {t("ข้าม", "Skip")}
        </button>
      }
    >
      {UCLA3.map(([th, en], i) => (
        <FlowStep
          emoji={i === 0 ? "🌱" : undefined}
          title={t(th, en)}
          hint={i === 0 ? t("ไม่บังคับ คำตอบไม่ผูกกับตัวตนของคุณ", "Optional. Not linked to your identity.") : undefined}
          info={i === 0 ? t("ช่วยให้ กทม. รู้ว่ากิจกรรมช่วยให้คนเหงาน้อยลงหรือไม่", "Helps BMA learn whether events reduce loneliness.") : undefined}
          auto
        >
          <div class="answers">
            {UCLA_SCALE.map((o) => (
              <AnswerCard name={`q${i + 1}`} value={o.value} label={lang === "en" ? o.en : o.th} />
            ))}
          </div>
        </FlowStep>
      ))}
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
  return c.redirect("/events?notice=welcome");
});
