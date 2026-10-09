/**
 * Settings ("Me" tab): profile, connection preferences, Privacy Center
 * (PRD §12.2), data export, deactivation and password change.
 *
 *   GET  /settings                  hub
 *   GET  /settings/profile          edit profile (+ optional photo, PRD §5.3)
 *   POST /settings/profile
 *   GET  /settings/photo            my own photo (redirect to a signed URL; bytes only locally)
 *   GET  /settings/connections      relationship, age preference, romance mode (PRD §4.4)
 *   POST /settings/connections
 *   GET  /settings/privacy          Privacy Center: consents, data stores, retention
 *   POST /settings/privacy          appends NEW consent rows for changed categories
 *   GET  /settings/privacy/export   JSON download of my data
 *   POST /settings/deactivate
 *   GET  /settings/password
 *   POST /settings/password
 *   POST /settings/badge            show / hide the Registered Resident badge (verified only)
 */
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { and, desc, eq, gt, inArray, ne, or } from "drizzle-orm";
import { batch, getDb } from "../db";
import { passwordProblem } from "../domain/rules";
import { DISTRICTS, EVENT_STYLES, INTENTS, INTERESTS, LANGUAGES, SOCIAL_STYLES, label, values } from "../lib/constants";
import { hashPassword, newId, sha256, verifyPassword } from "../lib/crypto";
import type { AppEnv } from "../lib/env";
import { audit } from "../lib/records";
import { requireMember, SESSION_COOKIE } from "../lib/session";
import {
  accounts,
  connectionChoices,
  connections,
  consents,
  contactShares,
  events,
  notifications,
  profiles,
  pulseQuestions,
  pulseResponses,
  registrations,
  reports,
  sessions,
  wellbeing,
  type Profile,
} from "../schema";
import { deleteObject, getObject, getObjectUrl, putObject } from "../storage";
import { Button, Card, Choices, Field, LinkButton, list, Notice, page, Select, str, Tag, TextArea, Toggle, view, type View } from "../ui/kit";
import { CONSENT_VERSION, ConnectionsFields, connectionsPatch } from "./onboarding";
import { isArchetype, loadVibe, VisibilityToggle } from "./quiz";
import { ARCHETYPES, displayName } from "../vibe/archetypes";
import { L } from "../lib/i18n";

export const settingsRoutes = new Hono<AppEnv>();
settingsRoutes.use("/settings", requireMember);
settingsRoutes.use("/settings/*", requireMember);

type C = Context<AppEnv>;
const me = (c: C) => c.var.user!;

// ------------------------------------------------------------- helpers --

const PROMPTS: { key: "weekend" | "bkk_spot"; th: string; en: string }[] = [
  { key: "weekend", th: "วันหยุดที่สมบูรณ์แบบของฉันคือ…", en: "My perfect Bangkok weekend is…" },
  { key: "bkk_spot", th: "มุมโปรดในกรุงเทพฯ ของฉันคือ…", en: "My favourite Bangkok spot is…" },
];
const PROMPT_MAX = 120;

const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** A URL a browser can load my photo from. Deployed: a short-lived signed URL. */
async function photoSrc(c: C, key: string | null): Promise<string | null> {
  if (!key) return null;
  if (c.env.FILES) {
    try {
      return await getObjectUrl(c.env, key);
    } catch {
      return null;
    }
  }
  // Locally there is no signer: a member-only route serves the bytes (dev only).
  return c.env.BUCKET ? "/settings/photo" : null;
}

/** The latest row per consent category (history is append-only). */
async function currentConsents(c: C, accountId: string): Promise<Map<string, boolean>> {
  const rows = await getDb(c.env)
    .select({ category: consents.category, granted: consents.granted })
    .from(consents)
    .where(eq(consents.accountId, accountId))
    .orderBy(desc(consents.createdAt))
    .limit(500);
  const map = new Map<string, boolean>();
  for (const r of rows) if (!map.has(r.category)) map.set(r.category, r.granted);
  return map;
}

// ------------------------------------------------------------------ hub --

