/**
 * Settings, privacy part (split from routes/settings.tsx, Core Platform C3: a pure move).
 * See ./index.ts for the route list.
 */
import { endPinkies } from "../../services/pinky";
import { EXIT_REASONS } from "../../content/dating";
import { and, count, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { batch, getDb } from "../../db";
import { audit } from "../../lib/records";
import { moderationHistory } from "../../services/moderation-export";
import { waiveNoteOf, waiveReasonOf } from "../../lib/constants";
import { WAIVE_REASONS } from "../../domain/waive-note";
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
  profiles,
  pulseQuestions,
  pulseResponses,
  registrations,
  auditLog,
  graduations,
  moderationActions,
  reports,
  wellbeing,
} from "../../schema";
import { Button, Card, LinkButton, page, str, TextArea, Toggle, view, type View } from "../../ui/kit";
import { linkText, PROFILE_LINKS_CONSENT } from "../../content/social-links";
import { ownLinks } from "../../services/profile-links";
import { dropPendingDating } from "../onboarding";
import { acceptedTerms, consentEffects, consentRow, GENDER_CONSENT, RELATIONSHIP_CONSENT, termsRow } from "../../services/consent";
import { settingsRoutes } from "./app";
import { currentConsents, me, romanceOffPatch, withdrawRomanceChoices } from "./shared";
import type { C } from "./shared";

// -------------------------------------------------------------- privacy --

/** Switched on and off with a plain toggle; the consent centre (/settings/consents) also sends profile_links. */
const OPTIONAL = ["personalization", "research", "notifications"];

export function PrivacyCenter(props: { v: View; current: Map<string, boolean> }) {
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
    // Card D3: "reasons" and "challenges" are no longer collected and are emptied by retention, so not exported.
    db.select({ mode: datingIntents.mode, prefs: datingIntents.prefs, updatedAt: datingIntents.updatedAt }).from(datingIntents).where(eq(datingIntents.accountId, id)).limit(1),
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
      .select({ id: strikes.id, event: events.title, reason: strikes.reason, expiresAt: strikes.expiresAt, waived: strikes.waivedBy, waivedNote: strikes.waivedReason, createdAt: strikes.createdAt })
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
  // When each of my strikes was waived: the audit row's date only (not who).
  const waivedIds = myStrikes.filter((s) => s.waived).map((s) => s.id);
  const waivedAtOf = new Map(
    waivedIds.length
      ? (
          await db
            .select({ id: auditLog.targetId, at: auditLog.createdAt })
            .from(auditLog)
            .where(and(eq(auditLog.action, "strike.waive"), inArray(auditLog.targetId, waivedIds)))
            .limit(waivedIds.length * 2)
        ).map((r) => [r.id ?? "", r.at] as const)
      : [],
  );
  // Moderation about me: only what the member was told (services/moderation-export.ts).
  const [modActions, ownReports, myGraduations] = await Promise.all([
    db
      .select({ action: moderationActions.action, until: moderationActions.until, note: moderationActions.note, reportId: moderationActions.reportId, createdAt: moderationActions.createdAt })
      .from(moderationActions)
      .where(eq(moderationActions.accountId, id))
      .limit(1000),
    db
      .select({ id: reports.id, reporter: reports.reporter, targetAccount: reports.targetAccount, details: reports.details, status: reports.status, resolvedAt: reports.resolvedAt, createdAt: reports.createdAt })
      .from(reports)
      .where(eq(reports.reporter, id))
      .limit(500),
    db
      .select({ a: connections.aAccount, b: connections.bAccount, aStill: graduations.aStill, bStill: graduations.bStill, createdAt: graduations.createdAt })
      .from(graduations)
      .innerJoin(connections, eq(connections.id, graduations.connectionId))
      .where(or(eq(connections.aAccount, id), eq(connections.bAccount, id)))
      .limit(2000),
  ]);

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
    // Card D1 (owner decision, 2026-10-30): why a strike was waived, as the chosen reason AND the note, with
    // the date. Older waivers have no reason, only their note. Never who waived it.
    strikes: myStrikes.map(({ id: strikeId, waived, waivedNote, ...rest }) => {
      const key = waived ? waiveReasonOf(waivedNote) : null;
      return {
        ...rest,
        waived: !!waived,
        waivedAt: waived ? (waivedAtOf.get(strikeId) ?? null) : null,
        waivedBecause: key ? (({ th, en }) => ({ key, th, en }))(WAIVE_REASONS.find((r) => r.value === key)!) : null,
        waivedNote: waived ? waiveNoteOf(waivedNote) : null,
      };
    }),
    // Card D1: my own "still in touch?" answer for each friendship that graduated, never the other person's.
    friendshipsOutsideTheApp: myGraduations.map((g) => ({
      with: nick.get(g.a === id ? g.b : g.a) ?? null,
      since: g.createdAt,
      myStillInTouchAnswer: g.a === id ? g.aStill : g.bStill,
    })),
    moderationAboutMe: moderationHistory(id, modActions, ownReports),
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
