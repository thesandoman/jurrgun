/**
 * Settings, hub part (split from routes/settings.tsx, Core Platform C3: a pure move).
 * See ./index.ts for the route list.
 */
import { endPinkies } from "../../services/pinky";
import { canBeWomenOnly, canSwitchToSingle, isPaused, romanceEligible } from "../../domain/rules";
import { ROMANCE_EXPLAINER } from "../../content/dating";
import { canHost } from "../../domain/hosting";
import { and, asc, desc, eq, gt, ne } from "drizzle-orm";
import { batch, getDb } from "../../db";
import { isPasswordless } from "../../domain/rules";
import { DISTRICTS, label } from "../../lib/constants";
import { cleanBio, currentDatingDeck, isDatingPrompt } from "../../content/profile";
import { MeHub, meLine, type MeStep } from "../../ui/me-hub";
import { SubLabel } from "../../ui/section-head";
import { newId } from "../../lib/crypto";
import { allowedEndpoint } from "../../lib/webpush";
import { vapidKeys } from "../../services/push";
import { PushSwitch } from "../../ui/push-switch";
import { emailEnabled } from "../../services/email-code";
import { audit } from "../../lib/records";
import { datingIntents, consents, events, pushSubscriptions, profiles, registrations } from "../../schema";
import { page, str, view } from "../../ui/kit";
import { myTables } from "../../services/regular-tables";
import { CONSENT_VERSION, dropPendingDating, pendingDatingIntent } from "../onboarding";
import {
  acceptedTerms,
  consentEffects,
  consentRow,
  hasConsent,
  NOTIFICATIONS_CONSENT,
  privateFieldConsents,
  ROMANCE_CONSENT,
} from "../../services/consent";
import { isArchetype, loadVibe } from "../quiz";
import { ARCHETYPES, displayName } from "../../vibe/archetypes";
import { fmtDate, L, type T } from "../../lib/i18n";
import { NOTICE_CHANGES, NOTICE_DATE } from "../../content/privacy";
import { Sheet } from "../../ui/sheet";
import { settingsRoutes } from "./app";
import { DISTRICT_ALERT_ON, districtName, optInText } from "../../domain/district-alert";
import { me, photoSrc, romanceOffPatch, withdrawRomanceChoices } from "./shared";
import type { C } from "./shared";

// ------------------------------------------------------------------ hub --

settingsRoutes.get("/settings", async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const user = me(c);
  const p = user.profile!;
  const db = getDb(c.env);
  const now = new Date();
  // The counts (events, people, coming up) moved to My month in people (mobile card 6); Me keeps one line.
  // Every read here is independent, so all go in one wave (owner card D3: the dating mode used to wait for the rest).
  const [termsOk, photo, vibe, tables, [nextUp], notifYes, [dating]] = await Promise.all([
    acceptedTerms(db, user.account.id),
    // The small avatar beside Me's line.
    photoSrc(c, p.photoKey),
    loadVibe(c.env, user.account.id),
    // People can sit at several Regular Tables; the count is in Me's one line.
    myTables(db, user.account.id),
    // The next table I'm seated at: Me leads with it (owner, Phase 2).
    db
      .select({ id: events.id, title: events.title, titleEn: events.titleEn, startsAt: events.startsAt, district: events.district })
      .from(registrations)
      .innerJoin(events, eq(events.id, registrations.eventId))
      .where(and(eq(registrations.accountId, user.account.id), eq(registrations.status, "confirmed"), gt(events.startsAt, now), ne(events.status, "cancelled")))
      .orderBy(asc(events.startsAt))
      .limit(1),
    hasConsent(db, user.account.id, NOTIFICATIONS_CONSENT),
    db.select({ mode: datingIntents.mode }).from(datingIntents).where(eq(datingIntents.accountId, user.account.id)).limit(1),
  ]);
  const dates = dating?.mode === "dating" || dating?.mode === "dating_only";
  const vibeKey = vibe && isArchetype(vibe.archetype) ? vibe.archetype : null;
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
      {/* The empty-district alert (owner card 7): shown while notifications are on; off with them, whatever the switch says. */}
      {notifYes && districtName(p.district, lang) ? (
        <QuickSwitch
          k="districtAlert"
          on={p.districtAlertOptIn}
          emoji="📍"
          title={optInText(p.district, t)}
          hint={t("สัปดาห์ละไม่เกินครั้งเดียว ปิดได้ทุกเมื่อ", "At most once a week. Turn it off any time.")}
        />
      ) : null}
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
      photo={photo}
      seed={user.account.id}
      line={meLine(lang, created ?? null, tables.length, districtName(p.district, lang))}
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
            <span>{t("ยังไม่มี", "None yet")}</span>
            <b class="me-next-go">
              {t("หาสักโต๊ะ", "Find one")} <span aria-hidden="true">→</span>
            </b>
          </a>
        )
      }
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
  // The empty-district alert (owner card 7): on only with a yes to notifications; the audit row is the opt-in time.
  if (str(body.key) === "districtAlert") {
    const db = getDb(c.env);
    if (!on) await db.update(profiles).set({ districtAlertOptIn: false, updatedAt: new Date() }).where(eq(profiles.accountId, user.account.id));
    else if (!p.districtAlertOptIn && districtName(p.district, "en") && (await hasConsent(db, user.account.id, NOTIFICATIONS_CONSENT))) {
      await batch(c.env, [
        db.update(profiles).set({ districtAlertOptIn: true, updatedAt: new Date() }).where(eq(profiles.accountId, user.account.id)),
        audit(db, user.account.id, DISTRICT_ALERT_ON, { type: "account", id: user.account.id }),
      ]);
    }
    return c.redirect("/settings?notice=saved#quick");
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