settingsRoutes.get("/settings", async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const user = me(c);
  const p = user.profile!;
  const [src, vibe] = await Promise.all([photoSrc(c, p.photoKey), loadVibe(c.env, user.account.id)]);
  const vibeKey = vibe && isArchetype(vibe.archetype) ? vibe.archetype : null;
  const links: [string, string, string, string][] = [
    ["/pulse", "💬", t("City Pulse: ช่วยเมือง", "City Pulse: help the city"), t("คำถามสั้น ๆ ไม่ระบุตัวตน ส่งตรงถึง กทม.", "Quick anonymous questions that go straight to BMA")],
    ["/settings/profile", "✏️", t("แก้ไขโปรไฟล์", "Edit profile"), t("ชื่อเล่น เขต ความสนใจ รูป", "Nickname, district, interests, photo")],
    ["/settings/connections", "🤝", t("การเชื่อมต่อหลังกิจกรรม", "Connection preferences"), t("สถานะความสัมพันธ์ ช่วงอายุ (ส่วนตัว)", "Relationship status, age range (private)")],
    ["/settings/privacy", "🔒", t("ศูนย์ความเป็นส่วนตัว", "Privacy Center"), t("ความยินยอม ดาวน์โหลดข้อมูล ปิดบัญชี", "Consents, download my data, deactivate")],
    ["/settings/password", "🔑", t("เปลี่ยนรหัสผ่าน", "Change password"), t("ต้องใช้รหัสผ่านปัจจุบัน", "Needs your current password")],
  ];
  return page(
    c,
    { title: t("ฉัน", "Me"), tab: "me" },
    <>
      <h1>{t("ฉัน", "Me")}</h1>
      <Card>
        <div class="row">
          {src ? (
            <img src={src} alt={t("รูปโปรไฟล์ของฉัน", "My profile photo")} class="avatar" style="object-fit:cover;width:64px;height:64px" />
          ) : (
            <div class="avatar" aria-hidden="true">{p.nickname.slice(0, 1).toUpperCase()}</div>
          )}
          <div>
            <h2 style="margin:0">{p.nickname}</h2>
            <div class="muted">
              {label(DISTRICTS, p.district, lang)}
              {p.showPronouns && p.pronouns ? ` · ${p.pronouns}` : ""}
            </div>
          </div>
        </div>
        <div class="tags">
          {p.newcomer ? <Tag tone="accent">{t("มาใหม่ในกรุงเทพฯ", "New to Bangkok")}</Tag> : null}
          {p.interests.map((i) => (
            <Tag>{label(INTERESTS, i, lang)}</Tag>
          ))}
          {p.languages.map((l) => (
            <Tag tone="muted">{label(LANGUAGES, l, lang)}</Tag>
          ))}
        </div>
        {PROMPTS.filter((q) => p.prompts?.[q.key]).map((q) => (
          <p>
            <strong>{t(q.th, q.en)}</strong> {p.prompts[q.key]}
          </p>
        ))}
      </Card>
      <Card>
        <div class="spread">
          <h2 style="margin:0">{t("ไทป์กรุงเทพฯ ของคุณ", "Your Bangkok Type")}</h2>
          <a href="/types" class="muted">{t("ทุกไทป์", "All types")}</a>
        </div>
        {vibe && vibeKey ? (
          <>
            <a href="/quiz/result" class="teaser" style="margin:10px 0">
              <b class="big" aria-hidden="true">{ARCHETYPES[vibeKey].emoji}</b>
              <span>
                <strong>{L(lang, displayName(vibeKey, vibe.modifier))}</strong>
                <small class="muted">{L(lang, ARCHETYPES[vibeKey].tagline)}</small>
              </span>
            </a>
            <VisibilityToggle v={v} visible={vibe.visible} next="/settings" />
            <a href="/quiz">{t("ทำแบบทดสอบใหม่", "Retake the quiz")}</a>
          </>
        ) : (
          <a href="/quiz" class="teaser" style="margin:10px 0 0">
            <b class="big" aria-hidden="true">🧭</b>
            <span>
              <strong>{t("ค้นหาไทป์ของคุณ", "Find your type")}</strong>
              <small class="muted">{t("แตะเลือก 18 ข้อ ราว 3 นาที", "18 quick taps, about 3 minutes")}</small>
            </span>
          </a>
        )}
      </Card>
      {user.account.bkkRegistered === "verified" ? (
        <form method="post" action="/settings/badge" class="card inline-toggle">
          <label class="toggle" style="margin:0">
            <input type="checkbox" name="show" value="1" checked={p.showResidentBadge} onchange="this.form.requestSubmit?this.form.requestSubmit():this.form.submit()" />
            <span>🏅 {t("แสดงตราผู้อยู่อาศัยที่ลงทะเบียนในกรุงเทพฯ", "Show my Bangkok Registered Resident badge")}</span>
          </label>
          <noscript>
            <button type="submit" class="btn ghost">{t("บันทึก", "Save")}</button>
          </noscript>
        </form>
      ) : null}
      {links.map(([href, icon, title, hint]) => (
        <Card href={href}>
          <strong>
            <span aria-hidden="true">{icon}</span> {title}
          </strong>
          <div class="muted">{hint}</div>
        </Card>
      ))}
      <Card>
        <h2>{t("ภาษา", "Language")}</h2>
        <div class="row">
          <a href="/lang/th?back=/settings" class={`btn ${lang === "th" ? "primary" : "ghost"}`} lang="th" aria-current={lang === "th" ? "true" : undefined}>
            ไทย
          </a>
          <a href="/lang/en?back=/settings" class={`btn ${lang === "en" ? "primary" : "ghost"}`} lang="en" aria-current={lang === "en" ? "true" : undefined}>
            English
          </a>
        </div>
      </Card>
      <p class="row">
        <a href="/privacy">{t("นโยบายความเป็นส่วนตัว", "Privacy notice")}</a>
        <a href="/terms">{t("ข้อกำหนด", "Terms")}</a>
        <a href="/code-of-conduct">{t("หลักปฏิบัติ", "Code of conduct")}</a>
      </p>
      <form method="post" action="/logout">
        <Button kind="ghost">{t("ออกจากระบบ", "Sign out")}</Button>
      </form>
    </>,
  );
});

settingsRoutes.post("/settings/badge", async (c) => {
  const user = me(c);
  if (user.account.bkkRegistered !== "verified") return c.text("Forbidden", 403);
  const body = await c.req.parseBody();
  await getDb(c.env)
    .update(profiles)
    .set({ showResidentBadge: str(body.show) === "1", updatedAt: new Date() })
    .where(eq(profiles.accountId, user.account.id));
  return c.redirect("/settings?notice=saved");
});

// -------------------------------------------------------------- profile --

type ProfileVals = {
  nickname: string;
  district: string;
  languages: string[];
  interests: string[];
  socialStyles: string[];
  eventStyle: string | null;
  intents: string[];
  newcomer: boolean;
  locale: string;
  weekend: string;
  bkk_spot: string;
};

