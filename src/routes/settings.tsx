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
import { reflectionsFromForm } from "../content/reflections";
import { syncQuizChange } from "./pulse";
import { DatingPrefSteps, prefsFromBody } from "./onboarding";
import { Flow } from "../ui/flow";
import { cleanPrefs, EXIT_REASONS, ROMANCE_EXPLAINER } from "../content/dating";
import { canHost } from "../domain/hosting";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { and, asc, count, countDistinct, desc, eq, gt, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { batch, getDb } from "../db";
import { isPasswordless, passwordProblem } from "../domain/rules";
import { DISTRICTS, INTENTS, LANGUAGES, SOCIAL_STYLES, label, values } from "../lib/constants";
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
  withGroupStyle,
} from "../content/profile";
import { MeHub, type MeStep } from "../ui/me-hub";
import { SubLabel } from "../ui/section-head";
import { ProfileFormScript } from "../ui/profile-form";
import { hostSection, isSectionName, MoreRow, progressText, OPEN_SECTIONS, promptOf, sectionAnchor, SectionForm, SectionHead, SECTIONS, type ProfileVals, type SectionData, type SectionName } from "../ui/profile-sections";
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
  announcements,
  buddyMatches,
  buddyOptins,
  buddySwipes,
  chatMessages,
  meetFeedback,
  passportStamps,
  pitchJoins,
  planPitches,
  safeArrivals,
  thanks,
  weeklyPlans,
  chatVotes,
  circleHeadRequests,
  circleShares,
  regularTableMembers,
  regularTables,
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
import { Button, Card, Field, LinkButton, list, Notice, page, str, TextArea, Toggle, view, type View } from "../ui/kit";
import { myTables } from "../services/regular-tables";
import { linkInputValue, linkText, normaliseLink, NETWORKS, PROFILE_LINKS_CONSENT } from "../content/social-links";
import { linksSwitch, ownLinks } from "../services/profile-links";
import { previewCard } from "./profile";
import { CONSENT_VERSION, ConnectionsFields, connectionsPatch, dropPendingDating, pendingDatingIntent, withGenderSelf } from "./onboarding";
import { acceptedTerms, consentEffects, consentRow, deleteDatingIntents, GENDER_CONSENT, hasConsent, NOTIFICATIONS_CONSENT, privateFieldConsents, RELATIONSHIP_CONSENT, researchWithdrawn, ROMANCE_CONSENT, termsRow } from "../services/consent";
import { isArchetype, loadVibe } from "./quiz";
import { ARCHETYPES, displayName } from "../vibe/archetypes";
import { fmtDate, L, type T } from "../lib/i18n";
import { NOTICE_CHANGES, NOTICE_DATE } from "../content/privacy";
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
  const [termsOk, src, vibe, [been], [upcoming], [circle], tables, [nextUp]] = await Promise.all([
    acceptedTerms(db, user.account.id),
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
          onLabel={t("เปิดอยู่", "On")}
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
            // The owner's 💘 explainer is the consent screen itself (card C3).
            lead: t(ROMANCE_EXPLAINER.th, ROMANCE_EXPLAINER.en),
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
        // Members who joined before the Terms box, or before the Terms last changed: one small card,
        // never a lock. It goes once they agree (a "terms" row with the current version).
        !termsOk ? (
          <form method="post" action="/settings/terms" class="card me-ask me-terms">
            <p>
              <strong>📜 {t("ข้อกำหนดการใช้งานฉบับใหม่", "Updated Terms of service")}</strong>
              <small class="muted">
                {t(`เราอัปเดตข้อกำหนดการใช้งานและนโยบายความเป็นส่วนตัว ฉบับวันที่ ${L(lang, NOTICE_DATE)}`, `We've updated our Terms of service and privacy notice, version of ${L(lang, NOTICE_DATE)}.`)}{" "}
                <a href="/terms">{t("อ่านข้อกำหนด", "Read the Terms")}</a> · <a href="/privacy">{t("อ่านนโยบาย", "Read the notice")}</a>
              </small>
            </p>
            <small>{t("สิ่งที่เปลี่ยน", "What changed")}:</small>
            <ul class="muted" style="margin:4px 0 8px">
              {NOTICE_CHANGES.map((x) => (
                <li>
                  <small>{L(lang, x)}</small>
                </li>
              ))}
            </ul>
            <button class="btn primary">{t("ฉันยอมรับข้อกำหนดและรับทราบนโยบาย", "I agree to the Terms and have read the notice")}</button>
          </form>
        ) : // Six months in, still marked new: ask once instead of keeping the label (and the newcomer card on Discover) forever.
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
        { emoji: "🎉", n: Number(been?.n ?? 0), label: t("กิจกรรมที่ไป", "Events attended"), href: "/me/events#past", tint: "green" },
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
        { href: "/safety/how", emoji: "🤝", title: t("เราดูแลความปลอดภัยยังไง", "How we keep you safe"), hint: t("เลือกกันทั้งสองฝ่าย บล็อก รายงาน", "Mutual only, block, report"), tint: "mint", group: gOut },
        canHost(user.account, true)
          ? { href: "/host", emoji: "🎪", title: t("จัดกิจกรรม", "Host an event"), hint: t("ฟรี หรือจ่ายที่สถานที่", "Free or pay at the venue"), tint: "lime" as const, group: gOut }
          : { href: "/circles/lead", emoji: "👑", title: t("เป็นเจ้าภาพโต๊ะประจำ", "Host a Regular Table"), hint: t("จัดแฮงเอาต์ของคุณเอง", "Run your own hangouts"), tint: "lime" as const, group: gOut },
        { href: "/settings/calendar", emoji: "📅", title: t("ปฏิทินของฉัน", "My calendar"), hint: "Google, Apple, Outlook", tint: "sky", group: gOut },
        ...(dates
          ? [{ href: "/settings/dating", emoji: "💘", title: t("สิ่งที่มองหาในการเดต", "Dating preferences"), hint: t("เป้าหมาย จังหวะ เดตแรก (ส่วนตัว)", "Goal, pace, first dates (private)"), tint: "teal" as const, group: gYou }]
          : []),
        { href: "/me/month", emoji: "🌱", title: t("เดือนนี้ของฉัน", "My month in people"), hint: t("คนที่เจอ ที่ที่ไป ไม่นับเวลาบนจอ", "People met, places, never screen time"), tint: "green", group: gOut },
        { href: "/thanks", emoji: "💌", title: t("คำขอบคุณ", "Thank-yous"), hint: t("ข้อความส่วนตัวจากคนที่เจอ", "Private notes from people you met"), tint: "sun", group: gOut },
        { href: "/settings/habits", emoji: "🌿", title: t("นิสัยดี ๆ และการพัก", "Healthy habits"), hint: isPaused(p, now) ? t("กำลังพักอยู่", "On a break") : t("นัดต่อสัปดาห์ พัก Jurrgun", "Plans a week, take a break"), tint: "mint", group: gYou },
        { href: "/settings/profile", emoji: "✏️", title: t("แก้ไขโปรไฟล์", "Edit profile"), hint: t("รูป ความสนใจ อาชีพ คำถามของคุณ", "Photo, interests, work, your prompts"), tint: "green", group: gYou },
        { href: "/pulse", emoji: "💬", title: t("City Pulse: ช่วยพัฒนาเมือง", "City Pulse: help the city"), hint: t("คำถามสั้น ๆ ใช้รหัสแทนชื่อ", "Quick questions, under a code, not your name"), tint: "sky", group: gAcct },
        { href: "/settings/connections", emoji: "💞", title: t("ตั้งค่าการรู้จักกันหลังกิจกรรม", "Connection preferences"), hint: t("สถานะความสัมพันธ์ ช่วงอายุ (ส่วนตัว)", "Relationship status, age range (private)"), tint: "teal", group: gYou },
        { href: "/settings/consents", emoji: "✅", title: t("ความยินยอมของฉัน", "My consents"), hint: t("เปิดหรือปิดแต่ละเรื่อง พร้อมวันที่", "Each one on or off, with dates"), tint: "mint", group: gAcct },
        { href: "/settings/privacy", emoji: "🔒", title: t("ศูนย์ความเป็นส่วนตัว", "Privacy centre"), hint: t("ดาวน์โหลดข้อมูล ปิดบัญชี", "Download my data, deactivate"), tint: "mint", group: gAcct },
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
function QuickSwitch(props: { k: string; on: boolean; emoji: string; title: string; hint: string; love?: boolean; onLabel?: string; consent?: { t: T; lead: string; tick: string; go: string } }) {
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
          <b>
            {props.title}
            {props.love && props.on && props.onLabel ? <span class="qs-on">💘 {props.onLabel}</span> : null}
          </b>
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
//
// Edited one section at a time (owner, 2026-10-18): each section is its own form
// (src/ui/profile-sections.tsx) posting to POST /settings/profile/section/:name,
// which reads, validates and writes only that section's fields. The old
// all-in-one POST /settings/profile still works and runs every section.

/**
 * The long form: basics first (photo, basics, languages and interests open), then each optional
 * section as a row under "More (optional)" that opens in place. Every section has its own Save.
 */
function ProfileForm(props: {
  d: SectionData;
  back: "card" | "edit";
  error?: string;
  /** The section the refused save belongs to; "all" for the old all-in-one post. */
  errorSection?: SectionName | "all";
  filesLost?: boolean;
  saved?: SectionName | null;
  /** A row to show open (a link to it, or the section just saved). */
  open?: string | null;
}) {
  const { t } = props.d.v;
  const errorIn = (n: SectionName) => props.errorSection === "all" || props.errorSection === n;
  const form = (n: SectionName) => <SectionForm d={props.d} name={n} back={props.back} saved={props.saved === n} dirty={errorIn(n)} />;
  const more = SECTIONS.filter((n) => !OPEN_SECTIONS.includes(n) && (n !== "dating-prompts" || props.d.datingDeck.length));
  return (
    <>
      <p class="spread">
        <a href="/settings">← {t("ฉัน", "Me")}</a>
        <a href="/me/profile" class="pe-preview-link">
          👀 {t("ดูโปรไฟล์ของฉัน", "Preview my profile")}
        </a>
      </p>
      <h1>{t("แก้ไขโปรไฟล์", "Edit profile")}</h1>
      {/* With JS: swap the form for my card drawn from what's typed now, and back, losing nothing (PE_JS).
          Without it, "Preview my profile" above shows the saved card. */}
      <div class="pe-seg" role="group" aria-label={t("มุมมอง", "View")} data-preview-err={t("ดูตัวอย่างไม่ได้ตอนนี้ ลองใหม่อีกครั้ง", "The preview didn't load. Please try again.")}>
        <button type="button" aria-pressed="true" data-pe-view="edit">
          {t("แก้ไข", "Edit")}
        </button>
        <button type="button" aria-pressed="false" data-pe-view="preview">
          {t("คนอื่นเห็นแบบนี้", "How others see it")}
        </button>
      </div>
      <div class="pe-preview" id="pe-preview" role="region" hidden tabindex={-1} aria-label={t("คนอื่นเห็นแบบนี้", "How others see it")} />
      {props.error ? (
        <Notice kind="error">
          {props.error}
          {props.filesLost ? <span class="pf-files-lost">{t(" รูปที่เลือกไว้ยังไม่ได้บันทึก เลือกอีกครั้งได้เลย", " The photo you picked wasn't saved yet. Please choose it again.")}</span> : null}
        </Notice>
      ) : null}
      <div class="pe-forms" id="pe-forms">
        {OPEN_SECTIONS.map((n) => (
          <section class="pf-section" id={n}>
            <SectionHead t={t} name={n as (typeof SECTIONS)[number]} />
            {form(n)}
          </section>
        ))}
        <section class="pe-more" aria-labelledby="pe-more-h">
          <h2 id="pe-more-h">{t("เพิ่มเติม (ไม่บังคับ)", "More (optional)")}</h2>
          {more.map((n) => (
            <MoreRow d={props.d} name={n} open={props.open === n || props.saved === n || (errorIn(n) && props.errorSection !== "all")}>
              {form(n)}
            </MoreRow>
          ))}
        </section>
      </div>
      <ProfileFormScript />
    </>
  );
}

function profileVals(p: Profile): ProfileVals {
  return {
    nickname: p.nickname,
    district: p.district,
    pronouns: p.pronouns,
    showPronouns: p.showPronouns,
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

/** Everything a section renderer needs, for the stored profile or for what was typed. */
async function sectionData(c: C, vals: ProfileVals, opts: { error?: string; errorField?: string } = {}): Promise<SectionData> {
  const user = me(c);
  const p = user.profile!;
  if (!vals.links) {
    const db = getDb(c.env);
    const [rows, on] = await Promise.all([ownLinks(db, user.account.id), linksSwitch(db, [user.account.id])]);
    vals = { ...vals, links: Object.fromEntries(rows.map((r) => [r.network, linkInputValue(r.network, r.value)])), linksOn: !!on.get(user.account.id) };
  }
  const stored = cleanBio(p.bio);
  // Prompt photos come from the stored bio (the form never holds unsaved files).
  const promptPhoto = (id: string) => (stored.answers?.[id]?.photoKey ? `/people/${user.account.id}/photo/${id}` : null);
  return {
    v: view(c),
    vals,
    deck: currentDeck(user.account.id, stored),
    datingDeck: romanceEligible(p) ? currentDatingDeck(user.account.id, stored) : [],
    photo: await photoSrc(c, p.photoKey),
    hasPhoto: !!p.photoKey,
    promptPhoto,
    // errorField names the field the message belongs to, so the form shows it there and takes the member to it.
    errFor: (field: string) => (opts.errorField === field ? opts.error : undefined),
  };
}

async function renderProfileForm(
  c: C,
  vals: ProfileVals,
  opts: { error?: string; errorField?: string; errorSection?: SectionName | "all"; status?: 400; filesLost?: boolean; back?: "card" | "edit" } = {},
) {
  const d = await sectionData(c, vals, opts);
  // Reached from an ✏️ on my card (no JS): a plain save goes back to the card.
  const back = opts.back ?? (c.req.query("from") === "card" ? "card" : "edit");
  const saved = c.req.query("saved");
  const savedName = saved && isSectionName(saved) ? saved : null;
  // A prompt saved on its own opens the prompts it belongs to.
  const open = c.req.query("open") ?? (savedName ? hostSection(savedName, d.datingDeck) : null);
  return page(
    c,
    { title: view(c).t("แก้ไขโปรไฟล์", "Edit profile"), tab: "me", status: opts.status },
    <ProfileForm d={d} back={back} error={opts.error} errorSection={opts.errorSection} filesLost={opts.filesLost} saved={savedName} open={open} />,
  );
}

settingsRoutes.get("/settings/profile", (c) => renderProfileForm(c, profileVals(me(c).profile!)));

type Body = Record<string, string | File | (string | File)[]>;

/** The profile as the form has it so far, with the files and side effects a save will carry out. */
type Draft = {
  vals: ProfileVals;
  mainFile: File | null;
  removePhoto: boolean;
  pending: { id: string; file: File }[];
  dropKeys: string[];
  /** Normalised social links (null clears one) and the switch, when the post carried the links section. */
  links?: { values: Record<string, string | null>; on: boolean };
  /** The post carried the pronoun field (the all-in-one post from before pronouns lived here may not). */
  pronounsSent?: boolean;
};
type Fail = { error: string; errorField?: string };
/** What every section reads: the stored profile and my prompt decks. */
type EditCtx = { t: T; p: Profile; stored: Bio; deck: string[]; datingDeck: string[] };
type Applier = (body: Body, d: Draft, x: EditCtx) => Fail | null;

const fileOf = (raw: unknown): File | null => {
  const f = Array.isArray(raw) ? raw[0] : raw;
  return f instanceof File && f.size > 0 ? f : null;
};

/** The post carried a photo (main or a prompt's): a refused save can't give it back, so the page says so. */
const postedFiles = (body: Body) => Object.entries(body).some(([k, v]) => (k === "photo" || k.startsWith("f_")) && fileOf(v) !== null);

const oneOf = (v: string, list: { value: string }[]) => (list.some((x) => x.value === v) ? v : undefined);
const pickAll = (body: Body, key: string, allowed: string[]) => [...new Set(list(body[key]).filter((x) => allowed.includes(x)))];

function editCtx(c: C): EditCtx {
  const user = me(c);
  const p = user.profile!;
  const stored = cleanBio(p.bio);
  return {
    t: view(c).t,
    p,
    stored,
    deck: currentDeck(user.account.id, stored),
    // Dating prompts exist only while romance mode is on.
    datingDeck: romanceEligible(p) ? currentDatingDeck(user.account.id, stored) : [],
  };
}

const newDraft = (x: EditCtx): Draft => ({ vals: profileVals(x.p), mainFile: null, removePhoto: false, pending: [], dropKeys: [] });

/** Prompt answers for these prompts only; every other answer stays as it is. Returns the first problem. */
function applyPrompts(body: Body, d: Draft, x: EditCtx, ids: string[]): Fail | null {
  const { t } = x;
  const answers: Record<string, Answer> = { ...(d.vals.bio.answers ?? {}) };
  let first: Fail | null = null;
  const fail = (id: string, th: string, en: string) => {
    first ??= { error: t(th, en), errorField: `prompt-${id}` };
  };
  for (const id of ids) {
    const q = promptById(id);
    if (!q) continue;
    const old = x.stored.answers?.[id];
    const inForm = str(body[`m_${id}`]) === "1";
    if (str(body[`clear_${id}`]) === "1") {
      if (old?.photoKey) d.dropKeys.push(old.photoKey);
      delete answers[id];
      continue;
    }
    const title = t(q.th, q.en);
    if (q.kind === "photo") {
      const caption = validateAnswer(q, str(body[`a_${id}`]));
      if (!caption.ok) {
        fail(id, `${title}: ${caption.error.th}`, `${title}: ${caption.error.en}`);
        if (old) answers[id] = { ...old, value: str(body[`a_${id}`]) };
        continue;
      }
      const file = fileOf(body[`f_${id}`]);
      if (file) {
        if (!PHOTO_TYPES.includes(file.type)) {
          fail(id, `${title}: รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP`, `${title}: photos must be JPG, PNG or WebP.`);
          continue;
        }
        if (file.size > PHOTO_MAX_BYTES) {
          fail(id, `${title}: รูปต้องมีขนาดไม่เกิน 5 MB`, `${title}: photos must be 5 MB or smaller.`);
          continue;
        }
        d.pending.push({ id, file });
        if (old?.photoKey) d.dropKeys.push(old.photoKey);
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
      if (order === "partial") {
        fail(id, `${title}: เรียงอันดับให้ครบทุกข้อ และไม่ซ้ำกัน`, `${title}: give every item a different place.`);
        continue;
      }
      raw = order;
    } else {
      raw = list(body[`a_${id}`]);
    }
    const r = validateAnswer(q, raw);
    if (!r.ok) {
      fail(id, `${title}: ${r.error.th}`, `${title}: ${r.error.en}`);
      // Shown back as typed (text) or as picked, so fixing it is one change, not a retype.
      const typed = Array.isArray(raw) ? raw : raw ? [raw] : [];
      answers[id] = { kind: q.kind, value: q.kind === "text" ? (typed[0] ?? "") : typed };
      continue;
    }
    if (r.value === null) {
      // Not answered. Only an explicit empty field (or a rendered prompt) clears it.
      if (inForm || (q.kind === "text" && `a_${id}` in body)) delete answers[id];
    } else {
      answers[id] = { kind: q.kind, value: r.value };
    }
  }
  d.vals.bio.answers = answers;
  return first;
}

/** Each section reads its own fields off the post into the draft and says what's wrong, if anything. */
const APPLY: Record<(typeof SECTIONS)[number], Applier> = {
  photo(body, d, x) {
    d.mainFile = fileOf(body.photo);
    d.removePhoto = str(body.removePhoto) === "1";
    const f = d.mainFile;
    if (f && !PHOTO_TYPES.includes(f.type)) return { error: x.t("รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP", "Photos must be JPG, PNG or WebP."), errorField: "photo" };
    if (f && f.size > PHOTO_MAX_BYTES) return { error: x.t("รูปต้องมีขนาดไม่เกิน 5 MB", "Photos must be 5 MB or smaller."), errorField: "photo" };
    return null;
  },
  basics(body, d, x) {
    const v = d.vals;
    v.nickname = str(body.nickname);
    v.district = str(body.district);
    v.newcomer = str(body.newcomer) === "1";
    v.locale = str(body.locale) === "en" ? "en" : "th";
    if ("pronouns" in body) {
      d.pronounsSent = true;
      v.pronouns = str(body.pronouns).slice(0, 30) || null;
      v.showPronouns = !!v.pronouns && str(body.showPronouns) === "1";
    }
    if (!v.nickname) return { error: x.t("ใส่ชื่อเล่นก่อน", "Please add a nickname."), errorField: "nickname" };
    if (v.nickname.length > 30) return { error: x.t("ชื่อเล่นยาวได้ไม่เกิน 30 ตัวอักษร", "Nickname can be at most 30 characters."), errorField: "nickname" };
    if (!values(DISTRICTS).includes(v.district)) return { error: x.t("เลือกเขต", "Please choose a district."), errorField: "district" };
    return null;
  },
  languages(body, d, x) {
    d.vals.languages = pickAll(body, "languages", values(LANGUAGES));
    d.vals.bio.learningLangs = pickAll(body, "learningLangs", values(LANGUAGES));
    if (d.vals.languages.length === 0) return { error: x.t("เลือกภาษาที่พูดได้อย่างน้อย 1 ภาษา", "Pick at least one language."), errorField: "languages" };
    return null;
  },
  interests(body, d, x) {
    const v = d.vals;
    v.interests = pickAll(body, "interests", INTEREST_VALUES);
    if (v.interests.length === 0) return { error: x.t("เลือกความสนใจอย่างน้อย 1 อย่าง", "Pick at least one interest."), errorField: "interests" };
    if (v.interests.length > MAX_INTERESTS) return { error: x.t(`เลือกความสนใจได้ไม่เกิน ${MAX_INTERESTS} อย่าง`, `Pick at most ${MAX_INTERESTS} interests.`), errorField: "interests" };
    return null;
  },
  here(body, d) {
    d.vals.intents = pickAll(body, "intents", values(INTENTS));
    // Small / big group follow the group size answer (seating reads them).
    d.vals.socialStyles = withGroupStyle(pickAll(body, "socialStyles", values(SOCIAL_STYLES)), d.vals.bio.groupSize);
    return null;
  },
  comm(body, d, x) {
    const comm = pickAll(body, "comm", COMM_STYLES.map((s) => s.value));
    d.vals.bio.comm = comm;
    if (comm.length > MAX_COMM) return { error: x.t(`เลือกสไตล์การติดต่อได้ไม่เกิน ${MAX_COMM} แบบ`, `Pick at most ${MAX_COMM} communication styles.`), errorField: "comm" };
    return null;
  },
  bangkok(body, d, x) {
    const bio = d.vals.bio;
    Object.assign(bio, parseBangkok(str(body.story), str(body.bkkTime), str(body.hometown), str(body.guide)));
    // Sign-up's answer stays unless they pick another one.
    bio.residency = isResidency(str(body.residency)) ? str(body.residency) : x.stored.residency;
    // "My Bangkok" reflections: the form sends them all, so they replace the stored ones (all blank clears them).
    bio.reflections = str(body.r_present) === "1" ? reflectionsFromForm(body) : x.stored.reflections;
    if (!bio.reflections) delete bio.reflections;
    return null;
  },
  work(body, d, x) {
    const bio = d.vals.bio;
    Object.assign(
      bio,
      parseOccupation(str(body.occupation), str(body.occupationOther)),
      parseEducation({ level: str(body.education), detail: str(body.educationDetail), university: str(body.university), universityName: str(body.universityName), gradYear: str(body.gradYear) }),
    );
    bio.learning = str(body.learning);
    if (bio.learning.length > LEARNING_MAX) return { error: x.t(`"กำลังเรียนรู้" ยาวได้ไม่เกิน ${LEARNING_MAX} ตัวอักษร`, `"Currently learning" can be at most ${LEARNING_MAX} characters.`), errorField: "learning" };
    if (!bio.learning) delete bio.learning;
    return null;
  },
  meet(body, d) {
    const bio = d.vals.bio;
    const energy = str(body.energy);
    const weekend = str(body.weekendRhythm);
    Object.assign(bio, {
      energy: ENERGY.some((x) => x.value === energy) ? energy : undefined,
      weekend: WEEKEND_RHYTHM.some((x) => x.value === weekend) ? weekend : undefined,
      pay: pickAll(body, "pay", PAY_METHODS.map((x) => x.value)).slice(0, MAX_PAY),
      bill: oneOf(str(body.bill), BILL_STYLE),
      travel: pickAll(body, "travel", GETTING_AROUND.map((x) => x.value)).slice(0, MAX_TRAVEL),
      diet: pickAll(body, "diet", DIET.map((x) => x.value)),
      spice: oneOf(str(body.spice), SPICE),
      pets: oneOf(str(body.pets), PETS),
      punctual: oneOf(str(body.punctual), PUNCTUAL),
      budget: oneOf(str(body.budget), BUDGETS),
      activities: pickAll(body, "activities", ACTIVITIES.map((x) => x.value)),
      meals: pickAll(body, "meals", MEALS.map((x) => x.value)),
      groupSize: oneOf(str(body.groupSize), GROUP_SIZES),
      times: pickAll(body, "times", TIME_WINDOWS.map((x) => x.value)),
      access: pickAll(body, "access", ACCESS_NEEDS.map((x) => x.value)),
    } satisfies Partial<Bio>);
    // The small / big group style follows the group size; the other styles are Here for's.
    d.vals.socialStyles = withGroupStyle(d.vals.socialStyles, bio.groupSize);
    return null;
  },
  prompts(body, d, x) {
    d.vals.bio.deck = x.deck;
    return applyPrompts(body, d, x, x.deck);
  },
  "dating-prompts"(body, d, x) {
    d.vals.bio.datingDeck = x.datingDeck;
    return applyPrompts(body, d, x, x.datingDeck);
  },
  links(body, d, x) {
    // Only when the post carried its section, so other posts never clear them.
    if (str(body.links_present) !== "1") return null;
    const typed = Object.fromEntries(NETWORKS.map((n) => [n.key, str(body[`link_${n.key}`]).slice(0, 400)]));
    d.vals.links = typed;
    d.vals.linksOn = str(body.linksOn) === "1";
    const out: Record<string, string | null> = {};
    for (const n of NETWORKS) {
      const r = normaliseLink(n.key, typed[n.key] ?? "");
      if (!r.ok) {
        const name = x.t(n.th, n.en);
        return { error: x.t(`${name}: ${r.error.th}`, `${name}: ${r.error.en}`), errorField: n.key };
      }
      out[n.key] = r.value;
    }
    d.links = { values: out, on: d.vals.linksOn };
    return null;
  },
};

/** Run in this order (Meeting up sets the group size Here for's styles follow); errors are reported in ERROR_ORDER. */
const APPLY_ORDER: (typeof SECTIONS)[number][] = ["photo", "basics", "languages", "interests", "meet", "here", "comm", "bangkok", "work", "prompts", "dating-prompts", "links"];
const ERROR_ORDER: (typeof SECTIONS)[number][] = ["basics", "languages", "interests", "comm", "work", "photo", "prompts", "dating-prompts", "links"];

/** Which columns and bio keys a section may write. Nothing outside these is ever changed by its save. */
type ProfileCol = "nickname" | "district" | "pronouns" | "showPronouns" | "languages" | "interests" | "socialStyles" | "intents" | "newcomer" | "locale" | "photoKey";
type Scope = { cols: ProfileCol[]; bio: (keyof Bio)[]; answers: string[] };
function sectionScope(name: SectionName, x: Pick<EditCtx, "deck" | "datingDeck">): Scope {
  const one = promptOf(name);
  if (one) return { cols: [], bio: [x.datingDeck.includes(one) ? "datingDeck" : "deck"], answers: [one] };
  const s = (cols: ProfileCol[], bio: (keyof Bio)[] = [], answers: string[] = []): Scope => ({ cols, bio, answers });
  switch (name as (typeof SECTIONS)[number]) {
    case "photo":
      return s(["photoKey"]);
    case "basics":
      return s(["nickname", "district", "pronouns", "showPronouns", "newcomer", "locale"]);
    case "languages":
      return s(["languages"], ["learningLangs"]);
    case "interests":
      return s(["interests"]);
    case "here":
      return s(["intents", "socialStyles"]);
    case "comm":
      return s([], ["comm"]);
    case "bangkok":
      return s([], ["story", "bkkTime", "hometown", "guide", "residency", "reflections"]);
    case "work":
      return s([], ["occupation", "occupationOther", "education", "educationDetail", "university", "universityName", "gradYear", "learning"]);
    case "meet":
      return s(["socialStyles"], ["energy", "weekend", "pay", "bill", "travel", "diet", "spice", "pets", "punctual", "budget", "activities", "meals", "groupSize", "times", "access"]);
    case "prompts":
      return s([], ["deck"], x.deck);
    case "dating-prompts":
      return s([], ["datingDeck"], x.datingDeck);
    case "links":
      return s([]);
  }
  return s([]);
}

type Parsed = { ok: false; vals: ProfileVals; error: string; errorField?: string; section: SectionName | "all" } | { ok: true; draft: Draft; scope: Scope | "all" };

/** Read and validate the whole profile form (the all-in-one post). Touches nothing. */
function parseProfileForm(c: C, body: Body): Parsed {
  const x = editCtx(c);
  const d = newDraft(x);
  const errs = new Map<string, Fail>();
  // Every section is read first, so whatever error comes back, everything typed is still in the form.
  for (const n of APPLY_ORDER) {
    if (n === "dating-prompts" && !x.datingDeck.length) continue;
    const e = APPLY[n](body, d, x);
    if (e) errs.set(n, e);
  }
  // The whole form: answers to prompts no longer in either deck are dropped (with their photos).
  const bio = d.vals.bio;
  const all = [...x.deck, ...x.datingDeck];
  for (const [id, a] of Object.entries(bio.answers ?? {})) {
    if (all.includes(id)) continue;
    if (a.photoKey) d.dropKeys.push(a.photoKey);
    delete bio.answers![id];
  }
  bio.deck = x.deck;
  bio.datingDeck = x.datingDeck.length ? x.datingDeck : undefined;
  const first = ERROR_ORDER.find((n) => errs.has(n));
  if (first) return { ok: false, vals: d.vals, ...errs.get(first)!, section: "all" };
  return { ok: true, draft: d, scope: "all" };
}

/** Read and validate one section. Null when there is no such section for me (a prompt not in my decks, or dating prompts without 💘). */
function parseSection(c: C, name: SectionName, body: Body): Parsed | null {
  const x = editCtx(c);
  const d = newDraft(x);
  const one = promptOf(name);
  let e: Fail | null;
  if (one) {
    if (!x.deck.includes(one) && !x.datingDeck.includes(one)) return null;
    if (x.deck.includes(one)) d.vals.bio.deck = x.deck;
    else d.vals.bio.datingDeck = x.datingDeck;
    e = applyPrompts(body, d, x, [one]);
  } else {
    if (name === "dating-prompts" && !x.datingDeck.length) return null;
    e = APPLY[name as (typeof SECTIONS)[number]](body, d, x);
  }
  if (e) return { ok: false, vals: d.vals, ...e, section: name };
  return { ok: true, draft: d, scope: sectionScope(name, x) };
}

/** Upload files, then write the profile (only what the scope allows). Returns an error message or null. */
async function saveProfile(c: C, parsed: Extract<Parsed, { ok: true }>): Promise<string | null> {
  const { t } = view(c);
  const user = me(c);
  const p = user.profile!;
  const { draft, scope } = parsed;
  const vals = draft.vals;
  const may = (col: ProfileCol) => {
    if (scope !== "all") return scope.cols.includes(col);
    // The all-in-one post writes everything it carries; pronouns only when it carried them.
    return col === "pronouns" || col === "showPronouns" ? !!draft.pronounsSent : true;
  };
  // Server-generated keys only; bytes go straight to the file store.
  const uploaded: string[] = [];
  const put = async (key: string, file: File) => {
    await putObject(c.env, key, await file.arrayBuffer(), { contentType: file.type });
    uploaded.push(key);
  };
  let photoKey = p.photoKey;
  try {
    if (may("photoKey")) {
      if (draft.mainFile) {
        photoKey = `uploads/${user.account.id}/${crypto.randomUUID()}`;
        await put(photoKey, draft.mainFile);
      } else if (draft.removePhoto) {
        photoKey = null;
      }
    }
    for (const { id, file } of draft.pending) {
      const key = `uploads/${user.account.id}/prompts/${crypto.randomUUID()}`;
      await put(key, file);
      vals.bio.answers![id] = { ...vals.bio.answers![id], photoKey: key };
    }
  } catch {
    for (const k of uploaded) await deleteObject(c.env, k).catch(() => {});
    return t("อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง", "The photo couldn't be uploaded. Please try again.");
  }

  // The bio: the whole draft, or the stored bio with only this section's keys (and answers) replaced.
  const stored = cleanBio(p.bio);
  let bio: Bio;
  if (scope === "all") bio = vals.bio;
  else {
    bio = { ...stored };
    const out = bio as Record<string, unknown>;
    for (const k of scope.bio) {
      const val = vals.bio[k];
      if (val === undefined) delete out[k];
      else out[k] = val;
    }
    if (scope.answers.length) {
      const answers = { ...(stored.answers ?? {}) };
      for (const id of scope.answers) {
        const a = vals.bio.answers?.[id];
        if (a) answers[id] = a;
        else delete answers[id];
      }
      bio.answers = answers;
    }
  }
  const bioChanged = scope === "all" || scope.bio.length > 0 || scope.answers.length > 0;

  // This form only edits the non-romance intents; romance follows romance mode.
  const intents = [...(vals.intents.length ? vals.intents : ["friends"]), ...(p.romanceOn ? ["romance"] : [])];
  const all: Record<ProfileCol, unknown> = {
    nickname: vals.nickname,
    district: vals.district,
    pronouns: vals.pronouns,
    showPronouns: vals.showPronouns,
    languages: vals.languages,
    interests: vals.interests,
    socialStyles: vals.socialStyles,
    intents,
    newcomer: vals.newcomer,
    locale: vals.locale,
    photoKey,
  };
  const set: Partial<typeof profiles.$inferInsert> = {};
  for (const col of Object.keys(all) as ProfileCol[]) if (may(col)) (set as Record<string, unknown>)[col] = all[col];
  if (scope === "all") set.eventStyle = p.eventStyle;
  if (bioChanged) set.bio = bio;
  if (Object.keys(set).length) {
    set.updatedAt = new Date();
    await getDb(c.env).update(profiles).set(set).where(eq(profiles.accountId, user.account.id));
  }
  const drop = [...draft.dropKeys, ...(may("photoKey") && p.photoKey && p.photoKey !== photoKey ? [p.photoKey] : [])];
  for (const k of drop) await deleteObject(c.env, k).catch(() => {});
  if (may("locale") && vals.locale !== p.locale) setCookie(c, "lang", vals.locale, { path: "/", maxAge: 365 * 86_400, sameSite: "Lax" });
  // City Pulse follows the change reflection: replaced when edited, withdrawn when cleared (consent rules in syncQuizChange).
  const before = stored.reflections?.change;
  const after = bio.reflections?.change;
  if (draft.links) await saveLinks(c, draft.links);
  // Keep the in-request copy current for anything rendered after this.
  Object.assign(p, set);
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
  if (!parsed.ok) return renderProfileForm(c, parsed.vals, { error: parsed.error, errorField: parsed.errorField, errorSection: "all", status: 400, filesLost: postedFiles(body) });
  const err = await saveProfile(c, parsed);
  if (err) return renderProfileForm(c, parsed.draft.vals, { error: err, errorSection: "all", status: 400, filesLost: postedFiles(body) });
  return c.redirect("/settings?notice=saved");
});

/** A section save sent by the page's script (PE_JS): it gets the section's form back instead of a whole page. */
const inPlace = (c: C) => c.req.header("x-pe") === "1";

/** One section's form on its own, for an edit sheet or an in-place save. */
async function sectionFragment(
  c: C,
  name: SectionName,
  vals: ProfileVals,
  opts: { back: "card" | "edit"; saved?: boolean; error?: string; errorField?: string; filesLost?: boolean; status?: 200 | 400 },
) {
  const d = await sectionData(c, vals, opts);
  c.header("cache-control", "no-store");
  // The long form's row shows how much is filled in; a save updates it from this.
  if (opts.saved) c.header("x-pe-progress", encodeURIComponent(progressText(d.v.t, hostSection(name, d.datingDeck), d)));
  return c.html(
    <SectionForm
      d={d}
      name={name}
      back={opts.back}
      saved={opts.saved}
      sheet={opts.back === "card"}
      dirty={!!opts.error}
      formError={opts.error && !opts.errorField ? opts.error : undefined}
      filesLost={opts.filesLost}
    />,
    opts.status ?? 200,
  );
}

/** Where a plain (no JS) section save goes back to, with the tick flag. */
function savedUrl(name: SectionName, back: "card" | "edit") {
  return back === "card" ? `/me/profile?saved=${encodeURIComponent(name)}#pe-${name}` : `/settings/profile?saved=${encodeURIComponent(name)}#${sectionAnchor(name)}`;
}

/** One section's form (for an edit sheet). A plain visit goes to that section of the long form. */
settingsRoutes.get("/settings/profile/section/:name", async (c) => {
  const name = c.req.param("name");
  if (!isSectionName(name)) return c.notFound();
  const x = editCtx(c);
  const one = promptOf(name);
  if ((one && !x.deck.includes(one) && !x.datingDeck.includes(one)) || (name === "dating-prompts" && !x.datingDeck.length)) return c.notFound();
  if (!inPlace(c)) return c.redirect(`/settings/profile?open=${hostSection(name, x.datingDeck)}#${sectionAnchor(name)}`);
  return sectionFragment(c, name, profileVals(me(c).profile!), { back: c.req.query("back") === "card" ? "card" : "edit" });
});

/**
 * Save one section. Only that section's fields are read and only its columns and bio keys are
 * written, so whatever else the post carries, nothing outside the section changes.
 */
settingsRoutes.post("/settings/profile/section/:name", async (c) => {
  const name = c.req.param("name");
  if (!isSectionName(name)) return c.notFound();
  const body = (await c.req.parseBody({ all: true })) as Body;
  const back = str(body.back) === "card" ? "card" : "edit";
  const parsed = parseSection(c, name, body);
  if (!parsed) return c.notFound();
  const lost = postedFiles(body);
  const refuse = (vals: ProfileVals, error: string, errorField?: string) =>
    inPlace(c)
      ? sectionFragment(c, name, vals, { back, error, errorField, filesLost: lost, status: 400 })
      : renderProfileForm(c, vals, { error, errorField, errorSection: hostSection(name, editCtx(c).datingDeck), status: 400, filesLost: lost, back });
  if (!parsed.ok) return refuse(parsed.vals, parsed.error, parsed.errorField);
  const err = await saveProfile(c, parsed);
  if (err) return refuse(parsed.draft.vals, err);
  if (inPlace(c)) return sectionFragment(c, name, profileVals(me(c).profile!), { back, saved: true });
  return c.redirect(savedUrl(name, back), 303);
});

/**
 * "How others see it" (owner card 3): the edit form's current values, saved or not, drawn as my
 * card the way a connection sees it. The page's script posts every section's fields here (photos
 * left out). Every section reads the post exactly as a save would, then nothing is written: the
 * card is rendered from that draft through the same template and privacy filter as the real one.
 */
settingsRoutes.post("/settings/profile/preview", async (c) => {
  const body = (await c.req.parseBody({ all: true })) as Body;
  const x = editCtx(c);
  const d = newDraft(x);
  // Problems don't stop a preview: it shows what was typed, as far as it can be read.
  for (const n of APPLY_ORDER) if (n !== "dating-prompts" || x.datingDeck.length) APPLY[n](body, d, x);
  const v = d.vals;
  const draft: Profile = {
    ...x.p,
    nickname: v.nickname || x.p.nickname,
    district: v.district,
    pronouns: v.pronouns,
    showPronouns: v.showPronouns,
    languages: v.languages,
    interests: v.interests,
    socialStyles: v.socialStyles,
    intents: [...(v.intents.length ? v.intents : ["friends"]), ...(x.p.romanceOn ? ["romance"] : [])],
    newcomer: v.newcomer,
    photoKey: d.removePhoto ? null : x.p.photoKey,
    bio: v.bio,
  };
  c.header("cache-control", "no-store");
  return c.html(await previewCard(c, draft));
});

/**
 * Swap one prompt in my deck for an unused one. When posted from a prompts form (the ↻ button),
 * that form is saved first so nothing typed is lost; the old all-in-one form saved everything.
 */
settingsRoutes.post("/settings/prompts/shuffle", async (c) => {
  const body = (await c.req.parseBody({ all: true })) as Body;
  const user = me(c);
  const id = str(body.promptId);
  const dating = isDatingPrompt(id);
  if ("nickname" in body) {
    const parsed = parseProfileForm(c, body);
    if (!parsed.ok) return renderProfileForm(c, parsed.vals, { error: parsed.error, errorField: parsed.errorField, errorSection: "all", status: 400, filesLost: postedFiles(body) });
    const err = await saveProfile(c, parsed);
    if (err) return renderProfileForm(c, parsed.draft.vals, { error: err, errorSection: "all", status: 400, filesLost: postedFiles(body) });
  } else if ("back" in body) {
    const section: SectionName = dating ? "dating-prompts" : "prompts";
    const parsed = parseSection(c, section, body);
    if (!parsed) return c.text("Unknown prompt", 400);
    if (!parsed.ok) return renderProfileForm(c, parsed.vals, { error: parsed.error, errorField: parsed.errorField, errorSection: section, status: 400, filesLost: postedFiles(body) });
    const err = await saveProfile(c, parsed);
    if (err) return renderProfileForm(c, parsed.draft.vals, { error: err, errorSection: section, status: 400, filesLost: postedFiles(body) });
  }
  const p = user.profile!;
  const bio = cleanBio(p.bio);
  if (dating && !romanceEligible(p)) return c.text("Unknown prompt", 400);
  const deck = dating ? currentDatingDeck(user.account.id, bio) : currentDeck(user.account.id, bio);
  if (!deck.includes(id)) return c.text("Unknown prompt", 400);
  const next = swapPrompt(deck, id, Math.random, bio.skipped ?? []);
  if (next === deck) return c.redirect(dating ? "/settings/profile?open=dating-prompts#dating-prompts" : "/settings/profile?open=prompts#prompts");
  const answers = { ...(bio.answers ?? {}) };
  const dropKey = answers[id]?.photoKey;
  delete answers[id];
  const newBio: Bio = { ...bio, ...(dating ? { datingDeck: next } : { deck: next }), answers, skipped: [...(bio.skipped ?? []).filter((x) => x !== id), id].slice(-40) };
  await getDb(c.env).update(profiles).set({ bio: newBio, updatedAt: new Date() }).where(eq(profiles.accountId, user.account.id));
  if (dropKey) await deleteObject(c.env, dropKey).catch(() => {});
  const fresh = next[deck.indexOf(id)];
  return c.redirect(`/settings/profile?notice=saved&open=${dating ? "dating-prompts" : "prompts"}#prompt-${fresh}`);
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
  // No audit row for a relationship change: its time would sit next to the 💘 switch in a log staff read (owner, 2026-10-26).
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
  // No audit row: staff would see its time next to the 💘 switch (owner, 2026-10-26). The consent row stays.
  if (toSingle) queries.push(...(await privateFieldConsents(db, id, { relationship: "single" })));
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
 * PRD §4.4: pending romantic choices are withdrawn. Owner, 2026-10-26: they
 * are deleted, not turned into a "friend" pick the member never made. Choices
 * whose People I Met window (72h) is still open are the only pending ones.
 */
function withdrawRomanceChoices(db: ReturnType<typeof getDb>, accountId: string) {
  const openSince = new Date(Date.now() - 72 * 3_600_000);
  return db
    .delete(connectionChoices)
    .where(
      and(
        eq(connectionChoices.fromAccount, accountId),
        eq(connectionChoices.choice, "romance"),
        inArray(connectionChoices.eventId, db.select({ id: events.id }).from(events).where(gt(events.endsAt, openSince))),
      ),
    );
}

// -------------------------------------------------------------- privacy --

/** Switched on and off with a plain toggle; the consent centre (/settings/consents) also sends profile_links. */
const OPTIONAL = ["personalization", "research", "notifications"];

function PrivacyCenter(props: { v: View; current: Map<string, boolean> }) {
  const { t, lang } = props.v;
  const stores: [string, string, string, string][] = [
    ["🪪 ข้อมูลตัวตน", "🪪 Identity store", "ชื่อผู้ใช้ รหัสผ่าน (เข้ารหัสแล้ว) สถานะบัญชีและการยืนยันตัวตน", "Username, password (hashed), account and verification status."],
    ["👥 ข้อมูลการใช้งาน", "👥 Social store", "ชื่อเล่น รูป ความสนใจ กิจกรรมที่ลงทะเบียน คนรู้จัก และการตั้งค่าส่วนตัว", "Nickname, photo, interests, events, connections and your private preferences."],
    ["📊 ข้อมูลวิจัยเมือง", "📊 City research store", "คำตอบ City Pulse และคำถามเรื่องความรู้สึก เก็บโดยใช้รหัสแทนชื่อ เมื่อปิดบัญชี เราตัดรหัสนี้ออกจากบัญชีของคุณ", "City Pulse and wellbeing answers, kept under a code, not your name. When you deactivate, the code is cut from your account."],
  ];
  return (
    <>
      <p>
        <a href="/settings">← {t("ฉัน", "Me")}</a>
      </p>
      <h1>{t("ศูนย์ความเป็นส่วนตัว", "Privacy centre")}</h1>
      <p class="muted">{t("ข้อมูลของคุณ: ดูว่าเก็บที่ไหน ดาวน์โหลด หรือปิดบัญชี", "Your data: where it lives, download it, or close your account.")}</p>
      <p class="row">
        <a class="btn ghost" href="/settings/consents">{t("ความยินยอมของฉัน", "My consents")} <span aria-hidden="true">→</span></a>
        <a class="btn ghost" href="/privacy">{t("นโยบายความเป็นส่วนตัว", "Privacy notice")}</a>
      </p>
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
        <h2>{t("ข้อมูลของฉัน", "My data")}</h2>
        <p>{t("ดาวน์โหลดสำเนาข้อมูลทั้งหมดของคุณเป็นไฟล์ JSON", "Download a copy of all your data as a JSON file.")}</p>
        <LinkButton href="/settings/privacy/export" kind="ghost">
          {t("ดาวน์โหลดข้อมูลของฉัน", "Download my data")}
        </LinkButton>
      </Card>
      <Card>
        <h2 id="deactivate">{t("ปิดบัญชี", "Deactivate account")}</h2>
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
  return page(c, { title: view(c).t("ศูนย์ความเป็นส่วนตัว", "Privacy centre"), tab: "me" }, <PrivacyCenter v={view(c)} current={current} />);
});

/** Saves consents from the Privacy Center or the consent centre: append-only rows, latest wins. */
async function saveConsents(c: C) {
  const fromCentre = c.req.path === "/settings/consents";
  const user = me(c);
  const p = user.profile!;
  const body = await c.req.parseBody();
  const current = await currentConsents(c, user.account.id);
  const db = getDb(c.env);
  const queries: { toSQL(): { sql: string; params: unknown[] } }[] = [];
  const changed: Record<string, boolean> = {};
  for (const key of fromCentre ? [...OPTIONAL, PROFILE_LINKS_CONSENT] : OPTIONAL) {
    const want = str(body[`consent_${key}`]) === "1";
    if (want !== !!current.get(key)) changed[key] = want;
  }
  // romance_data can only be withdrawn here; switching it on happens with romance mode.
  if (current.get("romance_data") && str(body.consent_romance_data) !== "1") {
    changed.romance_data = false;
    queries.push(db.update(profiles).set({ ...romanceOffPatch(p), updatedAt: new Date() }).where(eq(profiles.accountId, user.account.id)));
    if (p.romanceOn) queries.push(withdrawRomanceChoices(db, user.account.id), ...endPinkies(db, user.account.id));
  }
  // Relationship status and private gender are given in Connection preferences and can be
  // withdrawn on the consent centre (its switches show only while they are given). The
  // Privacy Center's form has no such switches, so it never withdraws them.
  if (fromCentre) {
    for (const key of [RELATIONSHIP_CONSENT, GENDER_CONSENT]) {
      if (current.get(key) && str(body[`consent_${key}`]) !== "1") changed[key] = false;
    }
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
  return c.redirect(fromCentre ? "/settings/consents?notice=saved" : "/settings/privacy?notice=saved");
}
settingsRoutes.post("/settings/privacy", saveConsents);
settingsRoutes.post("/settings/consents", saveConsents);

/** The card on Me: agree to the current Terms (a "terms" row with TERMS_VERSION). */
settingsRoutes.post("/settings/terms", async (c) => {
  const user = me(c);
  const db = getDb(c.env);
  if (!(await acceptedTerms(db, user.account.id))) {
    await batch(c.env, [termsRow(db, user.account.id), audit(db, user.account.id, "consent.updated", { type: "account", id: user.account.id }, { changed: { terms: true }, via: "me_card" })]);
  }
  return c.redirect("/settings?notice=saved");
});

settingsRoutes.get("/settings/privacy/export", async (c) => {
  const user = me(c);
  const id = user.account.id;
  const rid = user.account.researchId;
  const db = getDb(c.env);
  const [account, profile, consentRows, regs, choices, conns, shares, reps, notes, pulse, wb, pushDevices] = await Promise.all([
    db
      .select({
        username: accounts.username,
        role: accounts.role,
        status: accounts.status,
        verification: accounts.verification,
        bkkRegistered: accounts.bkkRegistered,
        // The campaign or partner link that brought them (a short slug, src/lib/source.ts).
        signupSource: accounts.signupSource,
        createdAt: accounts.createdAt,
      })
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
  // Privacy R4: chats (my own messages), dating intents, buddy data, meet feedback, thanks,
  // plans and "home safe?" answers. Other people appear only as the nickname I already see.
  const [myMessages, myDating, myOptin, myMatches, mySwipes, myStamps, myMeetFeedback, thanksSent, thanksGot, myPlans, myPitches, myJoins, mySafe] = await Promise.all([
    db
      .select({ thread: chatMessages.thread, kind: chatMessages.kind, body: chatMessages.body, hasPhoto: isNotNull(chatMessages.photoKey), pollOptions: chatMessages.pollOptions, hiddenAt: chatMessages.hiddenAt, createdAt: chatMessages.createdAt })
      .from(chatMessages)
      .where(eq(chatMessages.sender, id))
      .orderBy(desc(chatMessages.createdAt))
      .limit(5000),
    db.select({ mode: datingIntents.mode, reasons: datingIntents.reasons, challenges: datingIntents.challenges, prefs: datingIntents.prefs, updatedAt: datingIntents.updatedAt }).from(datingIntents).where(eq(datingIntents.accountId, id)).limit(1),
    db.select({ intent: buddyOptins.intent, active: buddyOptins.active, updatedAt: buddyOptins.updatedAt }).from(buddyOptins).where(eq(buddyOptins.accountId, id)).limit(1),
    db.select().from(buddyMatches).where(or(eq(buddyMatches.aAccount, id), eq(buddyMatches.bAccount, id))).orderBy(desc(buddyMatches.createdAt)).limit(500),
    db.select({ choice: buddySwipes.choice, createdAt: buddySwipes.createdAt }).from(buddySwipes).where(eq(buddySwipes.accountId, id)).limit(5000),
    db.select({ district: passportStamps.district, source: passportStamps.source, createdAt: passportStamps.createdAt }).from(passportStamps).where(eq(passportStamps.accountId, id)).limit(100),
    db
      .select({ kind: meetFeedback.kind, showedUp: meetFeedback.showedUp, onTime: meetFeedback.onTime, feltSafe: meetFeedback.feltSafe, feltHeard: meetFeedback.feltHeard, wouldMeetAgain: meetFeedback.wouldMeetAgain, comment: meetFeedback.comment, createdAt: meetFeedback.createdAt })
      .from(meetFeedback)
      .where(eq(meetFeedback.accountId, id))
      .limit(1000),
    db.select({ to: thanks.toAccount, body: thanks.body, createdAt: thanks.createdAt }).from(thanks).where(eq(thanks.fromAccount, id)).limit(1000),
    db.select({ from: thanks.fromAccount, body: thanks.body, createdAt: thanks.createdAt }).from(thanks).where(eq(thanks.toAccount, id)).limit(1000),
    db.select({ week: weeklyPlans.week, picks: weeklyPlans.picks, status: weeklyPlans.status, skipReason: weeklyPlans.skipReason, decidedAt: weeklyPlans.decidedAt, createdAt: weeklyPlans.createdAt }).from(weeklyPlans).where(eq(weeklyPlans.accountId, id)).limit(500),
    db.select({ week: planPitches.week, what: planPitches.what, district: planPitches.district, when: planPitches.whenText, audience: planPitches.audience, createdAt: planPitches.createdAt }).from(planPitches).where(eq(planPitches.accountId, id)).limit(500),
    db.select({ what: planPitches.what, joinedAt: pitchJoins.createdAt }).from(pitchJoins).innerJoin(planPitches, eq(planPitches.id, pitchJoins.pitchId)).where(eq(pitchJoins.accountId, id)).limit(500),
    db.select({ context: safeArrivals.context, backBy: safeArrivals.backBy, answer: safeArrivals.answer, answeredAt: safeArrivals.answeredAt, createdAt: safeArrivals.createdAt }).from(safeArrivals).where(eq(safeArrivals.accountId, id)).limit(1000),
  ]);
  // Regular Tables, Table Host requests, hangout shares and poll votes: my own rows only.
  // A table's join token, a reviewer's id and the poll's own text never leave.
  const [myTables, tablesIHost, hostRequests, sharesISent, sharesIGot, myVotes] = await Promise.all([
    db
      .select({ table: regularTables.name, district: regularTables.district, joinedAt: regularTableMembers.joinedAt, leftAt: regularTableMembers.leftAt, rejoinAfter: regularTableMembers.rejoinAfter })
      .from(regularTableMembers)
      .innerJoin(regularTables, eq(regularTables.id, regularTableMembers.tableId))
      .where(eq(regularTableMembers.accountId, id))
      .limit(500),
    db
      .select({ name: regularTables.name, district: regularTables.district, description: regularTables.description, womenOnly: regularTables.womenOnly, createdAt: regularTables.createdAt, archivedAt: regularTables.archivedAt })
      .from(regularTables)
      .where(eq(regularTables.hostAccountId, id))
      .limit(100),
    db
      .select({ tableName: circleHeadRequests.circleName, plan: circleHeadRequests.plan, status: circleHeadRequests.status, reviewNote: circleHeadRequests.reviewNote, reviewedAt: circleHeadRequests.reviewedAt, createdAt: circleHeadRequests.createdAt })
      .from(circleHeadRequests)
      .where(eq(circleHeadRequests.accountId, id))
      .limit(100),
    db
      .select({ to: circleShares.toAccount, event: events.title, createdAt: circleShares.createdAt })
      .from(circleShares)
      .leftJoin(events, eq(events.id, circleShares.eventId))
      .where(eq(circleShares.fromAccount, id))
      .limit(2000),
    db
      .select({ from: circleShares.fromAccount, event: events.title, createdAt: circleShares.createdAt })
      .from(circleShares)
      .leftJoin(events, eq(events.id, circleShares.eventId))
      .where(eq(circleShares.toAccount, id))
      .limit(2000),
    db
      .select({ thread: chatMessages.thread, option: chatVotes.option, createdAt: chatVotes.createdAt })
      .from(chatVotes)
      .leftJoin(chatMessages, eq(chatMessages.id, chatVotes.messageId))
      .where(eq(chatVotes.accountId, id))
      .limit(5000),
  ]);
  const buddyIds = myMatches.map((m) => (m.aAccount === id ? m.bAccount : m.aAccount));
  const shareIds = [...sharesISent.map((x) => x.to), ...sharesIGot.map((x) => x.from)];
  const thanksIds = [...thanksSent.map((x) => x.to), ...thanksGot.map((x) => x.from)];

  const [vibe, myStrikes, myBlocks, myFeedback, invitesMade, inviteUsed, linked, [emails], myAnnouncements] = await Promise.all([
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
    // Announcements I sent as a host: the event's title, the kind, my message and what it changed.
    db
      .select({ event: events.title, kind: announcements.kind, body: announcements.body, detail: announcements.detail, createdAt: announcements.createdAt })
      .from(announcements)
      .leftJoin(events, eq(events.id, announcements.eventId))
      .where(eq(announcements.authorAccountId, id))
      .orderBy(desc(announcements.createdAt))
      .limit(2000),
  ]);

  // Other people in my connections and blocks: nickname only.
  const otherIds = [...new Set([...conns.map((x) => (x.a === id ? x.b : x.a)), ...myBlocks.map((b) => b.blocked), ...buddyIds, ...thanksIds, ...shareIds])];
  const others = otherIds.length
    ? await db.select({ id: profiles.accountId, nickname: profiles.nickname }).from(profiles).where(inArray(profiles.accountId, otherIds)).limit(otherIds.length)
    : [];
  const nick = new Map(others.map((o) => [o.id, o.nickname]));

  const data = {
    exportedAt: new Date().toISOString(),
    account: account[0] ?? null,
    // The photo is noted, not its private storage key.
    profile: profile[0] ? (({ accountId: _a, photoKey, ...rest }) => ({ ...rest, hasPhoto: !!photoKey }))(profile[0]) : null,
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
    // Chat threads are named by kind only (buddy, connection, circle); photos are noted, not exported as storage keys.
    chatMessagesISent: myMessages.map(({ thread, ...rest }) => ({ thread: thread.split(":")[0], ...rest })),
    datingIntents: myDating[0] ?? null,
    bangkokBuddy: {
      optIn: myOptin[0] ?? null,
      buddies: myMatches.map((m) => ({
        with: nick.get(m.aAccount === id ? m.bAccount : m.aAccount) ?? null,
        week: m.week,
        state: m.state,
        iSaidMeetAt: m.aAccount === id ? m.aMeetAt : m.bMeetAt,
        endedAt: m.endedAt,
        createdAt: m.createdAt,
      })),
      // The deck: my own "I'd meet them" and "Not now" picks, without who they were about.
      deckPicks: mySwipes,
      passportStamps: myStamps,
    },
    meetFeedbackIGave: myMeetFeedback,
    thanksISent: thanksSent.map((x) => ({ to: nick.get(x.to) ?? null, body: x.body, createdAt: x.createdAt })),
    thanksIReceived: thanksGot.map((x) => ({ from: nick.get(x.from) ?? null, body: x.body, createdAt: x.createdAt })),
    weeklyPlans: myPlans,
    planPitches: myPitches,
    pitchesIJoined: myJoins,
    regularTables: {
      memberships: myTables,
      tablesIHost,
      tableHostRequests: hostRequests,
    },
    // Private hangouts shared through a Regular Table: the other person by nickname only.
    hangoutSharesISent: sharesISent.map((x) => ({ to: nick.get(x.to) ?? null, event: x.event, createdAt: x.createdAt })),
    hangoutSharesIReceived: sharesIGot.map((x) => ({ from: nick.get(x.from) ?? null, event: x.event, createdAt: x.createdAt })),
    // My votes on chat polls: the thread kind and the option number I picked, not the poll's text.
    chatPollVotes: myVotes.map(({ thread, ...rest }) => ({ thread: thread ? thread.split(":")[0] : null, ...rest })),
    announcementsISent: myAnnouncements,
    homeSafeChecks: mySafe.map(({ context, ...rest }) => ({ about: context.split(":")[0], ...rest })),
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
      { title: v.t("ศูนย์ความเป็นส่วนตัว", "Privacy centre"), tab: "me", status: 400 },
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
    db.update(accounts).set({ status: "deactivated", deactivatedAt: new Date() }).where(eq(accounts.id, id)),
    // City Pulse and wellbeing answers go now, as on research withdrawal, and the research_id is
    // cut. Deleting them later isn't possible: once the code is cut nothing links them to the account.
    ...researchWithdrawn(db, id, user.account.researchId),
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
