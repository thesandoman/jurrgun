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
import { endPinkies } from "../services/pinky";
import { canBeWomenOnly, canSwitchToSingle, DEFAULT_RHYTHM, isPaused, PAUSE_WEEKS, RHYTHMS, romanceEligible } from "../domain/rules";
import { ReflectionFields } from "../ui/reflections";
import { reflectionsFromForm } from "../content/reflections";
import { syncQuizChange } from "./pulse";
import { DatingPrefSteps, prefsFromBody } from "./onboarding";
import { Flow } from "../ui/flow";
import { cleanPrefs, EXIT_REASONS } from "../content/dating";
import { canHost } from "../domain/hosting";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { and, asc, count, countDistinct, desc, eq, gt, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { batch, getDb } from "../db";
import { isPasswordless, passwordProblem } from "../domain/rules";
import { DISTRICTS, INTENTS, LANGUAGES, SOCIAL_STYLES, label, values, districtsAZ } from "../lib/constants";
import {
  cleanBio,
  COMM_STYLES,
  currentDatingDeck,
  currentDeck,
  ENERGY,
  isDatingPrompt,
  withoutDating,
  INTEREST_VALUES,
  LEARNING_MAX,
  MAX_COMM,
  MAX_INTERESTS,
  promptById,
  rankFromPositions,
  swapPrompt,
  validateAnswer,
  WEEKEND_RHYTHM,
  PAY_METHODS,
  MAX_PAY,
  BILL_STYLE,
  GETTING_AROUND,
  MAX_TRAVEL,
  DIET,
  SPICE,
  PETS,
  PUNCTUAL,
  BUDGETS,
  ACTIVITIES,
  MEALS,
  GROUP_SIZES,
  TIME_WINDOWS,
  ACCESS_NEEDS,
  type Answer,
  type Bio,
  isResidency,
  parseBangkok,
  parseEducation,
  parseOccupation,
  SIZE_STYLES,
  withGroupStyle,
  groupSizeOrLegacy,
  timesOrLegacy,
} from "../content/profile";
import { MeHub, type MeStep } from "../ui/me-hub";
import { SubLabel } from "../ui/section-head";
import { BangkokStory, CommPicker, EducationPicker, InterestPicker, OccupationPicker, OptChecks, OptRadios, ProfileFormScript, PromptInput } from "../ui/profile-form";
import type { Child } from "hono/jsx";
import { hashPassword, newId, sha256, verifyPassword } from "../lib/crypto";
import { allowedEndpoint } from "../lib/webpush";
import { vapidKeys } from "../services/push";
import { PushSwitch } from "../ui/push-switch";
import { emailEnabled } from "../services/email-code";
import type { AppEnv } from "../lib/env";
import { audit } from "../lib/records";
import { requireMember, SESSION_COOKIE } from "../lib/session";
import {
  accounts,
  connectionChoices,
  connections,
  datingIntents,
  exitReasons,
  consents,
  contactShares,
  events,
  blocks,
  feedback,
  invites,
  notifications,
  pushSubscriptions,
  oauthLinks,
  emailLinks,
  strikes,
  vibes,
  profileLinks,
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
import { myTables } from "../services/regular-tables";
import { linkInputValue, linkText, normaliseLink, NETWORKS, PROFILE_LINKS_CONSENT } from "../content/social-links";
import { linksSwitch, ownLinks } from "../services/profile-links";
import { CONSENT_VERSION, ConnectionsFields, connectionsPatch, dropPendingDating, pendingDatingIntent, withGenderSelf } from "./onboarding";
import { consentEffects, consentRow, deleteDatingIntents, hasConsent, NOTIFICATIONS_CONSENT, privateFieldConsents, ROMANCE_CONSENT } from "../services/consent";
import { isArchetype, loadVibe } from "./quiz";
import { ARCHETYPES, displayName } from "../vibe/archetypes";
import { fmtDate, L, type T } from "../lib/i18n";
import { Sheet } from "../ui/sheet";
import { releaseUpcomingSeats } from "../services/events";

export const settingsRoutes = new Hono<AppEnv>();
settingsRoutes.use("/settings", requireMember);
settingsRoutes.use("/settings/*", requireMember);

type C = Context<AppEnv>;
const me = (c: C) => c.var.user!;

// ------------------------------------------------------------- helpers --

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
  const db = getDb(c.env);
  const now = new Date();
  const [src, vibe, [been], [upcoming], [circle], tables, [nextUp]] = await Promise.all([
    photoSrc(c, p.photoKey),
    loadVibe(c.env, user.account.id),
    db.select({ n: count() }).from(registrations).where(and(eq(registrations.accountId, user.account.id), isNotNull(registrations.checkedInAt))),
    db
      .select({ n: count() })
      .from(registrations)
      .innerJoin(events, eq(events.id, registrations.eventId))
      .where(and(eq(registrations.accountId, user.account.id), inArray(registrations.status, ["confirmed", "offered", "waitlisted"]), gt(events.startsAt, now), ne(events.status, "cancelled"))),
    // A crew = the people I met at one event; the circle is all of them.
    db
      // People, not meetings: someone met at three events is one person (as on My people).
      .select({ n: countDistinct(sql`case when ${connections.aAccount} = ${user.account.id} then ${connections.bAccount} else ${connections.aAccount} end`), crews: countDistinct(connections.eventId) })
      .from(connections)
      .where(and(or(eq(connections.aAccount, user.account.id), eq(connections.bAccount, user.account.id)), isNull(connections.removedAt))),
    // People can sit at several regular tables; the count gets its own tile.
    myTables(db, user.account.id),
    // The next table I'm seated at: Me leads with it (owner, Phase 2).
    db
      .select({ id: events.id, title: events.title, titleEn: events.titleEn, startsAt: events.startsAt, district: events.district })
      .from(registrations)
      .innerJoin(events, eq(events.id, registrations.eventId))
      .where(and(eq(registrations.accountId, user.account.id), eq(registrations.status, "confirmed"), gt(events.startsAt, now), ne(events.status, "cancelled")))
      .orderBy(asc(events.startsAt))
      .limit(1),
  ]);
  const [dating] = await db.select({ mode: datingIntents.mode }).from(datingIntents).where(eq(datingIntents.accountId, user.account.id)).limit(1);
  const dates = dating?.mode === "dating" || dating?.mode === "dating_only";
  const vibeKey = vibe && isArchetype(vibe.archetype) ? vibe.archetype : null;
  const crews = Number(circle?.crews ?? 0);
  const bio = cleanBio(p.bio);
  const steps: MeStep[] = [
    { done: !!p.photoKey, label: t("ใส่รูป", "Add a photo"), href: "/settings/profile#photo" },
    { done: !!vibeKey, label: t("หาไทป์ของคุณ", "Find your type"), href: "/quiz" },
    { done: p.interests.length >= 3, label: t("ความสนใจอีกนิด", "A few more interests"), href: "/settings/profile#interests" },
    { done: !!bio.occupation, label: t("บอกว่าทำงานอะไร", "What you do"), href: "/settings/profile#facts" },
    { done: !!bio.story, label: t("เรื่องของคุณกับกรุงเทพฯ", "Your Bangkok story"), href: "/settings/profile#bangkok" },
    { done: !!bio.comm?.length, label: t("สไตล์การติดต่อ", "How you keep in touch"), href: "/settings/profile#comm" },
    { done: !!(bio.energy || bio.weekend), label: t("ข้อมูลสั้น ๆ", "Quick facts"), href: "/settings/profile#facts" },
    { done: Object.keys(bio.answers ?? {}).filter((id) => !isDatingPrompt(id)).length >= 2, label: t("ตอบคำถามของคุณ", "Answer your prompts"), href: "/settings/profile#prompts" },
    ...(romanceEligible(p)
      ? [{ done: Object.keys(bio.answers ?? {}).some(isDatingPrompt), label: t("ตอบคำถามเรื่องเดต", "Answer a dating prompt"), href: "/settings/profile#dating-prompts" }]
      : []),
  ];
  const created = user.account.createdAt;
  const memberSince = created ? created.toLocaleDateString(lang === "en" ? "en-GB" : "th-TH", { month: "short", year: "numeric" }) : null;
  const typeCard =
    vibe && vibeKey ? (
      // A link to the type only: showing it at Tables and retaking the quiz live on /quiz/result (owner, C1).
      <a href="/quiz/result" class="teaser">
        <b class="big" aria-hidden="true">{ARCHETYPES[vibeKey].emoji}</b>
        <span>
          <strong>{L(lang, displayName(vibeKey, vibe.modifier))}</strong>
          <small class="muted">{L(lang, ARCHETYPES[vibeKey].tagline)}</small>
        </span>
      </a>
    ) : (
      <a href="/quiz" class="teaser">
        <b class="big" aria-hidden="true">🧭</b>
        <span>
          <strong>{t("หาไทป์กรุงเทพฯ ของคุณ", "Find your Bangkok Type")}</strong>
          <small class="muted">{t("16 ข้อ ราว 3 นาที", "16 quick questions, about 3 minutes")}</small>
        </span>
      </a>
    );
  const badge =
    user.account.bkkRegistered === "verified" ? (
      <form method="post" action="/settings/badge" class="card inline-toggle">
        <label class="toggle" style="margin:0">
          <input type="checkbox" name="show" value="1" checked={p.showResidentBadge} onchange="this.form.requestSubmit?this.form.requestSubmit():this.form.submit()" />
          <span>🏅 {t("แสดงตราผู้มีทะเบียนบ้าน กทม.", "Show my Bangkok Registered Resident badge")}</span>
        </label>
        <noscript>
          <button type="submit" class="btn ghost">{t("บันทึก", "Save")}</button>
        </noscript>
      </form>
    ) : undefined;
  const gOut = t("ออกไปเจอกัน", "Out and about");
  const gYou = t("ตัวฉันและสิ่งที่ชอบ", "You and your preferences");
  const gAcct = t("ความเป็นส่วนตัวและบัญชี", "Privacy and account");
  const paused = isPaused(p, now);
  const quick = (
    <section class="quick" id="quick" aria-label={t("สวิตช์ด่วน", "Quick switches")}>
      <SubLabel>⚡ {t("สวิตช์ด่วน", "Quick switches")}</SubLabel>
      <div class="glist quick-list">
      <QuickSwitch k="pause" on={paused} emoji="⏸️" title={t("พัก Jurrgun 1 สัปดาห์", "Take a week off")} hint={paused ? t(`พักอยู่ถึง ${fmtDate(p.pausedUntil!, lang)}`, `On a break until ${fmtDate(p.pausedUntil!, lang)}`) : t("ไม่มีบัดดี้ใหม่ คนรู้จักและแชตยังอยู่", "No new buddies. People and chats stay.")} />
      {p.pronouns ? <QuickSwitch k="pronouns" on={p.showPronouns} emoji="🏷️" title={t(`แสดงสรรพนาม (${p.pronouns})`, `Show my pronouns (${p.pronouns})`)} hint={t("บนโปรไฟล์และการ์ดบัดดี้", "On my profile and buddy card")} /> : null}
      {p.relationship === "relationship" || p.relationship === "married" ? null : (
        <QuickSwitch
          k="romance"
          love
          on={romanceEligible(p)}
          emoji="💘"
          title={t("เปิดใจมากกว่าเพื่อน", "Open to something more")}
          hint={
            romanceEligible(p)
              ? t("รู้กันเฉพาะเมื่อเลือกตรงกัน", "Only shown when it's mutual.")
              : t("สำหรับคนโสด เป็นความลับเสมอ", "For singles. Always private.")
          }
          consent={{
            t,
            lead: t(
              "เปิดแล้ว คุณจะเลือก 'เปิดใจมากกว่าเพื่อน' กับคนที่เจอได้ และจะรู้ผลก็ต่อเมื่ออีกฝ่ายเลือกเหมือนกัน สถานะของคุณจะเป็น 'โสด' ข้อมูลเรื่องเดตเป็นความลับ ทีมงานดูไม่ได้ และถูกลบทันทีเมื่อปิด",
              "Once on, you can choose 'open to something more' with people you meet, and you only find out if it's mutual. Your status becomes Single. Dating details stay private, staff can't see them, and they're deleted the moment you switch off.",
            ),
            tick: t("ฉันโสด และยินยอมให้เก็บข้อมูลเรื่องเดตของฉัน (ข้อมูลอ่อนไหวตาม PDPA)", "I'm single, and I agree to my dating details being stored (sensitive data under PDPA)"),
            go: t("💘 เปิดเลย", "💘 Switch it on"),
          }}
        />
      )}
      {vapidKeys(c.env) ? <PushSwitch t={t} publicKey={vapidKeys(c.env)!.publicKey} /> : null}
      {canBeWomenOnly(p.gender) ? <QuickSwitch k="womenOnly" on={p.womenOnly} emoji="🌸" title={t("เฉพาะผู้หญิงและนอนไบนารี", "Women & non-binary only")} hint={t("บัดดี้ การ์ด แมตช์ และแชต", "Buddies, deck, matches and chats")} /> : null}
      </div>
    </section>
  );
  return page(
    c,
    { title: t("ฉัน", "Me"), tab: "me" },
    <MeHub
      v={v}
      nickname={p.nickname}
      photo={src}
      place={[label(DISTRICTS, p.district, lang), p.showPronouns && p.pronouns ? p.pronouns : ""].filter(Boolean).join(" · ")}
      memberSince={memberSince}
      newcomer={p.newcomer}
      ask={
        // Six months in, still marked new: ask once instead of keeping the label (and the newcomer card on Discover) forever.
        p.newcomer && !bio.newcomerAsked && created && now.getTime() - created.getTime() > 182 * 86_400_000 ? (
          <form method="post" action="/settings/newcomer" class="card me-ask">
            <p>
              <strong>🌱 {t("ยังรู้สึกว่าเพิ่งมากรุงเทพฯ อยู่ไหม?", "Still new to Bangkok?")}</strong>
              <small class="muted">{t(`ไม่ใหม่แล้ว? เราจะเอาป้าย "มาใหม่" ออก`, `Not anymore? We'll drop the "New" label.`)}</small>
            </p>
            <div class="row">
              <button class="btn ghost" name="still" value="1">{t("ยังใหม่อยู่", "Yes, still new")}</button>
              <button class="btn primary" name="still" value="0">{t("ไม่ใหม่แล้ว", "Not anymore")}</button>
            </div>
          </form>
        ) : undefined
      }
      interests={p.interests}
      next={
        nextUp ? (
          <a class="card me-next" href={`/me/events/${nextUp.id}/pass`}>
            <small>{t("โต๊ะถัดไป", "Your next table")}</small>
            <span>
              {fmtDate(nextUp.startsAt, lang)} · {label(DISTRICTS, nextUp.district, lang)}
            </span>
            <b class="me-next-go">
              {lang === "en" ? nextUp.titleEn ?? nextUp.title : nextUp.title} <span aria-hidden="true">→</span>
            </b>
          </a>
        ) : (
          <a class="card me-next" href="/events">
            <small>{t("โต๊ะถัดไป", "Your next table")}</small>
            <span>{t("ยังไม่มีนัด", "Nothing booked yet.")}</span>
            <b class="me-next-go">
              {t("หาโต๊ะสัปดาห์นี้", "Find a table this week")} <span aria-hidden="true">→</span>
            </b>
          </a>
        )
      }
      // No tiles until a first check-in or a first person in My people (owner card).
      stats={Number(been?.n ?? 0) + Number(circle?.n ?? 0) === 0 ? [] : [
        { emoji: "🎉", n: Number(been?.n ?? 0), label: t("กิจกรรมที่ไปมา", "Events been"), href: "/me/events#past", tint: "green" },
        {
          emoji: "🤝",
          n: Number(circle?.n ?? 0),
          label: t("คนรู้จักของฉัน", "My people"),
          sub: crews > 0 ? t(`จาก ${crews} กิจกรรม`, `met at ${crews} ${crews === 1 ? "event" : "events"}`) : undefined,
          href: "/connections",
          tint: "teal",
        },
        { emoji: "🪑", n: tables.length, label: t("โต๊ะประจำ", tables.length === 1 ? "Table" : "Tables"), href: "/tables", tint: "sky" },
        { emoji: "🗓️", n: Number(upcoming?.n ?? 0), label: t("ที่จะไป", "Coming up"), href: "/me/events#upcoming", tint: "lime" },
      ]}
      steps={steps}
      type={typeCard}
      typeLink={vibeKey ? { href: "/types", label: t("ทุกไทป์", "All types") } : undefined}
      badge={badge}
      quick={quick}
      links={[
        { href: "/learn", emoji: "📚", title: t("เรียนรู้", "Learn"), hint: t("เพื่อนใหม่ สุขภาพใจ เที่ยวกรุงเทพฯ", "Friends, wellbeing, getting around"), tint: "sky", group: gOut },
        { href: "/safety", emoji: "🛡️", title: t("ปลอดภัยไว้ก่อน", "Safety net"), hint: t("สายด่วน แชร์แผนนัด", "Helplines, share your plans"), tint: "mint", group: gOut },
        canHost(user.account, true)
          ? { href: "/host", emoji: "🎪", title: t("จัดกิจกรรม", "Host an event"), hint: t("ฟรี หรือจ่ายที่สถานที่", "Free or pay at the venue"), tint: "lime" as const, group: gOut }
          : { href: "/circles/lead", emoji: "👑", title: t("เป็นเจ้าภาพโต๊ะประจำ", "Host a Regular Table"), hint: t("จัดแฮงเอาต์ของคุณเอง", "Run your own hangouts"), tint: "lime" as const, group: gOut },
        ...(dates
          ? [{ href: "/settings/dating", emoji: "💘", title: t("สิ่งที่มองหาในการเดต", "Dating preferences"), hint: t("เป้าหมาย จังหวะ เดตแรก (ส่วนตัว)", "Goal, pace, first dates (private)"), tint: "teal" as const, group: gYou }]
          : []),
        { href: "/me/month", emoji: "🌱", title: t("เดือนนี้ของฉัน", "My month in people"), hint: t("คนที่เจอ ที่ที่ไป ไม่นับเวลาบนจอ", "People met, places, never screen time"), tint: "green", group: gOut },
        { href: "/thanks", emoji: "💌", title: t("คำขอบคุณ", "Thank-yous"), hint: t("ข้อความส่วนตัวจากคนที่เจอ", "Private notes from people you met"), tint: "sun", group: gOut },
        { href: "/settings/habits", emoji: "🌿", title: t("นิสัยดี ๆ และการพัก", "Healthy habits"), hint: isPaused(p, now) ? t("กำลังพักอยู่", "On a break") : t("นัดต่อสัปดาห์ พัก Jurrgun", "Plans a week, take a break"), tint: "mint", group: gYou },
        { href: "/settings/profile", emoji: "✏️", title: t("แก้ไขโปรไฟล์", "Edit profile"), hint: t("รูป ความสนใจ อาชีพ คำถามของคุณ", "Photo, interests, work, your prompts"), tint: "green", group: gYou },
        { href: "/pulse", emoji: "💬", title: t("City Pulse: ช่วยพัฒนาเมือง", "City Pulse: help the city"), hint: t("คำถามสั้น ๆ ไม่ระบุตัวตน", "Quick, anonymous city questions"), tint: "sky", group: gAcct },
        { href: "/settings/connections", emoji: "💞", title: t("ตั้งค่าการรู้จักกันหลังกิจกรรม", "Connection preferences"), hint: t("สถานะความสัมพันธ์ ช่วงอายุ (ส่วนตัว)", "Relationship status, age range (private)"), tint: "teal", group: gYou },
        { href: "/settings/privacy", emoji: "🔒", title: t("ศูนย์ความเป็นส่วนตัว", "Privacy Center"), hint: t("ความยินยอม ดาวน์โหลดข้อมูล ปิดบัญชี", "Consents, download my data, deactivate"), tint: "mint", group: gAcct },
        ...(emailEnabled(c.env)
          ? [{ href: "/settings/email", emoji: "✉️", title: t("อีเมลสำหรับเข้าสู่ระบบ", "Sign-in email"), hint: t("เข้าสู่ระบบด้วยรหัสทางอีเมล", "Sign in with a code by email"), tint: "sky" as const, group: gAcct }]
          : []),
        // Google / LINE accounts have no password to change.
        ...(isPasswordless(user.account.username)
          ? []
          : [{ href: "/settings/password", emoji: "🔑", title: t("เปลี่ยนรหัสผ่าน", "Change password"), hint: t("ต้องใช้รหัสผ่านปัจจุบัน", "Needs your current password"), tint: "sun" as const, group: gAcct }]),
      ]}
    />,
  );
});

