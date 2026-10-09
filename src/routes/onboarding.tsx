/**
 * Onboarding (PRD §5, §21): feels like a short quiz, not a government form.
 *
 *   1 basics       nickname, birth date (18+ gate), district, lives-in-Bangkok
 *   2 privacy      consents + code of conduct
 *   3 you          languages, interests, social style, times, what you're here for
 *   4 connections  relationship (private), age preference, optional romance mode
 *   5 wellbeing    optional UCLA-3 baseline, only with research consent
 */
import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { batch, getDb } from "../db";
import { ageOn, canSwitchToSingle, MIN_AGE } from "../domain/rules";
import {
  DISTRICTS,
  EVENT_STYLES,
  GENDER_IDENTITIES,
  INTENTS,
  INTERESTS,
  LANGUAGES,
  RELATIONSHIP,
  SOCIAL_STYLES,
  values,
} from "../lib/constants";
import { newId } from "../lib/crypto";
import type { AppEnv, CurrentUser } from "../lib/env";
import { consents, profiles, wellbeing } from "../schema";
import { requireUser } from "../lib/session";
import { Button, Choices, Field, list, Notice, page, Select, str, Toggle, view, type View } from "../ui/kit";

export const onboarding = new Hono<AppEnv>();
onboarding.use("*", requireUser);

const STEPS = ["basics", "privacy", "you", "connections", "wellbeing"] as const;
type Step = (typeof STEPS)[number];

export const CONSENT_VERSION = "2026-10-proto";

/** The first step this user hasn't completed. */
async function nextStep(c: { env: AppEnv["Bindings"] }, user: CurrentUser): Promise<Step | "done"> {
  const p = user.profile;
  if (!p) return "basics";
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

function Progress(props: { step: Step }) {
  const i = STEPS.indexOf(props.step);
  return (
    <div class="steps" aria-hidden="true">
      {STEPS.map((_, j) => (
        <i class={j <= i ? "on" : ""} />
      ))}
    </div>
  );
}

onboarding.get("/", async (c) => {
  const step = await nextStep(c, c.var.user!);
  return c.redirect(step === "done" ? "/events" : `/onboarding/${step}`);
});

// --------------------------------------------------------------- forms --

function BasicsForm(props: { v: View; values?: Record<string, string>; error?: string }) {
  const { t, lang } = props.v;
  const p = props.v.user?.profile;
  const val = props.values ?? {};
  return (
    <>
      <Progress step="basics" />
      <h1>{t("กรุงเทพฯ กว้างมาก — เริ่มจากตัวคุณก่อน", "Bangkok is huge. Let's start with you.")}</h1>
      {props.error ? <Notice kind="error">{props.error}</Notice> : null}
      <form method="post">
        <Field label={t("ชื่อเล่นที่อยากให้คนอื่นเรียก", "What should people call you?")} name="nickname" value={val.nickname ?? p?.nickname} required maxlength={30} />
        <Field label={t("วันเกิด", "Date of birth")} name="birthDate" type="date" value={val.birthDate ?? p?.birthDate} required hint={t("ต้องอายุ 18 ปีขึ้นไป — ไม่แสดงต่อผู้อื่น", "You must be 18+. Never shown to others.")} />
        <Select
          label={t("ส่วนใหญ่ใช้ชีวิตอยู่เขตไหน?", "Which district do you spend most of your week in?")}
          name="district"
          options={DISTRICTS}
          value={val.district ?? p?.district}
          lang={lang}
          required
          blank={t("เลือกเขต", "Choose a district")}
        />
        <Toggle name="livesInBangkok" label={t("ฉันอาศัยอยู่ในกรุงเทพฯ ตอนนี้", "I currently live in Bangkok")} checked={val.livesInBangkok === "1" || !!p} hint={t("ไม่จำเป็นต้องมีทะเบียนบ้านในกรุงเทพฯ", "Your household registration can be anywhere.")} />
        <Toggle name="newcomer" label={t("ฉันเพิ่งย้ายมากรุงเทพฯ", "I'm new to Bangkok")} checked={val.newcomer === "1" || !!p?.newcomer} hint={t("เราจะแนะนำกิจกรรมสำหรับคนมาใหม่", "We'll suggest newcomer meet-ups.")} />
        <Button>{t("ต่อไป", "Next")}</Button>
      </form>
    </>
  );
}

onboarding.get("/basics", (c) => page(c, { title: "Onboarding" }, <BasicsForm v={view(c)} />));

onboarding.post("/basics", async (c) => {
  const v = view(c);
  const { t } = v;
  const user = c.var.user!;
  const body = await c.req.parseBody();
  const vals = {
    nickname: str(body.nickname).slice(0, 30),
    birthDate: str(body.birthDate),
    district: str(body.district),
    livesInBangkok: str(body.livesInBangkok),
    newcomer: str(body.newcomer),
  };
  const fail = (error: string) => page(c, { title: "Onboarding", status: 400 }, <BasicsForm v={v} values={vals} error={error} />);
  if (!vals.nickname) return fail(t("กรอกชื่อเล่น", "Please add a nickname."));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vals.birthDate)) return fail(t("กรอกวันเกิด", "Please add your date of birth."));
  const age = ageOn(vals.birthDate);
  if (!(age >= MIN_AGE && age < 120)) return fail(t("BKK Social สำหรับผู้มีอายุ 18 ปีขึ้นไปเท่านั้น", "BKK Social is for adults aged 18 and over."));
  if (!values(DISTRICTS).includes(vals.district)) return fail(t("เลือกเขต", "Please choose a district."));
  if (vals.livesInBangkok !== "1") return fail(t("ช่วงทดลองนี้สำหรับคนที่อาศัยอยู่ในกรุงเทพฯ", "This pilot is for people who currently live in Bangkok."));

  const db = getDb(c.env);
  const data = { nickname: vals.nickname, birthDate: vals.birthDate, district: vals.district, newcomer: vals.newcomer === "1", locale: v.lang, updatedAt: new Date() };
  if (user.profile) await db.update(profiles).set(data).where(eq(profiles.accountId, user.account.id));
  else await db.insert(profiles).values({ accountId: user.account.id, ...data });
  return c.redirect("/onboarding/privacy");
});