function ProfileForm(props: { v: View; vals: ProfileVals; photo: string | null; hasPhoto: boolean; error?: string }) {
  const { t, lang } = props.v;
  const vals = props.vals;
  return (
    <>
      <p>
        <a href="/settings">← {t("ฉัน", "Me")}</a>
      </p>
      <h1>{t("แก้ไขโปรไฟล์", "Edit profile")}</h1>
      {props.error ? <Notice kind="error">{props.error}</Notice> : null}
      <form method="post" enctype="multipart/form-data">
        <Field label={t("ชื่อเล่น", "Nickname")} name="nickname" value={vals.nickname} required maxlength={30} />
        <Select label={t("เขตที่ใช้ชีวิตเป็นหลัก", "Main district")} name="district" options={DISTRICTS} value={vals.district} lang={lang} required />
        <Choices legend={t("ภาษาที่พูดได้", "Languages you're comfortable in")} name="languages" options={LANGUAGES} values={vals.languages} lang={lang} hint={t("เลือกอย่างน้อย 1", "Pick at least one")} />
        <Choices legend={t("ความสนใจ", "Interests")} name="interests" options={INTERESTS} values={vals.interests} lang={lang} hint={t("เลือกอย่างน้อย 1", "Pick at least one")} />
        <Choices legend={t("ชอบเจอคนแบบไหน", "How do you like to meet people?")} name="socialStyles" options={SOCIAL_STYLES} values={vals.socialStyles} lang={lang} />
        <Choices legend={t("เวลาที่สะดวก", "When suits you best?")} name="eventStyle" options={EVENT_STYLES} values={vals.eventStyle ? [vals.eventStyle] : []} lang={lang} type="radio" />
        <Choices legend={t("มาที่นี่เพื่อ…", "I'm here for…")} name="intents" options={INTENTS} values={vals.intents} lang={lang} />
        <Toggle name="newcomer" label={t("ฉันเพิ่งย้ายมากรุงเทพฯ", "I'm new to Bangkok")} checked={vals.newcomer} />
        <Select
          label={t("ภาษาที่ใช้ในแอป", "App language")}
          name="locale"
          options={[
            { value: "th", th: "ไทย", en: "Thai" },
            { value: "en", th: "อังกฤษ", en: "English" },
          ]}
          value={vals.locale}
          lang={lang}
        />
        {PROMPTS.map((q) => (
          <TextArea label={t(q.th, q.en)} name={q.key} value={vals[q.key]} rows={2} maxlength={PROMPT_MAX} hint={t(`ไม่บังคับ ไม่เกิน ${PROMPT_MAX} ตัวอักษร`, `Optional, up to ${PROMPT_MAX} characters`)} />
        ))}
        <fieldset class="choices">
          <legend>{t("รูปโปรไฟล์ (ไม่บังคับ)", "Profile photo (optional)")}</legend>
          {props.photo ? <img src={props.photo} alt={t("รูปโปรไฟล์ปัจจุบัน", "Current profile photo")} style="width:96px;height:96px;border-radius:50%;object-fit:cover" /> : null}
          <div class="field">
            <label for="f-photo">{t("อัปโหลดรูปใหม่", "Upload a new photo")}</label>
            <input id="f-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" />
            <small>{t("JPG, PNG หรือ WebP ไม่เกิน 5 MB — ไม่ต้องใช้รูปจริงในช่วงทดลอง", "JPG, PNG or WebP, up to 5 MB. No real photos needed in the prototype.")}</small>
          </div>
          {props.hasPhoto ? <Toggle name="removePhoto" label={t("ลบรูปโปรไฟล์", "Remove my photo")} /> : null}
        </fieldset>
        <Button>{t("บันทึก", "Save")}</Button>
      </form>
    </>
  );
}

function profileVals(p: Profile): ProfileVals {
  return {
    nickname: p.nickname,
    district: p.district,
    languages: p.languages,
    interests: p.interests,
    socialStyles: p.socialStyles,
    eventStyle: p.eventStyle,
    intents: p.intents.filter((i) => i !== "romance"),
    newcomer: p.newcomer,
    locale: p.locale,
    weekend: p.prompts?.weekend ?? "",
    bkk_spot: p.prompts?.bkk_spot ?? "",
  };
}

settingsRoutes.get("/settings/profile", async (c) => {
  const p = me(c).profile!;
  return page(c, { title: view(c).t("แก้ไขโปรไฟล์", "Edit profile"), tab: "me" }, <ProfileForm v={view(c)} vals={profileVals(p)} photo={await photoSrc(c, p.photoKey)} hasPhoto={!!p.photoKey} />);
});