/** Web Push on this phone or browser: the page subscribes, then tells us where to send. */
settingsRoutes.post("/settings/push", async (c) => {
  const user = me(c);
  const body = (await c.req.json().catch(() => null)) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";
  if (!vapidKeys(c.env)) return c.json({ error: "Notifications aren't switched on yet" }, 503);
  if (!allowedEndpoint(endpoint) || endpoint.length > 1000 || !/^[\w-]{80,100}$/.test(p256dh) || !/^[\w-]{16,32}$/.test(auth)) return c.json({ error: "Not a push subscription" }, 400);
  const db = getDb(c.env);
  // One endpoint belongs to one member: a shared browser moves to whoever turned it on last.
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  const mine = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.accountId, user.account.id)).orderBy(asc(pushSubscriptions.createdAt)).limit(20);
  if (mine.length >= 10) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, mine[0].id));
  // Notifications on this phone means event reminders too (the consent the hourly clock reads),
  // so switching on also says yes there when the latest answer was no.
  const [said] = await db
    .select({ granted: consents.granted })
    .from(consents)
    .where(and(eq(consents.accountId, user.account.id), eq(consents.category, "notifications")))
    .orderBy(desc(consents.createdAt))
    .limit(1);
  await batch(c.env, [
    db.insert(pushSubscriptions).values({ id: newId(), accountId: user.account.id, endpoint, p256dh, auth }),
    ...(said?.granted
      ? []
      : [
          db.insert(consents).values({ id: newId(), accountId: user.account.id, category: "notifications", granted: true, version: CONSENT_VERSION }),
          audit(db, user.account.id, "consent.updated", { type: "account", id: user.account.id }, { changed: ["notifications"], via: "push_switch" }),
        ]),
  ]);
  return c.json({ ok: true });
});