const CONSENT_ITEMS: { key: string; required: boolean; th: string; en: string; hintTh: string; hintEn: string }[] = [
  { key: "service", required: true, th: "บัญชีและบริการกิจกรรม", en: "Account and event service", hintTh: "จำเป็นเพื่อให้คุณใช้งานได้", hintEn: "Needed for the app to work." },
  { key: "safety", required: true, th: "ความปลอดภัยและการดูแลชุมชน", en: "Safety and moderation", hintTh: "ใช้ตรวจสอบรายงานและป้องกันการคุกคาม", hintEn: "Used to review reports and prevent harassment." },
  { key: "personalization", required: false, th: "จัดกลุ่มและแนะนำกิจกรรมตามความสนใจ", en: "Personalised groups and event suggestions", hintTh: "ใช้ความสนใจและภาษาในการจัดโต๊ะ", hintEn: "Uses your interests and languages to seat you well." },
  { key: "research", required: false, th: "City Pulse — ช่วยวิจัยเมือง (ไม่ระบุตัวตน)", en: "City Pulse — anonymous city research", hintTh: "กทม. เห็นเฉพาะภาพรวมจากอย่างน้อย 10 คน", hintEn: "BMA only sees totals from 10+ people." },
  { key: "notifications", required: false, th: "การแจ้งเตือนกิจกรรม", en: "Event notifications", hintTh: "เตือนก่อนงานและแจ้งเมื่อมีที่ว่าง", hintEn: "Reminders and waitlist updates." },
];

function PrivacyForm(props: { v: View; error?: string }) {
  const { t } = props.v;
  return (
    <>
      <Progress step="privacy" />
      <h1>{t("ความเป็นส่วนตัวของคุณ คุณเลือกเอง", "Your privacy, your call")}</h1>
      <p class="muted">{t("เปลี่ยนได้ทุกเมื่อในศูนย์ความเป็นส่วนตัว", "Change any of these later in the Privacy Center.")}</p>
      {props.error ? <Notice kind="error">{props.error}</Notice> : null}
      <form method="post">
        {CONSENT_ITEMS.map((i) => (
          <Toggle
            name={`consent_${i.key}`}
            label={`${t(i.th, i.en)}${i.required ? t(" (จำเป็น)", " (required)") : ""}`}
            hint={t(i.hintTh, i.hintEn)}
            checked={i.required}
          />
        ))}
        <Toggle name="conduct" label={t("ฉันยอมรับหลักปฏิบัติของชุมชน", "I agree to the community code of conduct")} hint={t("อ่านได้ที่ /code-of-conduct", "Read it at /code-of-conduct")} />
        <p class="muted">
          <a href="/privacy" target="_blank">{t("อ่านนโยบายความเป็นส่วนตัว", "Read the privacy notice")}</a>
        </p>
        <Button>{t("ต่อไป", "Next")}</Button>
      </form>
    </>
  );
}