settingsRoutes.post("/settings/profile", async (c) => {
  const v = view(c);
  const { t } = v;
  const user = me(c);
  const p = user.profile!;
  const body = await c.req.parseBody({ all: true });
  const pickAll = (key: string, allowed: string[]) => list(body[key]).filter((x) => allowed.includes(x));
  const vals: ProfileVals = {
    nickname: str(body.nickname),
    district: str(body.district),
    languages: pickAll("languages", values(LANGUAGES)),
    interests: pickAll("interests", values(INTERESTS)),
    socialStyles: pickAll("socialStyles", values(SOCIAL_STYLES)),
    eventStyle: pickAll("eventStyle", values(EVENT_STYLES))[0] ?? null,
    intents: pickAll("intents", values(INTENTS)),
    newcomer: str(body.newcomer) === "1",
    locale: str(body.locale) === "en" ? "en" : "th",
    weekend: str(body.weekend),
    bkk_spot: str(body.bkk_spot),
  };
  const fail = async (error: string) =>
    page(c, { title: t("แก้ไขโปรไฟล์", "Edit profile"), tab: "me", status: 400 }, <ProfileForm v={v} vals={vals} photo={await photoSrc(c, p.photoKey)} hasPhoto={!!p.photoKey} error={error} />);

  if (!vals.nickname) return fail(t("กรอกชื่อเล่น", "Please add a nickname."));
  if (vals.nickname.length > 30) return fail(t("ชื่อเล่นยาวได้ไม่เกิน 30 ตัวอักษร", "Nickname can be at most 30 characters."));
  if (!values(DISTRICTS).includes(vals.district)) return fail(t("เลือกเขต", "Please choose a district."));
  if (vals.languages.length === 0 || vals.interests.length === 0) {
    return fail(t("เลือกภาษาและความสนใจอย่างน้อยอย่างละ 1", "Pick at least one language and one interest."));
  }
  if (vals.weekend.length > PROMPT_MAX || vals.bkk_spot.length > PROMPT_MAX) {
    return fail(t(`คำตอบสั้น ๆ ยาวได้ไม่เกิน ${PROMPT_MAX} ตัวอักษร`, `Prompt answers can be at most ${PROMPT_MAX} characters.`));
  }

  // Optional photo. Server-generated key; bytes go straight to the file store.
  const raw = Array.isArray(body.photo) ? body.photo[0] : body.photo;
  const file = raw instanceof File && raw.size > 0 ? raw : null;
  const removePhoto = str(body.removePhoto) === "1";
  let photoKey = p.photoKey;
  if (file) {
    if (!PHOTO_TYPES.includes(file.type)) return fail(t("รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP", "Photos must be JPG, PNG or WebP."));
    if (file.size > PHOTO_MAX_BYTES) return fail(t("รูปต้องมีขนาดไม่เกิน 5 MB", "Photos must be 5 MB or smaller."));
    const key = `uploads/${user.account.id}/${crypto.randomUUID()}`;
    try {
      await putObject(c.env, key, await file.arrayBuffer(), { contentType: file.type });
    } catch {
      return fail(t("อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง", "The photo couldn't be uploaded. Please try again."));
    }
    photoKey = key;
  } else if (removePhoto) {
    photoKey = null;
  }

  const prompts: Record<string, string> = {};
  if (vals.weekend) prompts.weekend = vals.weekend;
  if (vals.bkk_spot) prompts.bkk_spot = vals.bkk_spot;
  // This form only edits the non-romance intents; romance follows romance mode.
  const intents = [...(vals.intents.length ? vals.intents : ["friends"]), ...(p.romanceOn ? ["romance"] : [])];
  const db = getDb(c.env);
  await db
    .update(profiles)
    .set({
      nickname: vals.nickname,
      district: vals.district,
      languages: vals.languages,
      interests: vals.interests,
      socialStyles: vals.socialStyles,
      eventStyle: vals.eventStyle,
      intents,
      newcomer: vals.newcomer,
      locale: vals.locale,
      prompts,
      photoKey,
      updatedAt: new Date(),
    })
    .where(eq(profiles.accountId, user.account.id));
  if (p.photoKey && p.photoKey !== photoKey) await deleteObject(c.env, p.photoKey).catch(() => {});
  if (vals.locale !== p.locale) setCookie(c, "lang", vals.locale, { path: "/", maxAge: 365 * 86_400, sameSite: "Lax" });
  return c.redirect("/settings?notice=saved");
});

/** My own photo. Deployed: redirect to a signed URL. Locally: serve the bytes (dev only). */
settingsRoutes.get("/settings/photo", async (c) => {
  const key = me(c).profile!.photoKey;
  if (!key) return c.notFound();
  if (c.env.FILES) {
    return new Response(null, { status: 302, headers: { location: await getObjectUrl(c.env, key), "cache-control": "private, max-age=60" } });
  }
  const obj = await getObject(c.env, key).catch(() => null);
  if (!obj) return c.notFound();
  return new Response(obj.body, { headers: { "content-type": obj.metadata.contentType ?? "application/octet-stream", "cache-control": "private, max-age=60" } });
});

// ---------------------------------------------------------- connections --

function ConnectionsPage(props: { v: View; error?: [string, string] }) {
  const { t } = props.v;
  return (
    <>
      <p>
        <a href="/settings">← {t("ฉัน", "Me")}</a>
      </p>
      <h1>{t("การเชื่อมต่อหลังกิจกรรม", "Connection preferences")}</h1>
      <p class="muted">
        {t(
          "ข้อมูลในหน้านี้เป็นความลับ ไม่แสดงต่อผู้อื่นและเจ้าหน้าที่ เปลี่ยนจาก 'โสด' จะปิดโหมดเปิดใจทันที เปลี่ยนเป็น 'โสด' ได้ไม่เกิน 1 ครั้งใน 30 วัน",
          "Everything here is private — never shown to other members or staff. Leaving Single switches romance mode off at once. You can switch to Single at most once every 30 days.",
        )}
      </p>
      {props.error ? <Notice kind="error">{t(...props.error)}</Notice> : null}
      <form method="post">
        <ConnectionsFields v={props.v} />
        <Button>{t("บันทึก", "Save")}</Button>
      </form>
    </>
  );
}

settingsRoutes.get("/settings/connections", (c) => page(c, { title: view(c).t("การเชื่อมต่อ", "Connections"), tab: "me" }, <ConnectionsPage v={view(c)} />));