settingsRoutes.post("/settings/push/off", async (c) => {
  const user = me(c);
  const body = (await c.req.json().catch(() => null)) as { endpoint?: unknown } | null;
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const db = getDb(c.env);
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.accountId, user.account.id), eq(pushSubscriptions.endpoint, endpoint)));
  // Privacy R7: switching notifications off on the last phone or browser also withdraws the
  // reminders consent (switching on says yes, above). Another device still on keeps it.
  const [left] = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.accountId, user.account.id)).limit(1);
  if (!left && (await hasConsent(db, user.account.id, NOTIFICATIONS_CONSENT))) {
    await batch(c.env, [
      consentRow(db, user.account.id, NOTIFICATIONS_CONSENT, false),
      audit(db, user.account.id, "consent.updated", { type: "account", id: user.account.id }, { changed: ["notifications"], via: "push_switch_off" }),
    ]);
  }
  return c.json({ ok: true });
});

/** A one-tap switch on Me: posts to /settings/quick and comes back. */
function QuickSwitch(props: { k: string; on: boolean; emoji: string; title: string; hint: string; love?: boolean; consent?: { t: T; lead: string; tick: string; go: string } }) {
  // Switching on needs a clear yes (PDPA, owner Phase 2): the switch opens a short sheet with an explicit tick. Off stays one tap.
  if (props.consent && !props.on)
    return (
      // The consent sheet is the shared Sheet (B2): a bottom sheet on phones, a popover on laptops.
      <Sheet
        t={props.consent.t}
        class={props.love ? "qs-sheet love" : "qs-sheet"}
        title={props.title}
        triggerClass={props.love ? "qs love" : "qs"}
        trigger={
          <>
            <span aria-hidden="true">{props.emoji}</span>
            <span>
              <b>{props.title}</b>
              <small>{props.hint}</small>
            </span>
            <span class="sw" aria-hidden="true" />
          </>
        }
      >
        <form method="post" action="/settings/quick" class="qs-consent">
          <input type="hidden" name="key" value={props.k} />
          <input type="hidden" name="on" value="1" />
          <p>{props.consent.lead}</p>
          <label class="toggle">
            <input type="checkbox" name="consent" value="1" required />
            <span>{props.consent.tick}</span>
          </label>
          <button type="submit" class={props.love ? "btn love" : "btn primary"}>
            {props.consent.go}
          </button>
        </form>
      </Sheet>
    );
  return (
    <form method="post" action="/settings/quick">
      <input type="hidden" name="key" value={props.k} />
      <input type="hidden" name="on" value={props.on ? "0" : "1"} />
      <button type="submit" class={props.love ? "qs love" : "qs"} aria-pressed={props.on ? "true" : "false"}>
        <span aria-hidden="true">{props.emoji}</span>
        <span>
          <b>{props.title}</b>
          <small>{props.hint}</small>
        </span>
        <span class="sw" aria-hidden="true" />
      </button>
    </form>
  );
}

settingsRoutes.post("/settings/quick", async (c) => {
  const user = me(c);
  const p = user.profile!;
  const body = await c.req.parseBody();
  const on = str(body.on) === "1";
  // Switching on asks for the explicit tick from the consent sheet; an old one-tap post without it goes to the sheet.
  if (str(body.key) === "romance") {
    if (on && str(body.consent) !== "1") return c.redirect("/settings#quick");
    return romanceQuick(c, on);
  }
  const set: Partial<typeof profiles.$inferInsert> = {};
  switch (str(body.key)) {
    case "pause":
      set.pausedUntil = on ? new Date(Date.now() + 7 * 86_400_000) : null;
      break;
    case "pronouns":
      if (p.pronouns) set.showPronouns = on;
      break;
    case "womenOnly":
      if (canBeWomenOnly(p.gender)) set.womenOnly = on;
      break;
  }
  if (Object.keys(set).length) await getDb(c.env).update(profiles).set({ ...set, updatedAt: new Date() }).where(eq(profiles.accountId, user.account.id));
  return c.redirect("/settings?notice=saved");
});