onboarding.get("/privacy", (c) => {
  if (!c.var.user!.profile) return c.redirect("/onboarding/basics");
  return page(c, { title: "Onboarding" }, <PrivacyForm v={view(c)} />);
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
      { title: "Onboarding", status: 400 },
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

function YouForm(props: { v: View; error?: string }) {
  const { t, lang } = props.v;
  const p = props.v.user?.profile;
  return (
    <>
      <Progress step="you" />
      <h1>{t("คุณเป็นสายไหน? 🍜🏃🎨", "What's your vibe? 🍜🏃🎨")}</h1>
      {props.error ? <Notice kind="error">{props.error}</Notice> : null}
      <form method="post">
        <Choices legend={t("พูดภาษาอะไรได้บ้าง", "Languages you're comfortable in")} name="languages" options={LANGUAGES} values={p?.languages.length ? p.languages : [lang]} lang={lang} />
        <Choices legend={t("สนใจอะไรบ้าง", "What are you into?")} name="interests" options={INTERESTS} values={p?.interests} lang={lang} hint={t("เลือกอย่างน้อย 1", "Pick at least one")} />
        <Choices legend={t("ชอบเจอคนแบบไหน", "How do you like to meet people?")} name="socialStyles" options={SOCIAL_STYLES} values={p?.socialStyles} lang={lang} />
        <Choices legend={t("เวลาที่สะดวก", "When suits you best?")} name="eventStyle" options={EVENT_STYLES} values={p?.eventStyle ? [p.eventStyle] : []} lang={lang} type="radio" />
        <Choices legend={t("มาที่นี่เพื่อ…", "I'm here for…")} name="intents" options={INTENTS} values={p?.intents ?? ["friends"]} lang={lang} />
        <Button>{t("ต่อไป", "Next")}</Button>
      </form>
    </>
  );
}

onboarding.get("/you", (c) => {
  if (!c.var.user!.profile) return c.redirect("/onboarding/basics");
  return page(c, { title: "Onboarding" }, <YouForm v={view(c)} />);
});

onboarding.post("/you", async (c) => {
  const v = view(c);
  const user = c.var.user!;
  if (!user.profile) return c.redirect("/onboarding/basics");
  const body = await c.req.parseBody({ all: true });
  const pickAll = (key: string, allowed: string[]) => list(body[key]).filter((x) => allowed.includes(x));
  const languages = pickAll("languages", values(LANGUAGES));
  const interests = pickAll("interests", values(INTERESTS));
  const socialStyles = pickAll("socialStyles", values(SOCIAL_STYLES));
  const eventStyle = pickAll("eventStyle", values(EVENT_STYLES))[0] ?? null;
  const intents = pickAll("intents", values(INTENTS));
  if (languages.length === 0 || interests.length === 0) {
    return page(c, { title: "Onboarding", status: 400 }, <YouForm v={v} error={v.t("เลือกภาษาและความสนใจอย่างน้อยอย่างละ 1", "Pick at least one language and one interest.")} />);
  }
  // Keep romance if it was already on; this form only edits non-romance intents.
  const keepRomance = user.profile.intents.includes("romance") ? ["romance"] : [];
  await getDb(c.env)
    .update(profiles)
    .set({ languages, interests, socialStyles, eventStyle, intents: [...(intents.length ? intents : ["friends"]), ...keepRomance], updatedAt: new Date() })
    .where(eq(profiles.accountId, user.account.id));
  return c.redirect("/onboarding/connections");
});

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
        <p class="muted">
          {t(
            "ค่าเริ่มต้นคือโหมดเพื่อนเท่านั้น หากเปิด คุณจะเลือก 'เปิดใจมากกว่าเพื่อน' ได้หลังกิจกรรม และจะรู้ก็ต่อเมื่ออีกฝ่ายเลือกเหมือนกัน ข้อมูลด้านล่างเป็นความลับ เจ้าหน้าที่ดูไม่ได้ และจะถูกลบเมื่อปิดโหมดนี้",
            "Friends-only is the default. If you switch this on, you can choose 'open to something more' after events, and you'll only find out if it's mutual. The details below are private, invisible to staff, and deleted when you switch this off.",
          )}
        </p>
        <Toggle name="romanceOn" label={t("เปิดโหมดนี้", "Switch this on")} checked={!!p?.romanceOn} />
        <Select label={t("อัตลักษณ์ทางเพศของคุณ (ไม่บังคับ)", "Your gender identity (optional)")} name="genderIdentity" options={GENDER_IDENTITIES} value={p?.genderIdentity} lang={lang} blank="—" />
        <Choices
          legend={t("เปิดใจที่จะพบ…", "Open to meeting…")}
          name="romanceOpenTo"
          options={[{ value: "everyone", th: "ทุกคน", en: "Everyone" }, ...GENDER_IDENTITIES.filter((g) => g.value !== "prefer_not" && g.value !== "self")]}
          values={openTo === "everyone" ? ["everyone"] : Array.isArray(openTo) ? openTo : []}
          lang={lang}
        />
        <Field label={t("สรรพนาม (ไม่บังคับ)", "Pronouns (optional)")} name="pronouns" value={p?.pronouns} maxlength={30} />
        <Toggle name="showPronouns" label={t("แสดงสรรพนามในโปรไฟล์", "Show my pronouns on my profile")} checked={!!p?.showPronouns} />
        <Toggle name="romanceConsent" label={t("ยินยอมให้เก็บข้อมูลส่วนนี้ (ข้อมูลอ่อนไหวตาม PDPA)", "I consent to this sensitive data being stored (PDPA)")} checked={!!p?.romanceOn} />
      </details>
    </>
  );
}