settingsRoutes.post("/settings/connections", async (c) => {
  const v = view(c);
  const user = me(c);
  const p = user.profile!;
  const body = await c.req.parseBody({ all: true });
  const result = await connectionsPatch(body, p);
  if ("error" in result) {
    return page(c, { title: v.t("การเชื่อมต่อ", "Connections"), tab: "me", status: 400 }, <ConnectionsPage v={v} error={result.error} />);
  }
  const db = getDb(c.env);
  const intents = p.intents.filter((i) => i !== "romance");
  const queries: { toSQL(): { sql: string; params: unknown[] } }[] = [
    db
      .update(profiles)
      .set({ ...result.patch, intents: result.patch.romanceOn ? [...intents, "romance"] : intents })
      .where(eq(profiles.accountId, user.account.id)),
  ];
  if (result.romanceConsent !== null) {
    queries.push(db.insert(consents).values({ id: newId(), accountId: user.account.id, category: "romance_data", granted: result.romanceConsent, version: CONSENT_VERSION }));
  }
  if (p.romanceOn && !result.patch.romanceOn) {
    // PRD §4.4: pending romantic choices are withdrawn (they count as "friend",
    // exactly what resolveMutual does for an ineligible person). Choices whose
    // People I Met window is still open are the only pending ones.
    const openSince = new Date(Date.now() - 72 * 3_600_000);
    queries.push(
      db
        .update(connectionChoices)
        .set({ choice: "friend" })
        .where(
          and(
            eq(connectionChoices.fromAccount, user.account.id),
            eq(connectionChoices.choice, "romance"),
            inArray(connectionChoices.eventId, db.select({ id: events.id }).from(events).where(gt(events.endsAt, openSince))),
          ),
        ),
    );
  }
  if (result.patch.relationship !== p.relationship) {
    queries.push(audit(db, user.account.id, "profile.relationship_changed", { type: "account", id: user.account.id }));
  }
  await batch(c.env, queries);
  return c.redirect("/settings/connections?notice=saved");
});

// -------------------------------------------------------------- privacy --

const CATEGORIES: { key: string; required: boolean; th: string; en: string; hintTh: string; hintEn: string }[] = [
  { key: "service", required: true, th: "บัญชีและบริการกิจกรรม", en: "Account and event service", hintTh: "จำเป็นเพื่อให้แอปทำงาน ถอนได้โดยการปิดบัญชีเท่านั้น", hintEn: "Needed for the app to work. Withdrawn only by deactivating your account." },
  { key: "safety", required: true, th: "ความปลอดภัยและการดูแลชุมชน", en: "Safety and moderation", hintTh: "ใช้ตรวจสอบรายงานและป้องกันการคุกคาม ถอนได้โดยการปิดบัญชีเท่านั้น", hintEn: "Used to review reports and prevent harassment. Withdrawn only by deactivating your account." },
  { key: "personalization", required: false, th: "จัดกลุ่มและแนะนำกิจกรรมตามความสนใจ", en: "Personalised groups and suggestions", hintTh: "ใช้ความสนใจและภาษาของคุณในการจัดโต๊ะ", hintEn: "Uses your interests and languages to seat you well." },
  { key: "research", required: false, th: "City Pulse — ช่วยวิจัยเมือง (ไม่ระบุตัวตน)", en: "City Pulse — anonymous city research", hintTh: "คำตอบเก็บแยกด้วยรหัสวิจัย กทม. เห็นเฉพาะภาพรวมจากอย่างน้อย 10 คน", hintEn: "Answers are stored under a research code; BMA only sees totals from 10+ people." },
  { key: "notifications", required: false, th: "การแจ้งเตือนกิจกรรม", en: "Event notifications", hintTh: "เตือนก่อนงานและแจ้งเมื่อมีที่ว่าง", hintEn: "Reminders and waitlist updates." },
  { key: "romance_data", required: false, th: "ข้อมูลโหมดเปิดใจ (ข้อมูลอ่อนไหว)", en: "Romance-mode data (sensitive)", hintTh: "อัตลักษณ์ทางเพศและ 'เปิดใจที่จะพบ' — ถอนแล้วจะปิดโหมดและลบข้อมูลทันที", hintEn: "Gender identity and 'open to meeting' — withdrawing switches romance mode off and deletes them at once." },
];
const OPTIONAL = ["personalization", "research", "notifications"];