// "Still new to Bangkok?" (asked once, six months in): Not anymore takes the label off.
settingsRoutes.post("/settings/newcomer", async (c) => {
  const user = me(c);
  const p = user.profile!;
  const body = await c.req.parseBody();
  const still = str(body.still) === "1";
  await getDb(c.env)
    .update(profiles)
    .set({ newcomer: still ? p.newcomer : false, bio: { ...cleanBio(p.bio), newcomerAsked: true }, updatedAt: new Date() })
    .where(eq(profiles.accountId, user.account.id));
  return c.redirect("/settings?notice=saved");
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
//
// The richer profile: photo, basics, "here for", interests by group,
// communication style, quick facts and the member's own prompt deck
// (src/content/profile.ts). Every field is validated server-side by kind.

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
  bio: Bio;
  /** Social links as typed (network key to text) and the "show my links to my people" switch. Loaded when missing. */
  links?: Record<string, string>;
  linksOn?: boolean;
};

function Section(props: { id?: string; emoji: string; title: string; hint?: string; children: Child }) {
  return (
    <section class="pf-section" id={props.id}>
      <h2>
        <span aria-hidden="true">{props.emoji}</span> {props.title}
      </h2>
      {props.hint ? <p class="muted">{props.hint}</p> : null}
      {props.children}
    </section>
  );
}

/**
 * Social links (owner, 2026-10-16): one optional field per network and the switch, which is off
 * until the member turns it on. Only mutual connections ever see them (services/profile-links.ts).
 */
function LinksSection(props: { v: View; links: Record<string, string>; on: boolean; errorField?: string; error?: string }) {
  const { t } = props.v;
  return (
    <Section id="links" emoji="🔗" title={t("ลิงก์โซเชียล", "Social links")} hint={t("เห็นได้เฉพาะคนที่เลือกกันทั้งสองฝ่าย", "Only people you both chose can see these")}>
      <input type="hidden" name="links_present" value="1" />
      <Toggle name="linksOn" label={t("ให้คนรู้จักของฉันเห็นลิงก์", "Show my links to my people")} checked={props.on} />
      <div class="pf-links">
        {NETWORKS.map((n) => (
          <Field
            label={`${n.icon} ${t(n.th, n.en)}`}
            name={`link_${n.key}`}
            value={props.links[n.key] ?? ""}
            maxlength={200}
            autocomplete="off"
            placeholder={n.kind === "url" ? "https://" : n.at ? t("@ชื่อผู้ใช้ หรือวางลิงก์", "@name or profile link") : t("ชื่อในลิงก์ หรือวางลิงก์", "Name or profile link")}
            error={props.errorField === n.key ? props.error : undefined}
          />
        ))}
      </div>
    </Section>
  );
}

function ProfileForm(props: { v: View; vals: ProfileVals; deck: string[]; datingDeck: string[]; photo: string | null; hasPhoto: boolean; promptPhoto: (id: string) => string | null; error?: string; errorField?: string }) {
  const { t, lang } = props.v;
  const vals = props.vals;
  const bio = vals.bio;
  return (
    <>
      <p class="spread">
        <a href="/settings">← {t("ฉัน", "Me")}</a>
        <a href="/me/profile">👀 {t("ดูโปรไฟล์ของฉัน", "Preview my profile")}</a>
      </p>
      <h1>{t("แก้ไขโปรไฟล์", "Edit profile")}</h1>
      <p class="muted">{t("ทุกอย่างไม่บังคับ ยกเว้นชื่อเล่น เขต ภาษา และความสนใจ เขียนแบบที่เป็นตัวคุณ", "Everything is optional except nickname, district, languages and interests. Be yourself.")}</p>
      {props.error ? <Notice kind="error">{props.error}</Notice> : null}
      {/* A long page: shortcuts to each part, kept in view while scrolling. */}
      <nav class="pf-jump" aria-label={t("ไปยังส่วนต่าง ๆ", "Jump to")}>
        <a href="#basics">{t("พื้นฐาน", "Basics")}</a>
        <a href="#interests">{t("ความสนใจ", "Interests")}</a>
        <a href="#bangkok">{t("กรุงเทพฯ", "Bangkok")}</a>
        <a href="#facts">{t("ข้อมูลสั้น ๆ", "Facts")}</a>
        <a href="#prefs">{t("การนัดเจอ", "Meetups")}</a>
        <a href="#prompts">{t("คำถาม", "Prompts")}</a>
        <a href="#links">{t("ลิงก์", "Links")}</a>
      </nav>
      <form method="post" action="/settings/profile" enctype="multipart/form-data" data-guard="">
        {/* Enter / "Go" submits with the FIRST submit button. Without this one that
            would be a prompt's "↻ Different question", which swaps the prompt and
            deletes its answer. Off-screen rather than display:none so Safari uses it. */}
        <button type="submit" class="sr-only" tabindex={-1} aria-hidden="true">
          {t("บันทึก", "Save")}
        </button>
        <Section id="photo" emoji="📸" title={t("รูปโปรไฟล์", "Profile photo")} hint={t("ไม่บังคับ รูปที่เห็นหน้าชัด ๆ ช่วยให้จำกันได้ในงาน", "Optional. A clear, friendly photo helps people find you at events.")}>
          <div class="pf-photo-main">
            {props.photo ? (
              <img src={props.photo} alt={t("รูปโปรไฟล์ปัจจุบัน", "Current profile photo")} />
            ) : (
              <div class="pf-initial" aria-hidden="true">
                {[...(vals.nickname || "?")][0].toUpperCase()}
              </div>
            )}
            <div class="field" style="margin:0;flex:1;min-width:200px">
              {/* The browser's own picker speaks the browser's language; this button speaks the page's. */}
              <span class="field-label" id="f-photo-h">{t("อัปโหลดรูปใหม่", "Upload a new photo")}</span>
              <label class="btn ghost file-btn" for="f-photo">
                📷 {t("เลือกรูป", "Choose a photo")}
              </label>
              <input id="f-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" aria-labelledby="f-photo-h" />
              <span class="file-name muted" aria-live="polite">{t("ยังไม่ได้เลือกรูป", "No photo chosen")}</span>
              <script
                dangerouslySetInnerHTML={{
                  __html: `(function(){var i=document.getElementById("f-photo"),n=i&&i.parentNode.querySelector(".file-name");if(!i||!n)return;i.addEventListener("change",function(){if(i.files&&i.files[0])n.textContent=i.files[0].name})})();`,
                }}
              />
              <small>{t("JPG, PNG หรือ WebP ไม่เกิน 5 MB ช่วงทดลองไม่ต้องใช้รูปจริง", "JPG, PNG or WebP, up to 5 MB. No real photos needed in the prototype.")}</small>
            </div>
          </div>
          {props.hasPhoto ? <Toggle name="removePhoto" label={t("ลบรูปโปรไฟล์", "Remove my photo")} /> : null}
        </Section>

        <Section id="basics" emoji="👋" title={t("ข้อมูลพื้นฐาน", "The basics")}>
          <Field label={t("ชื่อเล่น", "Nickname")} name="nickname" value={vals.nickname} required maxlength={30} />
          <Select label={t("เขตที่ใช้ชีวิตเป็นหลัก", "Main district")} name="district" options={districtsAZ(lang)} value={vals.district} lang={lang} required />
          <Choices legend={t("ภาษาที่พูดได้", "Languages you're comfortable in")} name="languages" options={LANGUAGES} values={vals.languages} lang={lang} hint={t("เลือกอย่างน้อย 1", "Pick at least one")} />
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
        </Section>

        <Section emoji="🎯" title={t("มาที่นี่เพื่อ", "Here for")}>
          <Choices legend={t("มาที่นี่เพื่อ…", "I'm here for…")} name="intents" options={INTENTS} values={vals.intents} lang={lang} />
          {/* Group size and free times are asked once, under Meetup preferences. */}
          <Choices legend={t("ชอบเจอคนแบบไหน", "How do you like to meet people?")} name="socialStyles" options={SOCIAL_STYLES.filter((o) => !SIZE_STYLES.includes(o.value))} values={vals.socialStyles} lang={lang} />
        </Section>

        <Section id="interests" emoji="🍜" title={t("ความสนใจ", "Interests")} hint={t(`เลือก 1 ถึง ${MAX_INTERESTS} อย่าง ใช้จัดโต๊ะให้เจอคนที่ชอบคล้ายกัน`, `Pick 1 to ${MAX_INTERESTS}. We use them to seat you with people who share them.`)}>
          <InterestPicker v={props.v} values={vals.interests} folded />
        </Section>

        <Section id="comm" emoji="💬" title={t("สไตล์การติดต่อ", "How you keep in touch")} hint={t(`เลือกได้สูงสุด ${MAX_COMM} แบบ`, `Pick up to ${MAX_COMM}`)}>
          <CommPicker v={props.v} values={bio.comm} />
        </Section>

        <Section id="bangkok" emoji="🛺" title={t("กรุงเทพฯ ของฉัน", "My Bangkok")} hint={t("ไม่บังคับทั้งหมด ช่วยให้คนในโต๊ะรู้จักคุณมากขึ้น", "All optional. Helps your table get to know you.")}>
          <BangkokStory v={props.v} story={bio.story} time={bio.bkkTime} hometown={bio.hometown} guide={bio.guide} residency={bio.residency} />
          <ReflectionFields v={props.v} value={bio.reflections} />
        </Section>

        <Section id="facts" emoji="✨" title={t("ข้อมูลสั้น ๆ", "Quick facts")}>
          <OccupationPicker v={props.v} value={bio.occupation} other={bio.occupationOther} />
          <EducationPicker v={props.v} bio={bio} />
          <Field
            label={t("กำลังเรียนรู้", "Currently learning")}
            name="learning"
            value={bio.learning ?? ""}
            maxlength={LEARNING_MAX}
            placeholder={t("เช่น ทำขนมปัง ว่ายน้ำท่าผีเสื้อ", "e.g. Sourdough, butterfly stroke")}
            hint={t(`ไม่เกิน ${LEARNING_MAX} ตัวอักษร`, `Up to ${LEARNING_MAX} characters`)}
          />
          <Choices legend={t("ภาษาที่กำลังหัด", "Languages I'm learning")} name="learningLangs" options={LANGUAGES} values={bio.learningLangs ?? []} lang={lang} />
          <fieldset class="choices">
            <legend>{t("ตอนเจอกันครั้งแรก ฉันมักจะ…", "My first-meet energy")}</legend>
            <OptRadios v={props.v} name="energy" options={ENERGY} value={bio.energy} />
          </fieldset>
          <fieldset class="choices">
            <legend>{t("วันหยุดสไตล์ฉัน", "My weekend rhythm")}</legend>
            <OptRadios v={props.v} name="weekendRhythm" options={WEEKEND_RHYTHM} value={bio.weekend} />
          </fieldset>
        </Section>

        <Section id="prefs" emoji="🎯" title={t("ชอบเจอกันแบบไหน", "Meetup preferences")} hint={t("ใช้เลือกแผนประจำสัปดาห์ให้คุณ ไม่บังคับ", "Used to pick your weekly plan. All optional.")}>
          <fieldset class="choices">
            <legend>{t("งบต่อหนึ่งนัด", "Budget per meetup")}</legend>
            <OptRadios v={props.v} name="budget" options={BUDGETS} value={bio.budget} />
          </fieldset>
          <fieldset class="choices">
            <legend>{t("ชอบทำอะไร", "Favourite kinds of meetup")}</legend>
            <OptChecks v={props.v} name="activities" options={ACTIVITIES} values={bio.activities} />
          </fieldset>
          <fieldset class="choices">
            <legend>{t("มื้อที่ชอบนัด", "Meals I like to meet over")}</legend>
            <OptChecks v={props.v} name="meals" options={MEALS} values={bio.meals} />
          </fieldset>
          <fieldset class="choices">
            <legend>{t("ขนาดกลุ่มที่สบายใจ", "Group size I'm comfortable with")}</legend>
            <OptRadios v={props.v} name="groupSize" options={GROUP_SIZES} value={groupSizeOrLegacy(bio.groupSize, vals.socialStyles)} />
          </fieldset>
          <fieldset class="choices">
            <legend>{t("ช่วงเวลาที่มักว่าง", "When I'm usually free")}</legend>
            <OptChecks v={props.v} name="times" options={TIME_WINDOWS} values={timesOrLegacy(bio.times, vals.eventStyle)} />
          </fieldset>
          <fieldset class="choices">
            <legend>{t("ความต้องการด้านการเข้าถึง", "Access needs")}</legend>
            <OptChecks v={props.v} name="access" options={ACCESS_NEEDS} values={bio.access} />
          </fieldset>
        </Section>

        <Section id="out" emoji="🧾" title={t("เวลาออกไปเจอกัน", "Out and about")} hint={t("ไม่บังคับ ช่วยให้นัดแรกง่ายขึ้น", "All optional. Makes a first meet smoother.")}>
          <fieldset class="choices">
            <legend>{t(`จ่ายเงินแบบไหนสะดวก (ไม่เกิน ${MAX_PAY} แบบ)`, `How I like to pay (up to ${MAX_PAY})`)}</legend>
            <OptChecks v={props.v} name="pay" options={PAY_METHODS} values={bio.pay} />
          </fieldset>
          <fieldset class="choices">
            <legend>{t("เวลาเช็กบิล", "When the bill comes")}</legend>
            <OptRadios v={props.v} name="bill" options={BILL_STYLE} value={bio.bill} />
          </fieldset>
          <fieldset class="choices">
            <legend>{t(`เดินทางยังไง (ไม่เกิน ${MAX_TRAVEL} แบบ)`, `How I get around (up to ${MAX_TRAVEL})`)}</legend>
            <OptChecks v={props.v} name="travel" options={GETTING_AROUND} values={bio.travel} />
          </fieldset>
          <fieldset class="choices">
            <legend>{t("เรื่องอาหารที่ควรรู้", "Food needs")}</legend>
            <OptChecks v={props.v} name="diet" options={DIET} values={bio.diet} />
          </fieldset>
          <fieldset class="choices">
            <legend>{t("กินเผ็ดได้แค่ไหน", "Spice level")}</legend>
            <OptRadios v={props.v} name="spice" options={SPICE} value={bio.spice} />
          </fieldset>
          <fieldset class="choices">
            <legend>{t("สัตว์เลี้ยง", "Pets")}</legend>
            <OptRadios v={props.v} name="pets" options={PETS} value={bio.pets} />
          </fieldset>
          <fieldset class="choices">
            <legend>{t("เรื่องเวลานัด", "Punctuality")}</legend>
            <OptRadios v={props.v} name="punctual" options={PUNCTUAL} value={bio.punctual} />
          </fieldset>
        </Section>

        <Section
          id="prompts"
          emoji="🃏"
          title={t("คำถามของฉัน", "My prompts")}
          hint={t(
            "ชุดคำถามนี้สุ่มมาให้คุณโดยเฉพาะ ตอบข้อไหนก็ได้ ถ้าไม่ชอบข้อไหน กด ↻ เพื่อเปลี่ยน",
            "This set was picked just for you. Answer any you like, and tap ↻ to swap one you don't.",
          )}
        >
          {props.deck.map((id) => {
            const p = promptById(id);
            return p ? <PromptInput v={props.v} p={p} answer={bio.answers?.[id]} photoSrc={props.promptPhoto(id)} /> : null;
          })}
        </Section>

        {props.datingDeck.length ? (
          <Section
            id="dating-prompts"
            emoji="💘"
            title={t("คำถามเรื่องเดต", "Dating prompts")}
            hint={t(
              "เห็นได้เฉพาะสมาชิกที่เปิดใจมากกว่าเพื่อนเหมือนกันและเข้ากับคุณ คนในโหมดเพื่อนจะไม่เห็นเลย และคำตอบจะถูกลบเมื่อคุณกลับไปโหมดเพื่อน กด ↻ เพื่อเปลี่ยนข้อที่ไม่ชอบ",
              "Only members who are also open to something more, and a fit for you, can see these. Friends-only members never do, and they're deleted if you switch it off. Tap ↻ to swap one.",
            )}
          >
            {props.datingDeck.map((id) => {
              const p = promptById(id);
              return p ? <PromptInput v={props.v} p={p} answer={bio.answers?.[id]} photoSrc={null} /> : null;
            })}
          </Section>
        ) : null}

        <LinksSection v={props.v} links={vals.links ?? {}} on={!!vals.linksOn} errorField={props.errorField} error={props.error} />

        <div class="pf-save">
          <Button>{t("บันทึกโปรไฟล์", "Save profile")}</Button>
        </div>
      </form>
      <ProfileFormScript />
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
    bio: cleanBio(p.bio),
  };
}

async function renderProfileForm(c: C, vals: ProfileVals, opts: { error?: string; errorField?: string; status?: 400 } = {}) {
  const user = me(c);
  const p = user.profile!;
  if (!vals.links) {
    const db = getDb(c.env);
    const [rows, on] = await Promise.all([ownLinks(db, user.account.id), linksSwitch(db, [user.account.id])]);
    vals = { ...vals, links: Object.fromEntries(rows.map((r) => [r.network, linkInputValue(r.network, r.value)])), linksOn: !!on.get(user.account.id) };
  }
  const stored = cleanBio(p.bio);
  const deck = currentDeck(user.account.id, stored);
  const datingDeck = romanceEligible(p) ? currentDatingDeck(user.account.id, stored) : [];
  const photo = await photoSrc(c, p.photoKey);
  // Prompt photos come from the stored bio (the form never holds unsaved files).
  const promptPhoto = (id: string) => (stored.answers?.[id]?.photoKey ? `/people/${user.account.id}/photo/${id}` : null);
  return page(
    c,
    { title: view(c).t("แก้ไขโปรไฟล์", "Edit profile"), tab: "me", status: opts.status },
    <ProfileForm v={view(c)} vals={vals} deck={deck} datingDeck={datingDeck} photo={photo} hasPhoto={!!p.photoKey} promptPhoto={promptPhoto} error={opts.error} errorField={opts.errorField} />,
  );
}

settingsRoutes.get("/settings/profile", (c) => renderProfileForm(c, profileVals(me(c).profile!)));

type Body = Record<string, string | File | (string | File)[]>;
type Parsed =
  | { ok: false; vals: ProfileVals; error: string; errorField?: string }
  | {
      ok: true;
      vals: ProfileVals;
      deck: string[];
      mainFile: File | null;
      removePhoto: boolean;
      pending: { id: string; file: File }[];
      dropKeys: string[];
      /** Normalised social links (null clears one) and the switch, when the form sent its links section. */
      links?: { values: Record<string, string | null>; on: boolean };
    };

const fileOf = (raw: unknown): File | null => {
  const f = Array.isArray(raw) ? raw[0] : raw;
  return f instanceof File && f.size > 0 ? f : null;
};

const oneOf = (v: string, list: { value: string }[]) => (list.some((x) => x.value === v) ? v : undefined);

/** Read and validate the whole profile form. Touches nothing. */
function parseProfileForm(c: C, body: Body): Parsed {
  const { t } = view(c);
  const user = me(c);
  const p = user.profile!;
  const stored = cleanBio(p.bio);
  const deck = currentDeck(user.account.id, stored);
  // Dating prompts exist only while romance mode is on.
  const datingDeck = romanceEligible(p) ? currentDatingDeck(user.account.id, stored) : [];
  const allPrompts = [...deck, ...datingDeck];
  const pickAll = (key: string, allowed: string[]) => [...new Set(list(body[key]).filter((x) => allowed.includes(x)))];
  const comm = pickAll("comm", COMM_STYLES.map((x) => x.value));
  const energy = str(body.energy);
  const weekend = str(body.weekendRhythm);
  const bio: Bio = {
    ...stored,
    deck,
    datingDeck: datingDeck.length ? datingDeck : undefined,
    comm,
    ...parseOccupation(str(body.occupation), str(body.occupationOther)),
    ...parseEducation({ level: str(body.education), detail: str(body.educationDetail), university: str(body.university), universityName: str(body.universityName), gradYear: str(body.gradYear) }),
    ...parseBangkok(str(body.story), str(body.bkkTime), str(body.hometown), str(body.guide)),
    // Sign-up's answer stays unless they pick another one.
    residency: isResidency(str(body.residency)) ? str(body.residency) : stored.residency,
    learning: str(body.learning),
    learningLangs: pickAll("learningLangs", values(LANGUAGES)),
    energy: ENERGY.some((x) => x.value === energy) ? energy : undefined,
    weekend: WEEKEND_RHYTHM.some((x) => x.value === weekend) ? weekend : undefined,
    pay: pickAll("pay", PAY_METHODS.map((x) => x.value)).slice(0, MAX_PAY),
    bill: oneOf(str(body.bill), BILL_STYLE),
    travel: pickAll("travel", GETTING_AROUND.map((x) => x.value)).slice(0, MAX_TRAVEL),
    diet: pickAll("diet", DIET.map((x) => x.value)),
    spice: oneOf(str(body.spice), SPICE),
    pets: oneOf(str(body.pets), PETS),
    punctual: oneOf(str(body.punctual), PUNCTUAL),
    budget: oneOf(str(body.budget), BUDGETS),
    activities: pickAll("activities", ACTIVITIES.map((x) => x.value)),
    meals: pickAll("meals", MEALS.map((x) => x.value)),
    groupSize: oneOf(str(body.groupSize), GROUP_SIZES),
    times: pickAll("times", TIME_WINDOWS.map((x) => x.value)),
    access: pickAll("access", ACCESS_NEEDS.map((x) => x.value)),
    // "My Bangkok" reflections: the edit form sends them all, so they replace the stored ones (all blank clears them).
    reflections: str(body.r_present) === "1" ? reflectionsFromForm(body) : stored.reflections,
  };
  if (!bio.reflections) delete bio.reflections;
  const vals: ProfileVals = {
    nickname: str(body.nickname),
    district: str(body.district),
    languages: pickAll("languages", values(LANGUAGES)),
    interests: pickAll("interests", INTEREST_VALUES),
    // Small / big group follow the group size answer (seating reads them).
    socialStyles: withGroupStyle(pickAll("socialStyles", values(SOCIAL_STYLES)), bio.groupSize),
    // No longer asked (it duplicated "When I'm usually free"); kept as it was.
    eventStyle: p.eventStyle,
    intents: pickAll("intents", values(INTENTS)),
    newcomer: str(body.newcomer) === "1",
    locale: str(body.locale) === "en" ? "en" : "th",
    bio,
  };
  // Social links: only when the form sent its section, so other posts never clear them.
  const linksSent = str(body.links_present) === "1";
  if (linksSent) {
    vals.links = Object.fromEntries(NETWORKS.map((n) => [n.key, str(body[`link_${n.key}`]).slice(0, 400)]));
    vals.linksOn = str(body.linksOn) === "1";
  }
  const fail = (th: string, en: string): Parsed => ({ ok: false, vals, error: t(th, en) });

  if (!vals.nickname) return fail("ใส่ชื่อเล่นก่อน", "Please add a nickname.");
  if (vals.nickname.length > 30) return fail("ชื่อเล่นยาวได้ไม่เกิน 30 ตัวอักษร", "Nickname can be at most 30 characters.");
  if (!values(DISTRICTS).includes(vals.district)) return fail("เลือกเขต", "Please choose a district.");
  if (vals.languages.length === 0 || vals.interests.length === 0) return fail("เลือกภาษาและความสนใจอย่างน้อยอย่างละ 1", "Pick at least one language and one interest.");
  if (vals.interests.length > MAX_INTERESTS) return fail(`เลือกความสนใจได้ไม่เกิน ${MAX_INTERESTS} อย่าง`, `Pick at most ${MAX_INTERESTS} interests.`);
  if (comm.length > MAX_COMM) return fail(`เลือกสไตล์การติดต่อได้ไม่เกิน ${MAX_COMM} แบบ`, `Pick at most ${MAX_COMM} communication styles.`);
  if ((bio.learning ?? "").length > LEARNING_MAX) return fail(`"กำลังเรียนรู้" ยาวได้ไม่เกิน ${LEARNING_MAX} ตัวอักษร`, `"Currently learning" can be at most ${LEARNING_MAX} characters.`);
  if (!bio.learning) delete bio.learning;

  const mainFile = fileOf(body.photo);
  if (mainFile) {
    if (!PHOTO_TYPES.includes(mainFile.type)) return fail("รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP", "Photos must be JPG, PNG or WebP.");
    if (mainFile.size > PHOTO_MAX_BYTES) return fail("รูปต้องมีขนาดไม่เกิน 5 MB", "Photos must be 5 MB or smaller.");
  }

  // Prompt answers: only for prompts in my deck. Answers to prompts no longer
  // in the deck are dropped (with their photos).
  const answers: Record<string, Answer> = {};
  const dropKeys: string[] = [];
  for (const [id, a] of Object.entries(stored.answers ?? {})) {
    if (allPrompts.includes(id)) answers[id] = a;
    else if (a.photoKey) dropKeys.push(a.photoKey);
  }
  const pending: { id: string; file: File }[] = [];
  for (const id of allPrompts) {
    const q = promptById(id)!;
    const old = answers[id];
    const inForm = str(body[`m_${id}`]) === "1";
    if (str(body[`clear_${id}`]) === "1") {
      if (old?.photoKey) dropKeys.push(old.photoKey);
      delete answers[id];
      continue;
    }
    const title = t(q.th, q.en);
    if (q.kind === "photo") {
      const caption = validateAnswer(q, str(body[`a_${id}`]));
      if (!caption.ok) return fail(`${title}: ${caption.error.th}`, `${title}: ${caption.error.en}`);
      const file = fileOf(body[`f_${id}`]);
      if (file) {
        if (!PHOTO_TYPES.includes(file.type)) return fail(`${title}: รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP`, `${title}: photos must be JPG, PNG or WebP.`);
        if (file.size > PHOTO_MAX_BYTES) return fail(`${title}: รูปต้องมีขนาดไม่เกิน 5 MB`, `${title}: photos must be 5 MB or smaller.`);
        pending.push({ id, file });
        if (old?.photoKey) dropKeys.push(old.photoKey);
        answers[id] = { kind: "photo", value: (caption.value as string | null) ?? "" };
      } else if (old?.photoKey) {
        answers[id] = { ...old, value: inForm ? ((caption.value as string | null) ?? "") : old.value };
      }
      continue;
    }
    let raw: string | string[] | undefined;
    if (q.kind === "rank") {
      const positions: Record<string, string> = {};
      for (const o of q.options ?? []) positions[o.value] = str(body[`r_${id}_${o.value}`]);
      const order = rankFromPositions(q, positions);
      if (order === "partial") return fail(`${title}: เรียงอันดับให้ครบทุกข้อ และไม่ซ้ำกัน`, `${title}: give every item a different place.`);
      raw = order;
    } else {
      raw = list(body[`a_${id}`]);
    }
    const r = validateAnswer(q, raw);
    if (!r.ok) return fail(`${title}: ${r.error.th}`, `${title}: ${r.error.en}`);
    if (r.value === null) {
      // Not answered. Only an explicit empty field (or a rendered prompt) clears it.
      if (inForm || (q.kind === "text" && `a_${id}` in body)) delete answers[id];
    } else {
      answers[id] = { kind: q.kind, value: r.value };
    }
  }
  bio.answers = answers;

  let links: { values: Record<string, string | null>; on: boolean } | undefined;
  if (linksSent) {
    const out: Record<string, string | null> = {};
    for (const n of NETWORKS) {
      const r = normaliseLink(n.key, vals.links![n.key] ?? "");
      if (!r.ok) {
        const name = t(n.th, n.en);
        return { ok: false, vals, error: t(`${name}: ${r.error.th}`, `${name}: ${r.error.en}`), errorField: n.key };
      }
      out[n.key] = r.value;
    }
    links = { values: out, on: !!vals.linksOn };
  }
  return { ok: true, vals, deck, mainFile, removePhoto: str(body.removePhoto) === "1", pending, dropKeys, links };
}

/** Upload files, then write the profile. Returns an error message or null. */
async function saveProfile(c: C, parsed: Extract<Parsed, { ok: true }>): Promise<string | null> {
  const { t } = view(c);
  const user = me(c);
  const p = user.profile!;
  const { vals } = parsed;
  // Server-generated keys only; bytes go straight to the file store.
  const uploaded: string[] = [];
  const put = async (key: string, file: File) => {
    await putObject(c.env, key, await file.arrayBuffer(), { contentType: file.type });
    uploaded.push(key);
  };
  let photoKey = p.photoKey;
  try {
    if (parsed.mainFile) {
      photoKey = `uploads/${user.account.id}/${crypto.randomUUID()}`;
      await put(photoKey, parsed.mainFile);
    } else if (parsed.removePhoto) {
      photoKey = null;
    }
    for (const { id, file } of parsed.pending) {
      const key = `uploads/${user.account.id}/prompts/${crypto.randomUUID()}`;
      await put(key, file);
      vals.bio.answers![id] = { ...vals.bio.answers![id], photoKey: key };
    }
  } catch {
    for (const k of uploaded) await deleteObject(c.env, k).catch(() => {});
    return t("อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง", "The photo couldn't be uploaded. Please try again.");
  }

  // This form only edits the non-romance intents; romance follows romance mode.
  const intents = [...(vals.intents.length ? vals.intents : ["friends"]), ...(p.romanceOn ? ["romance"] : [])];
  await getDb(c.env)
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
      bio: vals.bio,
      photoKey,
      updatedAt: new Date(),
    })
    .where(eq(profiles.accountId, user.account.id));
  const drop = [...parsed.dropKeys, ...(p.photoKey && p.photoKey !== photoKey ? [p.photoKey] : [])];
  for (const k of drop) await deleteObject(c.env, k).catch(() => {});
  if (vals.locale !== p.locale) setCookie(c, "lang", vals.locale, { path: "/", maxAge: 365 * 86_400, sameSite: "Lax" });
  // City Pulse follows the change reflection: replaced when edited, withdrawn when cleared (consent rules in syncQuizChange).
  const before = cleanBio(p.bio).reflections?.change;
  const after = vals.bio.reflections?.change;
  if (parsed.links) await saveLinks(c, parsed.links);
  // Keep the in-request copy current for anything rendered after this.
  const { links: _links, linksOn: _linksOn, ...profileOnly } = vals;
  Object.assign(p, { ...profileOnly, intents, photoKey, bio: vals.bio });
  if (before !== after) await syncQuizChange(c, after);
  return null;
}