/** Shared by onboarding and Settings: validates and returns the profile patch. */
export async function connectionsPatch(
  body: Record<string, unknown>,
  current: { relationship: string; lastSingleSwitchAt: Date | null },
): Promise<{ patch: Partial<typeof profiles.$inferInsert>; romanceConsent: boolean | null } | { error: [string, string] }> {
  const relationship = values(RELATIONSHIP).includes(str(body.relationship)) ? str(body.relationship) : "prefer_not";
  const ageMin = Math.max(18, Math.min(99, Number(str(body.ageMin)) || 18));
  const ageMax = Math.max(ageMin, Math.min(99, Number(str(body.ageMax)) || 99));
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

onboarding.get("/connections", (c) => {
  const v = view(c);
  if (!v.user!.profile) return c.redirect("/onboarding/basics");
  return page(
    c,
    { title: "Onboarding" },
    <>
      <Progress step="connections" />
      <h1>{v.t("หลังกิจกรรม อยากเชื่อมต่อแบบไหน?", "After events, how would you like to connect?")}</h1>
      <form method="post">
        <ConnectionsFields v={v} />
        <Button>{v.t("ต่อไป", "Next")}</Button>
      </form>
    </>,
  );
});

onboarding.post("/connections", async (c) => {
  const v = view(c);
  const user = c.var.user!;
  const p = user.profile;
  if (!p) return c.redirect("/onboarding/basics");
  const body = await c.req.parseBody({ all: true });
  const result = await connectionsPatch(body, p);
  if ("error" in result) {
    return page(
      c,
      { title: "Onboarding", status: 400 },
      <>
        <Progress step="connections" />
        <Notice kind="error">{v.t(...result.error)}</Notice>
        <form method="post">
          <ConnectionsFields v={v} />
          <Button>{v.t("ต่อไป", "Next")}</Button>
        </form>
      </>,
    );
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

onboarding.get("/wellbeing", async (c) => {
  const v = view(c);
  const user = v.user!;
  if (!user.profile) return c.redirect("/onboarding/basics");
  if (!(await hasResearchConsent(c.env, user.account.id))) {
    await finish(c, user.account.id);
    return c.redirect("/events?notice=welcome");
  }
  return page(
    c,
    { title: "Onboarding" },
    <>
      <Progress step="wellbeing" />
      <h1>{v.t("คำถามสั้น ๆ 3 ข้อ (ไม่บังคับ)", "Three quick questions (optional)")}</h1>
      <p class="muted">{v.t("ช่วยให้ กทม. รู้ว่ากิจกรรมช่วยให้คนเหงาน้อยลงหรือไม่ คำตอบไม่ผูกกับตัวตนของคุณ", "Helps BMA learn whether events reduce loneliness. Your answers aren't linked to your identity.")}</p>
      <form method="post">
        {UCLA3.map(([th, en], i) => (
          <Choices legend={v.t(th, en)} name={`q${i + 1}`} options={UCLA_SCALE} lang={v.lang} type="radio" />
        ))}
        <div class="row">
          <Button>{v.t("ส่งคำตอบ", "Submit")}</Button>
          <Button kind="ghost" name="skip" value="1">{v.t("ข้าม", "Skip")}</Button>
        </div>
      </form>
    </>,
  );
});

onboarding.post("/wellbeing", async (c) => {
  const user = c.var.user!;
  if (!user.profile) return c.redirect("/onboarding/basics");
  const body = await c.req.parseBody();
  const answers = [body.q1, body.q2, body.q3].map((x) => Number(str(x)));
  if (str(body.skip) !== "1" && answers.every((n) => n >= 1 && n <= 3) && user.account.researchId) {
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