function PrivacyCenter(props: { v: View; current: Map<string, boolean> }) {
  const { t } = props.v;
  const cur = props.current;
  const stores: [string, string, string, string][] = [
    ["🪪 ข้อมูลตัวตน", "🪪 Identity store", "ชื่อผู้ใช้ รหัสผ่าน (เข้ารหัสแล้ว) สถานะบัญชีและการยืนยันตัวตน", "Username, password (hashed), account and verification status."],
    ["👥 ข้อมูลการใช้งาน", "👥 Social store", "ชื่อเล่น รูป ความสนใจ กิจกรรมที่ลงทะเบียน การเชื่อมต่อ และการตั้งค่าส่วนตัว", "Nickname, photo, interests, events, connections and your private preferences."],
    ["📊 ข้อมูลวิจัยเมือง", "📊 City research store", "คำตอบ City Pulse เก็บด้วยรหัสวิจัยแทนตัวตน เมื่อปิดบัญชี ความเชื่อมโยงจะถูกตัดและข้อมูลกลายเป็นนิรนาม", "City Pulse answers, stored under a research code instead of your identity. When you deactivate, the link is cut and the rows become anonymous."],
  ];
  const retention: [string, string, string, string][] = [
    ["ข้อมูลโหมดเปิดใจ", "Romance-mode details", "ลบทันทีเมื่อปิดโหมด", "Deleted as soon as you switch it off"],
    ["ตัวเลือกหลังกิจกรรมที่ไม่ตรงกัน", "Non-mutual post-event choices", "ลบเมื่อครบ 72 ชม.", "Deleted when the 72-hour window closes"],
    ["การเชื่อมต่อและช่องทางติดต่อที่แชร์", "Connections and shared contacts", "จนกว่าฝ่ายใดฝ่ายหนึ่งจะลบหรือปิดบัญชี", "Until either person removes it or deletes their account"],
    ["บันทึกการเช็กอินและกลุ่ม", "Check-in and group records", "12 เดือน แล้วเหลือเป็นภาพรวม", "12 months, then aggregated"],
    ["คำตอบ City Pulse", "City Pulse answers", "24 เดือน ภายใต้รหัสวิจัย", "24 months under the research code"],
    ["บัญชีที่ปิดแล้ว", "Deactivated accounts", "ซ่อนโปรไฟล์ทันที ลบถาวรหลัง 30 วัน", "Profile hidden at once, deleted after 30 days"],
  ];
  return (
    <>
      <p>
        <a href="/settings">← {t("ฉัน", "Me")}</a>
      </p>
      <h1>{t("ศูนย์ความเป็นส่วนตัว", "Privacy Center")}</h1>
      <p class="muted">{t("คุณเลือกเองว่าจะให้ใช้ข้อมูลอะไร ทุกการเปลี่ยนแปลงถูกบันทึกเป็นประวัติ", "You decide how your data is used. Every change is kept as a dated record.")}</p>
      <Card>
        <h2>{t("ความยินยอม", "Your consents")}</h2>
        <form method="post">
          <input type="hidden" name="present" value="1" />
          {CATEGORIES.filter((cat) => cat.key !== "romance_data" || cur.has("romance_data")).map((cat) => {
            const on = !!cur.get(cat.key);
            if (cat.required) {
              return (
                <div class="toggle" role="group" aria-label={t(cat.th, cat.en)}>
                  <span>
                    {t(cat.th, cat.en)} <Tag tone="muted">{on ? t("จำเป็น · เปิดอยู่", "Required · on") : t("ปิดอยู่", "Off")}</Tag>
                    <small>{t(cat.hintTh, cat.hintEn)}</small>
                  </span>
                </div>
              );
            }
            if (cat.key === "romance_data" && !on) {
              return (
                <div class="toggle">
                  <span>
                    {t(cat.th, cat.en)} <Tag tone="muted">{t("ปิดอยู่", "Off")}</Tag>
                    <small>
                      {t("เปิดได้ที่หน้า", "Switch on from")} <a href="/settings/connections">{t("การเชื่อมต่อหลังกิจกรรม", "Connection preferences")}</a>
                    </small>
                  </span>
                </div>
              );
            }
            return <Toggle name={`consent_${cat.key}`} label={t(cat.th, cat.en)} hint={t(cat.hintTh, cat.hintEn)} checked={on} />;
          })}
          <Button>{t("บันทึกความยินยอม", "Save consents")}</Button>
        </form>
      </Card>
      <Card>
        <h2>{t("ข้อมูลของคุณเก็บไว้ที่ไหน", "Where your data lives")}</h2>
        <p class="muted">{t("เราแยกข้อมูลเป็น 3 ส่วนที่ไม่ปะปนกัน", "We keep your data in three separate stores.")}</p>
        {stores.map(([th, en, dth, den]) => (
          <p>
            <strong>{t(th, en)}</strong>
            <br />
            {t(dth, den)}
          </p>
        ))}
      </Card>
      <Card>
        <h2>{t("เก็บข้อมูลนานแค่ไหน", "How long we keep it")}</h2>
        <ul>
          {retention.map(([th, en, rth, ren]) => (
            <li>
              <strong>{t(th, en)}:</strong> {t(rth, ren)}
            </li>
          ))}
        </ul>
        <p class="muted">{t("ระยะเวลาเหล่านี้เป็นค่าเริ่มต้นในช่วงทดลอง รอ กทม. ยืนยัน", "These are pilot defaults, pending BMA confirmation.")}</p>
      </Card>
      <Card>
        <h2>{t("ข้อมูลของฉัน", "My data")}</h2>
        <p>{t("ดาวน์โหลดสำเนาข้อมูลทั้งหมดของคุณเป็นไฟล์ JSON", "Download a copy of all your data as a JSON file.")}</p>
        <LinkButton href="/settings/privacy/export" kind="ghost">
          {t("ดาวน์โหลดข้อมูลของฉัน", "Download my data")}
        </LinkButton>
      </Card>
      <Card>
        <h2>{t("ปิดบัญชี", "Deactivate account")}</h2>
        <p>
          {t(
            "โปรไฟล์ของคุณจะถูกซ่อนทันที ออกจากระบบทุกอุปกรณ์ รูปถูกลบ และตัดความเชื่อมโยงกับข้อมูลวิจัย บัญชีจะถูกลบถาวรหลัง 30 วัน",
            "Your profile is hidden at once, you're signed out everywhere, your photo is deleted and the link to your research answers is cut. The account is permanently deleted after 30 days.",
          )}
        </p>
        <form method="post" action="/settings/deactivate">
          <Toggle name="confirm" label={t("ฉันเข้าใจและต้องการปิดบัญชี", "I understand and want to deactivate my account")} />
          <Button kind="danger">{t("ปิดบัญชี", "Deactivate")}</Button>
        </form>
      </Card>
    </>
  );
}