/**
 * Social links: one row per filled network (an empty field deletes its row), and the switch as an
 * append-only consent row, written only when it changes (latest wins, like the Privacy Center).
 */
async function saveLinks(c: C, links: { values: Record<string, string | null>; on: boolean }) {
  const db = getDb(c.env);
  const id = me(c).account.id;
  const now = new Date();
  const current = await linksSwitch(db, [id]);
  const keep = Object.entries(links.values).filter((e): e is [string, string] => e[1] !== null);
  const drop = Object.entries(links.values).filter(([, v]) => v === null).map(([k]) => k);
  const queries: { toSQL(): { sql: string; params: unknown[] } }[] = [];
  if (drop.length) queries.push(db.delete(profileLinks).where(and(eq(profileLinks.accountId, id), inArray(profileLinks.network, drop))));
  if (keep.length) {
    queries.push(
      db
        .insert(profileLinks)
        .values(keep.map(([network, value]) => ({ id: newId(), accountId: id, network, value, updatedAt: now })))
        .onConflictDoUpdate({ target: [profileLinks.accountId, profileLinks.network], set: { value: sql`excluded.value`, updatedAt: now } }),
    );
  }
  if (links.on !== !!current.get(id)) {
    queries.push(db.insert(consents).values({ id: newId(), accountId: id, category: PROFILE_LINKS_CONSENT, granted: links.on, version: CONSENT_VERSION }));
    queries.push(audit(db, id, "consent.updated", { type: "account", id }, { changed: { [PROFILE_LINKS_CONSENT]: links.on } }));
  }
  if (queries.length) await batch(c.env, queries);
}

settingsRoutes.post("/settings/profile", async (c) => {
  const body = (await c.req.parseBody({ all: true })) as Body;
  const parsed = parseProfileForm(c, body);
  if (!parsed.ok) return renderProfileForm(c, parsed.vals, { error: parsed.error, errorField: parsed.errorField, status: 400 });
  const err = await saveProfile(c, parsed);
  if (err) return renderProfileForm(c, parsed.vals, { error: err, status: 400 });
  return c.redirect("/settings?notice=saved");
});

/**
 * Swap one prompt in my deck for an unused one. When posted from the full
 * edit form (the ↻ button), the rest of the form is saved first so nothing
 * typed is lost.
 */
settingsRoutes.post("/settings/prompts/shuffle", async (c) => {
  const body = (await c.req.parseBody({ all: true })) as Body;
  const user = me(c);
  if ("nickname" in body) {
    const parsed = parseProfileForm(c, body);
    if (!parsed.ok) return renderProfileForm(c, parsed.vals, { error: parsed.error, errorField: parsed.errorField, status: 400 });
    const err = await saveProfile(c, parsed);
    if (err) return renderProfileForm(c, parsed.vals, { error: err, status: 400 });
  }
  const p = user.profile!;
  const bio = cleanBio(p.bio);
  const id = str(body.promptId);
  const dating = isDatingPrompt(id);
  if (dating && !romanceEligible(p)) return c.text("Unknown prompt", 400);
  const deck = dating ? currentDatingDeck(user.account.id, bio) : currentDeck(user.account.id, bio);
  if (!deck.includes(id)) return c.text("Unknown prompt", 400);
  const next = swapPrompt(deck, id, Math.random, bio.skipped ?? []);
  if (next === deck) return c.redirect(dating ? "/settings/profile#dating-prompts" : "/settings/profile#prompts");
  const answers = { ...(bio.answers ?? {}) };
  const dropKey = answers[id]?.photoKey;
  delete answers[id];
  const newBio: Bio = { ...bio, ...(dating ? { datingDeck: next } : { deck: next }), answers, skipped: [...(bio.skipped ?? []).filter((x) => x !== id), id].slice(-40) };
  await getDb(c.env).update(profiles).set({ bio: newBio, updatedAt: new Date() }).where(eq(profiles.accountId, user.account.id));
  if (dropKey) await deleteObject(c.env, dropKey).catch(() => {});
  const fresh = next[deck.indexOf(id)];
  return c.redirect(`/settings/profile?notice=saved#prompt-${fresh}`);
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
      <h1>{t("ตั้งค่าการรู้จักกันหลังกิจกรรม", "Connection preferences")}</h1>
      <p class="muted">
        {t(
          "ข้อมูลในหน้านี้เป็นความลับ ไม่แสดงให้สมาชิกคนอื่นหรือเจ้าหน้าที่เห็น ถ้าเปลี่ยนจาก 'โสด' จะกลับเป็นโหมดเพื่อนทันที เปลี่ยนเป็น 'โสด' ได้ไม่เกิน 1 ครั้งใน 30 วัน",
          "Everything here is private: it's never shown to other members or staff. Leaving Single switches romance mode off at once. You can switch to Single at most once every 30 days.",
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

settingsRoutes.get("/settings/connections", (c) => page(c, { title: view(c).t("ตั้งค่าการรู้จักกันหลังกิจกรรม", "Connections"), tab: "me" }, <ConnectionsPage v={view(c)} />));

settingsRoutes.post("/settings/connections", async (c) => {
  const v = view(c);
  const user = me(c);
  const p = user.profile!;
  const body = await c.req.parseBody({ all: true });
  const result = await connectionsPatch(body, p);
  if ("error" in result) {
    return page(c, { title: v.t("ตั้งค่าการรู้จักกันหลังกิจกรรม", "Connections"), tab: "me", status: 400 }, <ConnectionsPage v={v} error={result.error} />);
  }
  const db = getDb(c.env);
  const intents = p.intents.filter((i) => i !== "romance");
  const queries: { toSQL(): { sql: string; params: unknown[] } }[] = [
    db
      .update(profiles)
      .set({
        ...result.patch,
        intents: result.patch.romanceOn ? [...intents, "romance"] : intents,
        // Dating prompts come with romance mode and go with it.
        bio: withGenderSelf(result.patch.romanceOn ? { ...cleanBio(p.bio), datingDeck: currentDatingDeck(user.account.id, cleanBio(p.bio)) } : withoutDating(cleanBio(p.bio)), result.genderSelf, result.datingGenderSelf),
      })
      .where(eq(profiles.accountId, user.account.id)),
  ];
  if (result.romanceConsent !== null) queries.push(consentRow(db, user.account.id, ROMANCE_CONSENT, result.romanceConsent));
  if (result.patch.romanceOn) {
    // Onboarding dating answers still waiting for this yes are saved with it (R1).
    const pending = pendingDatingIntent(c, db, user.account.id);
    if (pending) queries.push(pending);
  } else {
    // Romance off: dating intents go at once (R2).
    dropPendingDating(c);
    queries.push(deleteDatingIntents(db, user.account.id));
  }
  if (p.romanceOn && !result.patch.romanceOn) queries.push(withdrawRomanceChoices(db, user.account.id), ...endPinkies(db, user.account.id));
  // R3: relationship status and the private gender carry their own consent rows.
  queries.push(...(await privateFieldConsents(db, user.account.id, { relationship: result.patch.relationship, gender: result.patch.gender })));
  if (result.patch.relationship !== p.relationship) {
    queries.push(audit(db, user.account.id, "profile.private_updated", { type: "account", id: user.account.id }));
  }
  await batch(c.env, queries);
  return c.redirect("/settings/connections?notice=saved");
});

/**
 * One tap for "Open to something more" (Me → Quick switches). The same rules
 * as Connection preferences: Single only (prefer-not becomes Single, within
 * the 30-day limit), the tap itself is the PDPA consent the switch's hint
 * states, and switching off deletes every dating detail and withdraws
 * pending romantic choices.
 */
async function romanceQuick(c: C, on: boolean) {
  const { t } = view(c);
  const user = me(c);
  const p = user.profile!;
  const db = getDb(c.env);
  const id = user.account.id;
  const queries: { toSQL(): { sql: string; params: unknown[] } }[] = [];
  if (!on) {
    if (!p.romanceOn) return c.redirect("/settings");
    queries.push(db.update(profiles).set({ ...romanceOffPatch(p), updatedAt: new Date() }).where(eq(profiles.accountId, id)));
    queries.push(withdrawRomanceChoices(db, id), ...endPinkies(db, id));
    queries.push(consentRow(db, id, ROMANCE_CONSENT, false), ...consentEffects(db, id, ROMANCE_CONSENT, false, null));
    dropPendingDating(c);
    await batch(c.env, queries);
    return c.redirect("/settings?notice=romance_off");
  }
  if (p.relationship === "relationship" || p.relationship === "married") return c.redirect("/settings/connections?notice=romance_single");
  const toSingle = p.relationship !== "single";
  if (toSingle && !canSwitchToSingle(p.lastSingleSwitchAt)) {
    return c.redirect(`/settings?error=${encodeURIComponent(t("เปลี่ยนเป็น 'โสด' ได้ไม่เกิน 1 ครั้งใน 30 วัน", "You can switch to Single at most once every 30 days."))}`);
  }
  const bio = cleanBio(p.bio);
  const intents = p.intents.filter((i) => i !== "romance");
  queries.push(
    db
      .update(profiles)
      .set({
        relationship: "single",
        ...(toSingle ? { lastSingleSwitchAt: new Date() } : {}),
        romanceOn: true,
        romanceOpenTo: p.romanceOpenTo ?? "everyone",
        intents: [...intents, "romance"],
        bio: { ...bio, datingDeck: currentDatingDeck(id, bio) },
        updatedAt: new Date(),
      })
      .where(eq(profiles.accountId, id)),
  );
  queries.push(consentRow(db, id, ROMANCE_CONSENT, true));
  const pending = pendingDatingIntent(c, db, id);
  if (pending) queries.push(pending);
  // Becoming Single here gives a relationship status: R3 records that consent too.
  if (toSingle) queries.push(audit(db, id, "profile.private_updated", { type: "account", id }), ...(await privateFieldConsents(db, id, { relationship: "single" })));
  await batch(c.env, queries);
  return c.redirect("/settings?notice=romance_on");
}

/** Every romance-only field cleared, dating prompts and answers included. */
function romanceOffPatch(p: Profile): Partial<typeof profiles.$inferInsert> {
  const intents = p.intents.filter((i) => i !== "romance");
  return {
    romanceOn: false,
    genderIdentity: null,
    romanceOpenTo: null,
    orientation: null,
    orientationOpenTo: null,
    showDatingPrefs: false,
    intents: intents.length ? intents : ["friends"],
    bio: withoutDating(cleanBio(p.bio)),
  };
}

/**
 * PRD §4.4: pending romantic choices are withdrawn (they count as "friend",
 * exactly what resolveMutual does for an ineligible person). Choices whose
 * People I Met window (72h) is still open are the only pending ones.
 */
function withdrawRomanceChoices(db: ReturnType<typeof getDb>, accountId: string) {
  const openSince = new Date(Date.now() - 72 * 3_600_000);
  return db
    .update(connectionChoices)
    .set({ choice: "friend" })
    .where(
      and(
        eq(connectionChoices.fromAccount, accountId),
        eq(connectionChoices.choice, "romance"),
        inArray(connectionChoices.eventId, db.select({ id: events.id }).from(events).where(gt(events.endsAt, openSince))),
      ),
    );
}

// -------------------------------------------------------------- privacy --

const CATEGORIES: { key: string; required: boolean; th: string; en: string; hintTh: string; hintEn: string }[] = [
  { key: "service", required: true, th: "บัญชีและบริการกิจกรรม", en: "Account and event service", hintTh: "จำเป็นเพื่อให้แอปทำงาน ถอนได้โดยการปิดบัญชีเท่านั้น", hintEn: "Needed for the app to work. Withdrawn only by deactivating your account." },
  { key: "safety", required: true, th: "ความปลอดภัยและการดูแลชุมชน", en: "Safety and moderation", hintTh: "ใช้ตรวจสอบรายงานและป้องกันการคุกคาม ถอนได้โดยการปิดบัญชีเท่านั้น", hintEn: "Used to review reports and prevent harassment. Withdrawn only by deactivating your account." },
  { key: "personalization", required: false, th: "จัดกลุ่มและแนะนำกิจกรรมตามความสนใจ", en: "Personalised groups and suggestions", hintTh: "ใช้ความสนใจและภาษาของคุณในการจัดโต๊ะ", hintEn: "Uses your interests and languages to seat you well." },
  { key: "research", required: false, th: "City Pulse: ช่วยวิจัยเมือง (ไม่ระบุตัวตน)", en: "City Pulse: anonymous city research", hintTh: "คำตอบเก็บแยกไว้ภายใต้รหัสวิจัย แสดงผลเฉพาะภาพรวมจากอย่างน้อย 10 คน และภาพรวมนี้ส่งให้ กทม.", hintEn: "Answers are stored under a research code and only ever shown as totals from 10+ people. Those totals go to the BMA." },
  { key: "notifications", required: false, th: "การแจ้งเตือนกิจกรรม", en: "Event notifications", hintTh: "เตือนก่อนงานและแจ้งเมื่อมีที่ว่าง", hintEn: "Reminders and waitlist updates." },
  { key: "romance_data", required: false, th: "ข้อมูลเปิดใจมากกว่าเพื่อน (ข้อมูลอ่อนไหว)", en: "Romance-mode data (sensitive)", hintTh: "อัตลักษณ์ทางเพศและคนที่อยากเจอ ถ้าถอนความยินยอม เราจะกลับคุณเป็นโหมดเพื่อนและลบข้อมูลนี้ทันที", hintEn: "Gender identity and 'open to meeting'. Withdrawing switches romance mode off and deletes them at once." },
];
const OPTIONAL = ["personalization", "research", "notifications"];

function PrivacyCenter(props: { v: View; current: Map<string, boolean> }) {
  const { t, lang } = props.v;
  const cur = props.current;
  const stores: [string, string, string, string][] = [
    ["🪪 ข้อมูลตัวตน", "🪪 Identity store", "ชื่อผู้ใช้ รหัสผ่าน (เข้ารหัสแล้ว) สถานะบัญชีและการยืนยันตัวตน", "Username, password (hashed), account and verification status."],
    ["👥 ข้อมูลการใช้งาน", "👥 Social store", "ชื่อเล่น รูป ความสนใจ กิจกรรมที่ลงทะเบียน คนรู้จัก และการตั้งค่าส่วนตัว", "Nickname, photo, interests, events, connections and your private preferences."],
    ["📊 ข้อมูลวิจัยเมือง", "📊 City research store", "คำตอบ City Pulse เก็บด้วยรหัสวิจัยแทนตัวตน เมื่อปิดบัญชี เราจะตัดการเชื่อมโยงกับตัวคุณ ข้อมูลจึงระบุตัวคุณไม่ได้อีก", "City Pulse answers, stored under a research code instead of your identity. When you deactivate, the link is cut and the rows become anonymous."],
  ];
  const retention: [string, string, string, string][] = [
    ["ข้อมูลเปิดใจมากกว่าเพื่อน", "Romance-mode details", "ลบทันทีเมื่อกลับเป็นโหมดเพื่อน", "Deleted as soon as you switch it off"],
    ["ตัวเลือกหลังกิจกรรมที่ไม่ตรงกัน", "Non-mutual post-event choices", "ลบเมื่อครบ 72 ชม.", "Deleted when the 72-hour window closes"],
    ["คนรู้จักและช่องทางติดต่อที่แชร์", "Connections and shared contacts", "จนกว่าฝ่ายใดฝ่ายหนึ่งจะลบหรือปิดบัญชี", "Until either person removes it or deletes their account"],
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
      <p class="muted">{t("คุณเลือกเองว่าจะให้ใช้ข้อมูลอะไร ทุกครั้งที่เปลี่ยน เราจะบันทึกไว้พร้อมวันที่", "You decide how your data is used. Every change is kept as a dated record.")}</p>
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
                      {t("เปิดได้ที่หน้า", "Switch on from")} <a href="/settings/connections">{t("ตั้งค่าการรู้จักกันหลังกิจกรรม", "Connection preferences")}</a>
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
        <p class="muted">{t("ระยะเวลาเหล่านี้เป็นค่าเริ่มต้นในช่วงทดลอง และอาจปรับก่อนเปิดตัวจริง", "These are pilot defaults and may change before launch.")}</p>
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
            "เราจะซ่อนโปรไฟล์ของคุณทันที ออกจากระบบทุกเครื่อง ลบรูป และตัดการเชื่อมโยงกับข้อมูลวิจัย จากนั้นลบบัญชีถาวรหลัง 30 วัน",
            "Your profile is hidden at once, you're signed out everywhere, your photo is deleted and the link to your research answers is cut. The account is permanently deleted after 30 days.",
          )}
        </p>
        <p class="row">
          <a class="btn ghost" href="/settings/habits">⏸️ {t("พักก่อนแทน (คนรู้จักและแชตยังอยู่)", "Take a break instead (your people and chats stay)")}</a>
        </p>
        <form method="post" action="/settings/deactivate">
          <fieldset class="choices">
            <legend>{t("ทำไมถึงออก? (ไม่บังคับ ไม่ระบุตัวตน)", "Why are you leaving? (optional, anonymous)")}</legend>
            <div class="pills">
              {EXIT_REASONS.map((o) => (
                <label class="pill">
                  <input type="checkbox" name="reasons" value={o.value} />
                  <span>
                    {o.emoji} {lang === "en" ? o.label.en : o.label.th}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <TextArea label={t("อยากบอกอะไรเราเพิ่มไหม (ไม่บังคับ)", "Anything you'd like us to know? (optional)")} name="exitNote" rows={2} maxlength={500} />
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
    queries.push(db.update(profiles).set({ ...romanceOffPatch(p), updatedAt: new Date() }).where(eq(profiles.accountId, user.account.id)));
    if (p.romanceOn) queries.push(withdrawRomanceChoices(db, user.account.id), ...endPinkies(db, user.account.id));
  }
  for (const [category, granted] of Object.entries(changed)) {
    // Each change carries its effects: romance_data no deletes dating intents, research no
    // deletes City Pulse and wellbeing answers and cuts the research id, research yes issues one.
    queries.push(consentRow(db, user.account.id, category, granted), ...consentEffects(db, user.account.id, category, granted, user.account.researchId));
  }
  if (changed.romance_data === false) dropPendingDating(c);
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
  const [account, profile, consentRows, regs, choices, conns, shares, reps, notes, pulse, wb, pushDevices] = await Promise.all([
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
    db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.accountId, id)).limit(20),
  ]);
  const myLinks = await ownLinks(db, id);

  const [vibe, myStrikes, myBlocks, myFeedback, invitesMade, inviteUsed, linked, [emails]] = await Promise.all([
    db
      .select({ type: vibes.archetype, modifier: vibes.modifier, scores: vibes.vector, visibleToGroupmates: vibes.visible, takenAt: vibes.takenAt })
      .from(vibes)
      .where(eq(vibes.accountId, id))
      .limit(1),
    db
      .select({ event: events.title, reason: strikes.reason, expiresAt: strikes.expiresAt, waived: strikes.waivedBy, createdAt: strikes.createdAt })
      .from(strikes)
      .leftJoin(events, eq(events.id, strikes.eventId))
      .where(eq(strikes.accountId, id))
      .limit(500),
    db.select({ blocked: blocks.blocked, createdAt: blocks.createdAt }).from(blocks).where(eq(blocks.blocker, id)).limit(2000),
    db
      .select({
        event: events.title,
        metNewPerson: feedback.metNewPerson,
        wouldMeetAgain: feedback.wouldMeetAgain,
        feltSafe: feedback.feltSafe,
        groupRating: feedback.groupRating,
        comment: feedback.comment,
        createdAt: feedback.createdAt,
      })
      .from(feedback)
      .leftJoin(events, eq(events.id, feedback.eventId))
      .where(eq(feedback.accountId, id))
      .limit(1000),
    db
      .select({ event: events.title, used: invites.usedAt, createdAt: invites.createdAt })
      .from(invites)
      .leftJoin(events, eq(events.id, invites.eventId))
      .where(eq(invites.inviter, id))
      .limit(1000),
    db
      .select({ event: events.title, usedAt: invites.usedAt })
      .from(invites)
      .leftJoin(events, eq(events.id, invites.eventId))
      .where(eq(invites.usedBy, id))
      .limit(1000),
    db.select({ provider: oauthLinks.provider, linkedAt: oauthLinks.createdAt }).from(oauthLinks).where(eq(oauthLinks.accountId, id)).limit(10),
    // Only a hash of the address is stored, so the export can say how many, not which.
    db.select({ n: count() }).from(emailLinks).where(eq(emailLinks.accountId, id)),
  ]);

  // Other people in my connections and blocks: nickname only.
  const otherIds = [...new Set([...conns.map((x) => (x.a === id ? x.b : x.a)), ...myBlocks.map((b) => b.blocked)])];
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
    socialLinks: myLinks.map((l) => ({ network: l.network, value: l.value, shownAs: linkText(l.network, l.value), createdAt: l.createdAt, updatedAt: l.updatedAt })),
    contactSharesIMade: shares.map((s) => {
      const conn = conns.find((x) => x.id === s.connectionId);
      return { with: conn ? (nick.get(conn.a === id ? conn.b : conn.a) ?? null) : null, method: s.method, value: s.value, createdAt: s.createdAt };
    }),
    reportsIFiled: reps,
    peopleIBlocked: myBlocks.map((b) => ({ nickname: nick.get(b.blocked) ?? null, createdAt: b.createdAt })),
    feedbackIGave: myFeedback,
    strikes: myStrikes.map(({ waived, ...rest }) => ({ ...rest, waived: !!waived })),
    bangkokType: vibe[0] ?? null,
    invitesICreated: invitesMade.map((x) => ({ event: x.event, used: !!x.used, createdAt: x.createdAt })),
    invitesIAccepted: inviteUsed,
    signInWith: linked,
    signInEmails: Number(emails?.n ?? 0),
    notifications: notes,
    notificationDevices: pushDevices.length,
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
  const body = await c.req.parseBody({ all: true });
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
  // Why they left: anonymous (no account id), only if they said something.
  const reasons = [...new Set(list(body.reasons))].filter((r) => EXIT_REASONS.some((o) => o.value === r));
  const exitNote = str(body.exitNote).slice(0, 500);
  if (reasons.length || exitNote) await db.insert(exitReasons).values({ id: newId(), reasons, note: exitNote });
  const photoKey = user.profile?.photoKey ?? null;
  const promptPhotos = Object.values(cleanBio(user.profile?.bio).answers ?? {})
    .map((a) => a.photoKey)
    .filter((k): k is string => !!k);
  await batch(c.env, [
    db.update(accounts).set({ status: "deactivated", deactivatedAt: new Date(), researchId: null }).where(eq(accounts.id, id)),
    db.update(profiles).set({ photoKey: null, bio: {}, updatedAt: new Date() }).where(eq(profiles.accountId, id)),
    db.delete(sessions).where(eq(sessions.accountId, id)),
    db.delete(pushSubscriptions).where(eq(pushSubscriptions.accountId, id)),
    // Unlink Google / LINE now: signing in with them again starts a fresh account.
    db.delete(oauthLinks).where(eq(oauthLinks.accountId, id)),
    db.delete(emailLinks).where(eq(emailLinks.accountId, id)),
    // Social links go at once; the switch's history stays with the other consents until deletion.
    db.delete(profileLinks).where(eq(profileLinks.accountId, id)),
    audit(db, id, "account.deactivated", { type: "account", id }),
  ]);
  await releaseUpcomingSeats(c.env, id);
  for (const k of [...(photoKey ? [photoKey] : []), ...promptPhotos]) await deleteObject(c.env, k).catch(() => {});
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
        <Field label={t("รหัสผ่านปัจจุบัน", "Current password")} name="current" type="password" required autocomplete="current-password"  reveal={{ show: t("แสดง", "Show"), hide: t("ซ่อน", "Hide"), caps: t("Caps Lock เปิดอยู่", "Caps Lock is on") }} />
        <Field label={t("รหัสผ่านใหม่", "New password")} name="password" type="password" required autocomplete="new-password" hint={t("อย่างน้อย 8 ตัวอักษร", "At least 8 characters")}  reveal={{ show: t("แสดง", "Show"), hide: t("ซ่อน", "Hide"), caps: t("Caps Lock เปิดอยู่", "Caps Lock is on") }} />
        <Field label={t("ยืนยันรหัสผ่านใหม่", "Confirm new password")} name="confirm" type="password" required autocomplete="new-password"  reveal={{ show: t("แสดง", "Show"), hide: t("ซ่อน", "Hide"), caps: t("Caps Lock เปิดอยู่", "Caps Lock is on") }} />
        <Button>{t("เปลี่ยนรหัสผ่าน", "Change password")}</Button>
      </form>
    </>
  );
}

settingsRoutes.use("/settings/password", async (c, next) => {
  if (isPasswordless(me(c).account.username)) return c.redirect("/settings");
  await next();
});

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
  if (passwordProblem(password)) return fail(t("รหัสผ่านต้องยาว 8 ถึง 200 ตัวอักษร", "Password must be 8 to 200 characters."));
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


// ------------------------------------------------------------- dating --

settingsRoutes.get("/settings/dating", async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const [row] = await getDb(c.env).select().from(datingIntents).where(eq(datingIntents.accountId, me(c).account.id)).limit(1);
  if (!row || row.mode === "friends") return c.redirect("/settings");
  return page(
    c,
    { title: t("สิ่งที่มองหาในการเดต", "Dating preferences"), bare: true },
    <Flow v={v} action="/settings/dating" submit={t("บันทึก", "Save")} close="/settings">
      <DatingPrefSteps t={t} lang={lang} prefs={cleanPrefs(row.prefs)} />
    </Flow>,
  );
});

settingsRoutes.post("/settings/dating", async (c) => {
  const prefs = prefsFromBody(await c.req.parseBody({ all: true }));
  // R1: never saved without the romance_data consent.
  if (!(await hasConsent(getDb(c.env), me(c).account.id, ROMANCE_CONSENT))) return c.redirect("/settings");
  await getDb(c.env)
    .update(datingIntents)
    .set({ prefs, updatedAt: new Date() })
    .where(eq(datingIntents.accountId, me(c).account.id));
  return c.redirect("/settings?notice=saved");
});

// ------------------------------------------------------------ habits --

settingsRoutes.get("/settings/habits", async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const p = me(c).profile!;
  const rhythm = cleanBio(p.bio).rhythm ?? DEFAULT_RHYTHM;
  const paused = isPaused(p);
  return page(
    c,
    { title: t("นิสัยดี ๆ", "Healthy habits"), tab: "me" },
    <>
      <p class="spread">
        <a href="/settings">← {t("ฉัน", "Me")}</a>
      </p>
      <h1>🌿 {t("นิสัยดี ๆ และการพัก", "Healthy habits")}</h1>
      <p class="muted">{t("Jurrgun อยากให้คุณใช้แอปน้อยลง และเจอคนจริงมากขึ้น", "Jurrgun wants you on the app less, and with people more.")}</p>
      {c.req.query("notice") === "saved" ? <Notice kind="ok">{t("บันทึกแล้ว", "Saved")}</Notice> : null}
      <Card>
        <h2 style="margin-top:0" id="rhythm-h">🗓️ {t("นัดกี่ครั้งต่อสัปดาห์กำลังดี", "How many plans a week feel right?")}</h2>
        <p class="muted">{t("ถ้าเกินนี้ เราจะถามคุณก่อน 1 ครั้ง แต่ไม่ได้ห้าม", "Past this, we'll check with you once. Never a block.")}</p>
        <form method="post" action="/settings/habits">
          <div class="pills" role="radiogroup" aria-labelledby="rhythm-h">
            {RHYTHMS.map((n) => (
              <label class="pill">
                <input type="radio" name="rhythm" value={String(n)} checked={n === rhythm} />
                <span>{lang === "en" ? `${n} a week` : `สัปดาห์ละ ${n}`}</span>
              </label>
            ))}
          </div>
          <Button>{t("บันทึก", "Save")}</Button>
        </form>
      </Card>
      <Card>
        <h2 style="margin-top:0">⏸️ {t("พัก Jurrgun", "Take a break")}</h2>
        {paused ? (
          <>
            <p>{t(`พักอยู่ถึง ${fmtDate(p.pausedUntil!, lang)} ไม่มีการจับคู่บัดดี้ใหม่ระหว่างนี้ คนรู้จักและแชตยังอยู่`, `On a break until ${fmtDate(p.pausedUntil!, lang)}. No new buddy matches meanwhile; your people and chats stay.`)}</p>
            <form method="post" action="/settings/habits">
              <input type="hidden" name="pause" value="0" />
              <Button>{t("กลับมาแล้ว", "I'm back")}</Button>
            </form>
          </>
        ) : (
          <>
            <p class="muted">{t("หยุดจับคู่บัดดี้และการดูคนที่อาจเป็นบัดดี้ไว้ก่อน คนรู้จักและแชตยังอยู่ ลงทะเบียนกิจกรรมเมื่อไหร่ก็กลับมาใช้ได้ทันที", "Pauses buddy matching and possible buddies. Your people and chats stay. RSVP anytime to come back.")}</p>
            <form method="post" action="/settings/habits" class="row">
              {PAUSE_WEEKS.map((w) => (
                <button class="btn ghost" name="pause" value={String(w)}>
                  {lang === "en" ? `${w} week${w > 1 ? "s" : ""}` : `${w} สัปดาห์`}
                </button>
              ))}
            </form>
          </>
        )}
      </Card>
    </>,
  );
});

settingsRoutes.post("/settings/habits", async (c) => {
  const user = me(c);
  const body = await c.req.parseBody();
  const db = getDb(c.env);
  const rhythm = Number(str(body.rhythm));
  if ((RHYTHMS as readonly number[]).includes(rhythm)) {
    const bio = { ...cleanBio(user.profile!.bio), rhythm };
    await db.update(profiles).set({ bio, updatedAt: new Date() }).where(eq(profiles.accountId, user.account.id));
  }
  const pause = str(body.pause);
  if (pause === "0") await db.update(profiles).set({ pausedUntil: null }).where(eq(profiles.accountId, user.account.id));
  else if ((PAUSE_WEEKS as readonly number[]).includes(Number(pause))) {
    await db.update(profiles).set({ pausedUntil: new Date(Date.now() + Number(pause) * 7 * 86_400_000) }).where(eq(profiles.accountId, user.account.id));
  }
  return c.redirect("/settings/habits?notice=saved");
});