settingsRoutes.get("/settings/privacy", async (c) => {
  const current = await currentConsents(c, me(c).account.id);
  return page(c, { title: view(c).t("ศูนย์ความเป็นส่วนตัว", "Privacy Center"), tab: "me" }, <PrivacyCenter v={view(c)} current={current} />);
});

settingsRoutes.post("/settings/privacy", async (c) => {
  const user = me(c);
  const p = user.profile!;
  const body = await c.req.parseBody();
  const current = await currentConsents(c, user.account.id);
  const db = getDb(c.env);
  const queries: { toSQL(): { sql: string; params: unknown[] } }[] = [];
  const changed: Record<string, boolean> = {};
  for (const key of OPTIONAL) {
    const want = str(body[`consent_${key}`]) === "1";
    if (want !== !!current.get(key)) changed[key] = want;
  }
  // romance_data can only be withdrawn here; switching it on happens with romance mode.
  if (current.get("romance_data") && str(body.consent_romance_data) !== "1") {
    changed.romance_data = false;
    const intents = p.intents.filter((i) => i !== "romance");
    queries.push(
      db
        .update(profiles)
        .set({ romanceOn: false, genderIdentity: null, romanceOpenTo: null, intents: intents.length ? intents : ["friends"], updatedAt: new Date() })
        .where(eq(profiles.accountId, user.account.id)),
    );
  }
  for (const [category, granted] of Object.entries(changed)) {
    queries.push(db.insert(consents).values({ id: newId(), accountId: user.account.id, category, granted, version: CONSENT_VERSION }));
  }
  if (queries.length) {
    queries.push(audit(db, user.account.id, "consent.updated", { type: "account", id: user.account.id }, { changed }));
    await batch(c.env, queries);
  }
  return c.redirect("/settings/privacy?notice=saved");
});

settingsRoutes.get("/settings/privacy/export", async (c) => {
  const user = me(c);
  const id = user.account.id;
  const rid = user.account.researchId;
  const db = getDb(c.env);
  const [account, profile, consentRows, regs, choices, conns, shares, reps, notes, pulse, wb] = await Promise.all([
    db
      .select({ username: accounts.username, role: accounts.role, status: accounts.status, verification: accounts.verification, bkkRegistered: accounts.bkkRegistered, createdAt: accounts.createdAt })
      .from(accounts)
      .where(eq(accounts.id, id))
      .limit(1),
    db.select().from(profiles).where(eq(profiles.accountId, id)).limit(1),
    db.select({ category: consents.category, granted: consents.granted, version: consents.version, createdAt: consents.createdAt }).from(consents).where(eq(consents.accountId, id)).orderBy(desc(consents.createdAt)).limit(500),
    db
      .select({ event: events.title, eventEn: events.titleEn, startsAt: events.startsAt, status: registrations.status, registeredAt: registrations.createdAt, checkedInAt: registrations.checkedInAt, cancelledAt: registrations.cancelledAt })
      .from(registrations)
      .innerJoin(events, eq(events.id, registrations.eventId))
      .where(eq(registrations.accountId, id))
      .orderBy(desc(registrations.createdAt))
      .limit(1000),
    db
      .select({ event: events.title, person: profiles.nickname, choice: connectionChoices.choice, createdAt: connectionChoices.createdAt })
      .from(connectionChoices)
      .leftJoin(events, eq(events.id, connectionChoices.eventId))
      .leftJoin(profiles, eq(profiles.accountId, connectionChoices.toAccount))
      .where(eq(connectionChoices.fromAccount, id))
      .limit(2000),
    db
      .select({ id: connections.id, a: connections.aAccount, b: connections.bAccount, level: connections.level, event: events.title, createdAt: connections.createdAt, removedAt: connections.removedAt })
      .from(connections)
      .leftJoin(events, eq(events.id, connections.eventId))
      .where(or(eq(connections.aAccount, id), eq(connections.bAccount, id)))
      .limit(2000),
    db.select({ connectionId: contactShares.connectionId, method: contactShares.method, value: contactShares.value, createdAt: contactShares.createdAt }).from(contactShares).where(eq(contactShares.accountId, id)).limit(2000),
    db.select({ reason: reports.reason, details: reports.details, status: reports.status, createdAt: reports.createdAt }).from(reports).where(eq(reports.reporter, id)).orderBy(desc(reports.createdAt)).limit(500),
    db.select({ kind: notifications.kind, titleTh: notifications.titleTh, titleEn: notifications.titleEn, link: notifications.link, readAt: notifications.readAt, createdAt: notifications.createdAt }).from(notifications).where(eq(notifications.accountId, id)).orderBy(desc(notifications.createdAt)).limit(1000),
    rid
      ? db
          .select({ question: pulseQuestions.promptEn, questionTh: pulseQuestions.promptTh, answer: pulseResponses.answer, createdAt: pulseResponses.createdAt })
          .from(pulseResponses)
          .leftJoin(pulseQuestions, eq(pulseQuestions.id, pulseResponses.questionId))
          .where(eq(pulseResponses.researchId, rid))
          .limit(2000)
      : Promise.resolve([]),
    rid ? db.select({ phase: wellbeing.phase, q1: wellbeing.q1, q2: wellbeing.q2, q3: wellbeing.q3, createdAt: wellbeing.createdAt }).from(wellbeing).where(eq(wellbeing.researchId, rid)).limit(10) : Promise.resolve([]),
  ]);

  // Other people in my connections: nickname only.
  const otherIds = [...new Set(conns.map((x) => (x.a === id ? x.b : x.a)))];
  const others = otherIds.length
    ? await db.select({ id: profiles.accountId, nickname: profiles.nickname }).from(profiles).where(inArray(profiles.accountId, otherIds)).limit(otherIds.length)
    : [];
  const nick = new Map(others.map((o) => [o.id, o.nickname]));

  const data = {
    exportedAt: new Date().toISOString(),
    account: account[0] ?? null,
    profile: profile[0] ? (({ accountId: _a, ...rest }) => rest)(profile[0]) : null,
    consents: consentRows,
    registrations: regs,
    choicesIMade: choices,
    connections: conns.map((x) => ({ with: nick.get(x.a === id ? x.b : x.a) ?? null, level: x.level, event: x.event, createdAt: x.createdAt, removedAt: x.removedAt })),
    contactSharesIMade: shares.map((s) => {
      const conn = conns.find((x) => x.id === s.connectionId);
      return { with: conn ? (nick.get(conn.a === id ? conn.b : conn.a) ?? null) : null, method: s.method, value: s.value, createdAt: s.createdAt };
    }),
    reportsIFiled: reps,
    notifications: notes,
    cityPulse: { answers: pulse, wellbeing: wb },
  };
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="bkk-social-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
});

// ----------------------------------------------------------- deactivate --

settingsRoutes.post("/settings/deactivate", async (c) => {
  const v = view(c);
  const user = me(c);
  const body = await c.req.parseBody();
  if (str(body.confirm) !== "1") {
    const current = await currentConsents(c, user.account.id);
    return page(
      c,
      { title: v.t("ศูนย์ความเป็นส่วนตัว", "Privacy Center"), tab: "me", status: 400 },
      <>
        <Notice kind="error">{v.t("ติ๊กยืนยันก่อนปิดบัญชี", "Please tick the box to confirm deactivation.")}</Notice>
        <PrivacyCenter v={v} current={current} />
      </>,
    );
  }
  const db = getDb(c.env);
  const id = user.account.id;
  const photoKey = user.profile?.photoKey ?? null;
  await batch(c.env, [
    db.update(accounts).set({ status: "deactivated", deactivatedAt: new Date(), researchId: null }).where(eq(accounts.id, id)),
    db.update(profiles).set({ photoKey: null, updatedAt: new Date() }).where(eq(profiles.accountId, id)),
    db.delete(sessions).where(eq(sessions.accountId, id)),
    audit(db, id, "account.deactivated", { type: "account", id }),
  ]);
  if (photoKey) await deleteObject(c.env, photoKey).catch(() => {});
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.redirect("/?notice=deactivated");
});

// ------------------------------------------------------------- password --

function PasswordForm(props: { v: View; error?: string }) {
  const { t } = props.v;
  return (
    <>
      <p>
        <a href="/settings">← {t("ฉัน", "Me")}</a>
      </p>
      <h1>{t("เปลี่ยนรหัสผ่าน", "Change password")}</h1>
      {props.error ? <Notice kind="error">{props.error}</Notice> : null}
      <form method="post">
        <Field label={t("รหัสผ่านปัจจุบัน", "Current password")} name="current" type="password" required autocomplete="current-password" />
        <Field label={t("รหัสผ่านใหม่", "New password")} name="password" type="password" required autocomplete="new-password" hint={t("อย่างน้อย 8 ตัวอักษร", "At least 8 characters")} />
        <Field label={t("ยืนยันรหัสผ่านใหม่", "Confirm new password")} name="confirm" type="password" required autocomplete="new-password" />
        <Button>{t("เปลี่ยนรหัสผ่าน", "Change password")}</Button>
      </form>
    </>
  );
}

settingsRoutes.get("/settings/password", (c) => page(c, { title: view(c).t("เปลี่ยนรหัสผ่าน", "Change password"), tab: "me" }, <PasswordForm v={view(c)} />));

settingsRoutes.post("/settings/password", async (c) => {
  const v = view(c);
  const { t } = v;
  const user = me(c);
  const body = await c.req.parseBody();
  const current = typeof body.current === "string" ? body.current : "";
  const password = typeof body.password === "string" ? body.password : "";
  const confirm = typeof body.confirm === "string" ? body.confirm : "";
  const fail = (error: string) => page(c, { title: t("เปลี่ยนรหัสผ่าน", "Change password"), tab: "me", status: 400 }, <PasswordForm v={v} error={error} />);
  if (!(await verifyPassword(current, user.account.passwordHash, user.account.passwordSalt))) {
    return fail(t("รหัสผ่านปัจจุบันไม่ถูกต้อง", "Your current password is incorrect."));
  }
  if (passwordProblem(password)) return fail(t("รหัสผ่านต้องยาว 8–200 ตัวอักษร", "Password must be 8–200 characters."));
  if (password !== confirm) return fail(t("รหัสผ่านไม่ตรงกัน", "Passwords don't match."));
  const { hash, salt } = await hashPassword(password);
  const db = getDb(c.env);
  const token = getCookie(c, SESSION_COOKIE) ?? "";
  const thisSession = await sha256(token);
  await batch(c.env, [
    db.update(accounts).set({ passwordHash: hash, passwordSalt: salt }).where(eq(accounts.id, user.account.id)),
    // Sign out every OTHER device; keep this one.
    db.delete(sessions).where(and(eq(sessions.accountId, user.account.id), ne(sessions.id, thisSession))),
    audit(db, user.account.id, "account.password_changed", { type: "account", id: user.account.id }),
  ]);
  return c.redirect("/settings?notice=password_changed");
});

