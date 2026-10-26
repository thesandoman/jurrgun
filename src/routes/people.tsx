/**
 * After the event (PRD §10, §11): People I Met, private choices and the
 * mutual-consent logic, My Bangkok circle with contact exchange, reporting,
 * blocking and notifications.
 *
 * Hard rules kept here:
 *  - An unreturned choice is never disclosed: no page, notification or
 *    response says who chose whom. Only a mutual choice creates anything.
 *  - "romance" is only offered to eligible users; a forged one is coerced to
 *    "friend". An unmatched romance choice quietly acts as "friend".
 *  - Nicknames only. No member search, no messaging.
 *
 * Every route needs `requireMember`. It is attached per route, not with
 * `use("*")`, because this sub-app is mounted at "/" and a wildcard would
 * wrap every page in the app.
 */
import { isStaffTarget, limitText, reportLimit, staffAlert } from "../services/report-intake";
import { vapidKeys } from "../services/push";
import { PushSwitch } from "../ui/push-switch";
import { MAX_SHARES_PER_DAY } from "../domain/rules";
import { canHost } from "../domain/hosting";
import { myTables, raiseConflicts } from "../services/regular-tables";
import { Hono, type Context } from "hono";
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { batch, getDb } from "../db";
import {
  ageOn,
  allowedChoices,
  cleanHandle,
  mutualAgeOk,
  peopleWindow,
  resolveMutual,
  romanceCompatible,
  romanceEligible,
  type Choice,
  type Level,
} from "../domain/rules";
import { CHOICE_LABELS, DISTRICTS, label, REPORT_REASON_LABELS } from "../lib/constants";
import { newId } from "../lib/crypto";
import type { AppEnv } from "../lib/env";
import { fmtDate, fmtDay } from "../lib/i18n";
import { audit, notify } from "../lib/records";
import { requireMember } from "../lib/session";
import {
  accounts,
  blocks,
  buddyMatches,
  buddyQuests,
  circleShares,
  connectionChoices,
  connections,
  contactShares,
  events,
  graduations,
  notifications,
  profiles,
  registrations,
  REPORT_REASONS,
  reports,
  thanks,
  vibes,
  type Event,
  type Profile,
} from "../schema";
import { ARCHETYPES, displayName as typeName, matchLabel, MATCH_LABELS, normalizeType, type ArchetypeKey } from "../vibe/archetypes";
import { Button, Card, Choices, Empty, Field, LinkButton, Notice, page, Select, str, Tag, TextArea, Toggle, view, safeNext, type View } from "../ui/kit";
import { DistrictAlertOff, NotifItems } from "../ui/notif-menu";
import { KIND_DISTRICT_ALERT } from "../domain/district-alert";
import { ChatsLink, NewBadge } from "../ui/unread";
import { ChatRow, chatRows, type ChatRowData } from "./chat";
import { CHAT_KIND } from "../domain/chat";
import { KIND_DIGEST, isDigest } from "../domain/digest";
import { AvatarStack, artFor } from "../ui/visual";
import { QuestionArt } from "../ui/question-art";
import { seeAgain, type SeeAgain } from "../services/see-again";
import { endedWith, withdrawPairTaps } from "../services/pinky";
import { SeeAgainCard } from "../ui/see-again";
import { Sheet } from "../ui/sheet";
import { visibleLinks, type ShownLink } from "../services/profile-links";
import { ProfileLinksSheet } from "../ui/profile-links";

export const peopleRoutes = new Hono<AppEnv>();

type Ctx = Context<AppEnv>;
type Db = ReturnType<typeof getDb>;

const CHOICE_SET = new Set<string>(["friend", "activity", "again", "romance", "none"]);
/** Wherever people already talk: Jurrgun gets you to meet, then hands you over to your own app. */
const CONTACT_METHODS = [
  { value: "line", th: "LINE", en: "LINE" },
  { value: "instagram", th: "Instagram", en: "Instagram" },
  { value: "tiktok", th: "TikTok", en: "TikTok" },
  { value: "whatsapp", th: "WhatsApp", en: "WhatsApp" },
  { value: "messenger", th: "Messenger", en: "Messenger" },
  { value: "wechat", th: "WeChat", en: "WeChat" },
  { value: "telegram", th: "Telegram", en: "Telegram" },
  { value: "kakaotalk", th: "KakaoTalk", en: "KakaoTalk" },
  { value: "phone", th: "เบอร์โทร (iMessage / SMS)", en: "Phone (iMessage / SMS)" },
  { value: "other", th: "อื่น ๆ", en: "Other" },
];

/** Active, or a suspension that has already run out. */
function isActive(a: { status: string; suspendedUntil: Date | null }, now = new Date()): boolean {
  if (a.status === "active") return true;
  return a.status === "suspended" && !!a.suspendedUntil && a.suspendedUntil.getTime() <= now.getTime();
}

function eventTitle(e: { title: string; titleEn: string | null }, lang: "th" | "en"): string {
  return lang === "en" ? e.titleEn || e.title : e.title;
}

function withNotice(path: string, notice: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}notice=${notice}`;
}

function displayName(p: Pick<Profile, "nickname" | "pronouns" | "showPronouns">): string {
  return p.showPronouns && p.pronouns ? `${p.nickname} (${p.pronouns})` : p.nickname;
}

type NotifRow = typeof notifications.$inferSelect;
/**
 * Today / Today's summary / Yesterday / Earlier, newest first; same title and link on the same day folds
 * into one row. Today's non-urgent items (src/domain/digest.ts) sit under "สรุปวันนี้ / Today's summary".
 */
function groupNotifications(rows: NotifRow[], lang: "th" | "en") {
  const dayKey = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000));
  const groups: { key: string; th: string; en: string; items: { n: NotifRow; count: number }[] }[] = [];
  for (const n of rows) {
    const d = dayKey(n.createdAt);
    const key = d === today ? (isDigest(n.kind, n.link) ? "summary" : "today") : d === yesterday ? "yesterday" : "earlier";
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, ...NOTIF_GROUPS[key], items: [] };
      groups.push(g);
    }
    const title = lang === "en" ? n.titleEn : n.titleTh;
    const same = g.items.find((x) => (lang === "en" ? x.n.titleEn : x.n.titleTh) === title && x.n.link === n.link && dayKey(x.n.createdAt) === d);
    if (same) {
      same.count++;
      if (!n.readAt) same.n = { ...same.n, readAt: null };
    } else g.items.push({ n, count: 1 });
  }
  return groups.sort((a, b) => Object.keys(NOTIF_GROUPS).indexOf(a.key) - Object.keys(NOTIF_GROUPS).indexOf(b.key));
}
const NOTIF_GROUPS: Record<string, { th: string; en: string }> = {
  today: { th: "วันนี้", en: "Today" },
  summary: { th: "สรุปวันนี้", en: "Today's summary" },
  yesterday: { th: "เมื่อวาน", en: "Yesterday" },
  earlier: { th: "ก่อนหน้านี้", en: "Earlier" },
};

/** Ids of everyone I blocked or who blocked me. */
async function blockedSet(db: Db, me: string): Promise<Set<string>> {
  const rows = await db
    .select({ blocker: blocks.blocker, blocked: blocks.blocked })
    .from(blocks)
    .where(or(eq(blocks.blocker, me), eq(blocks.blocked, me)))
    .limit(2000);
  return new Set(rows.map((r) => (r.blocker === me ? r.blocked : r.blocker)));
}

// ------------------------------------------- badges and Bangkok Types --
//
// Shared with the live page in events/live.tsx. Both are DISPLAY ONLY: they never
// order, filter or hide anyone (PRD §3.2 badge is opt-in; Bangkok Types are
// conversation starters, never a ranking).

/** The opt-in "Bangkok Registered Resident" badge: verified AND opted in. */
export function showsResidentBadge(a: { bkkRegistered: string }, p: { showResidentBadge: boolean }): boolean {
  return a.bkkRegistered === "verified" && p.showResidentBadge === true;
}

export function ResidentTag(props: { v: View }) {
  return <Tag tone="ok">{props.v.t("🏙️ ผู้มีทะเบียนบ้านกรุงเทพฯ", "🏙️ Bangkok resident")}</Tag>;
}

export type VibeInfo = { archetype: ArchetypeKey; modifier: string | null; visible: boolean };

/** Quiz results for these accounts, in ONE query. Unknown archetype keys are dropped. */
export async function vibesFor(db: Db, ids: string[]): Promise<Map<string, VibeInfo>> {
  const out = new Map<string, VibeInfo>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return out;
  const rows = await db
    .select({ accountId: vibes.accountId, archetype: vibes.archetype, modifier: vibes.modifier, visible: vibes.visible, vector: vibes.vector })
    .from(vibes)
    .where(inArray(vibes.accountId, unique))
    .limit(unique.length);
  for (const r of rows) {
    const { archetype, modifier } = normalizeType(r);
    out.set(r.accountId, { archetype, modifier, visible: r.visible });
  }
  return out;
}

/**
 * Their Bangkok Type (only if THEY made it visible) and, when I have taken
 * the quiz, a light conversation spark: the match label between our types
 * (if any) and their type's conversation starter.
 */
export function TypeSpark(props: { v: View; theirs: VibeInfo | undefined; mine: VibeInfo | undefined }) {
  const { t, lang } = props.v;
  const theirs = props.theirs;
  if (!theirs || !theirs.visible) return null;
  const a = ARCHETYPES[theirs.archetype];
  const name = typeName(theirs.archetype, theirs.modifier)[lang];
  const ml = props.mine ? matchLabel(props.mine.archetype, theirs.archetype) : null;
  const m = ml ? MATCH_LABELS[ml] : null;
  return (
    <span class="type-spark">
      {" "}
      <Tag tone="muted">
        {a.emoji} {name}
      </Tag>
      {props.mine ? (
        <small class="muted" style="display:block">
          {m ? `${m.emoji} ${m.name[lang]}: ${m.copy[lang]} ` : ""}
          💬 {t("ชวนคุย: ", "Conversation spark: ")}
          {a.starter[lang]}
        </small>
      ) : null}
    </span>
  );
}

// ----------------------------------------------------------- People I Met --

type Candidate = { accountId: string; profile: Profile; resident: boolean };

type PeopleState =
  | { kind: "missing" }
  | { kind: "not_attended"; event: Event }
  | { kind: "before" | "closed"; event: Event }
  | { kind: "open"; event: Event; candidates: Candidate[] };

/**
 * Everything People I Met depends on, shared by GET and POST: the event,
 * my check-in, the 72h window and the candidate list (same group, checked
 * in, active, not blocked either way, inside each other's age preference).
 */
async function loadPeople(c: Ctx, eventId: string): Promise<PeopleState> {
  const db = getDb(c.env);
  const me = c.var.user!;
  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  // A private talk has no People I Met (D52).
  if (!event || event.talkMode) return { kind: "missing" };
  const [mine] = await db
    .select({ checkedInAt: registrations.checkedInAt, groupNo: registrations.groupNo })
    .from(registrations)
    .where(and(eq(registrations.eventId, eventId), eq(registrations.accountId, me.account.id)))
    .limit(1);
  if (!mine?.checkedInAt) return { kind: "not_attended", event };
  const window = peopleWindow(event.endsAt);
  if (window !== "open") return { kind: window, event };

  // Groups published → my table only. Never published → the whole event is one group.
  if (event.groupsPublishedAt && mine.groupNo === null) return { kind: "open", event, candidates: [] };
  const conds = [
    eq(registrations.eventId, eventId),
    isNotNull(registrations.checkedInAt),
    ne(registrations.accountId, me.account.id),
  ];
  if (event.groupsPublishedAt && mine.groupNo !== null) conds.push(eq(registrations.groupNo, mine.groupNo));

  const [rows, blocked] = await Promise.all([
    db
      .select({ account: accounts, profile: profiles })
      .from(registrations)
      .innerJoin(accounts, eq(accounts.id, registrations.accountId))
      .innerJoin(profiles, eq(profiles.accountId, registrations.accountId))
      .where(and(...conds))
      .orderBy(profiles.nickname)
      .limit(300),
    blockedSet(db, me.account.id),
  ]);
  const myProfile = me.profile!;
  const myAge = { age: ageOn(myProfile.birthDate), ageMin: myProfile.ageMin, ageMax: myProfile.ageMax };
  const candidates = rows
    .filter((r) => isActive(r.account))
    .filter((r) => !blocked.has(r.account.id))
    .filter((r) => mutualAgeOk(myAge, { age: ageOn(r.profile.birthDate), ageMin: r.profile.ageMin, ageMax: r.profile.ageMax }))
    .map((r) => ({ accountId: r.account.id, profile: r.profile, resident: showsResidentBadge(r.account, r.profile) }));
  return { kind: "open", event, candidates };
}

function PeopleClosed(props: { v: View; state: Exclude<PeopleState, { kind: "open" } | { kind: "missing" }> }) {
  const { t, lang } = props.v;
  const s = props.state;
  return (
    <>
      <h1>{t("คนที่เจอ", "People I met")}</h1>
      <p class="muted">{eventTitle(s.event, lang)}</p>
      <Card>
        {s.kind === "not_attended" ? (
          <p>{t("ดูรายชื่อนี้ได้เฉพาะคนที่เช็กอินที่งานนี้", "Only people who checked in at this event can see this list.")}</p>
        ) : s.kind === "before" ? (
          <p>
            {t("รายชื่อจะเปิดหลังกิจกรรมจบ และเปิดไว้ 72 ชั่วโมง", "This opens after the event ends, and stays open for 72 hours.")}{" "}
            ({fmtDate(s.event.endsAt, lang)})
          </p>
        ) : (
          <p>
            {t(
              "รายชื่อนี้ปิดแล้ว (เปิดให้เลือกแค่ 72 ชั่วโมงหลังจบงาน) ตัวเลือกที่ไม่ได้เลือกกันทั้งสองฝ่ายหายไปเงียบ ๆ แล้ว",
              "This closed 72 hours after the event. Choices that weren't mutual have quietly expired.",
            )}
          </p>
        )}
      </Card>
      <LinkButton href="/connections" kind="ghost">
        {t("ไปที่คนรู้จักของฉัน", "Go to my people")}
      </LinkButton>
    </>
  );
}

function PeopleForm(props: { v: View; event: Event; candidates: Candidate[]; mine: Map<string, Choice>; romance: boolean; vibes: Map<string, VibeInfo>; myVibe?: VibeInfo }) {
  const { t, lang } = props.v;
  const allowed = new Set<string>(allowedChoices(props.romance));
  const options = CHOICE_LABELS.filter((o) => allowed.has(o.value));
  return (
    <>
      <h1>{t("คนที่เจอ", "People I met")}</h1>
      <p class="muted">
        {eventTitle(props.event, lang)} · {fmtDay(props.event.startsAt, lang)}
      </p>
      <Notice kind="info">
        {t(
          "ตัวเลือกของคุณเป็นความลับ จะได้รู้จักกันต่อเมื่อเลือกกันทั้งสองฝ่ายเท่านั้น และจะไม่มีใครรู้ว่าคุณไม่ได้เลือกเขา",
          "Your choices are private. Only mutual choices create a connection. Nobody is ever told you didn't choose them.",
        )}
      </Notice>
      {props.candidates.length === 0 ? (
        <Empty>{t("ยังไม่มีใครให้เลือกในกลุ่มของคุณ", "There's nobody to show from your group.")}</Empty>
      ) : (
        <form method="post">
          {props.candidates.map((p) => (
            <Card>
              {p.resident || props.vibes.get(p.accountId)?.visible ? (
                <p class="person-extras">
                  {p.resident ? <ResidentTag v={props.v} /> : null}
                  <TypeSpark v={props.v} theirs={props.vibes.get(p.accountId)} mine={props.myVibe} />
                </p>
              ) : null}
              <Choices
                legend={displayName(p.profile)}
                name={`choice_${p.accountId}`}
                options={options}
                values={[props.mine.get(p.accountId) ?? "none"]}
                lang={lang}
                type="radio"
              />
              <p style="margin:12px 0 0">
                <a href={`/people/${p.accountId}`}>👀 {t(`ดูโปรไฟล์ของ ${p.profile.nickname}`, `See ${p.profile.nickname}'s profile`)}</a>
              </p>
            </Card>
          ))}
          <p class="muted">
            {t(
              "เปลี่ยนใจได้จนกว่ารายชื่อจะปิด คือ 72 ชั่วโมงหลังจบงาน",
              "You can change your mind until the list closes, 72 hours after the event.",
            )}
          </p>
          <Button>{t("บันทึกตัวเลือก", "Save my choices")}</Button>
        </form>
      )}
    </>
  );
}

peopleRoutes.get("/events/:id/people", requireMember, async (c) => {
  const v = view(c);
  const state = await loadPeople(c, c.req.param("id"));
  if (state.kind === "missing") return page(c, { title: "Not found", status: 404 }, <Empty>{v.t("ไม่พบกิจกรรม", "Event not found")}</Empty>);
  if (state.kind !== "open") {
    return page(c, { title: v.t("คนที่เจอ", "People I met"), tab: "mine", status: state.kind === "not_attended" ? 403 : 200 }, <PeopleClosed v={v} state={state} />);
  }
  const me = c.var.user!;
  const ids = state.candidates.map((x) => x.accountId);
  const mine = new Map<string, Choice>();
  if (ids.length) {
    const rows = await getDb(c.env)
      .select({ to: connectionChoices.toAccount, choice: connectionChoices.choice })
      .from(connectionChoices)
      .where(and(eq(connectionChoices.eventId, state.event.id), eq(connectionChoices.fromAccount, me.account.id), inArray(connectionChoices.toAccount, ids)))
      .limit(300);
    for (const r of rows) mine.set(r.to, r.choice);
  }
  const romance = romanceEligible(me.profile!);
  // A stored "romance" from when the user was eligible is shown as "friend" now.
  if (!romance) for (const [k, ch] of mine) if (ch === "romance") mine.set(k, "friend");
  const vibeMap = await vibesFor(getDb(c.env), [...ids, me.account.id]);
  return page(
    c,
    { title: v.t("คนที่เจอ", "People I met"), tab: "mine" },
    <PeopleForm v={v} event={state.event} candidates={state.candidates} mine={mine} romance={romance} vibes={vibeMap} myVibe={vibeMap.get(me.account.id)} />,
  );
});

peopleRoutes.post("/events/:id/people", requireMember, async (c) => {
  const v = view(c);
  const eventId = c.req.param("id");
  const state = await loadPeople(c, eventId);
  if (state.kind === "missing") return c.text("Not found", 404);
  if (state.kind !== "open") return page(c, { title: v.t("คนที่เจอ", "People I met"), tab: "mine", status: 403 }, <PeopleClosed v={v} state={state} />);

  const me = c.var.user!;
  const myId = me.account.id;
  const myProfile = me.profile!;
  const iAmEligible = romanceEligible(myProfile);
  const byId = new Map(state.candidates.map((x) => [x.accountId, x.profile]));
  const body = await c.req.parseBody();

  const picks = new Map<string, Choice>();
  for (const [key, raw] of Object.entries(body)) {
    if (!key.startsWith("choice_")) continue;
    const target = key.slice("choice_".length);
    if (!byId.has(target)) continue; // not in my list: ignored, never an error that could leak anything
    let choice = str(raw);
    if (!CHOICE_SET.has(choice)) continue;
    if (choice === "romance" && !iAmEligible) choice = "friend";
    picks.set(target, choice as Choice);
  }
  if (picks.size === 0) return c.redirect(`/events/${eventId}/people?notice=choices_saved`);

  const db = getDb(c.env);
  const targets = [...picks.keys()];
  // After "Back to friends" at this table, People I Met can't re-open romance with that person (C4 panel).
  const ended = await endedWith(db, myId, targets, eventId);
  for (const other of ended) if (picks.get(other) === "romance") picks.set(other, "friend");
  const [theirs, existing] = await Promise.all([
    db
      .select({ from: connectionChoices.fromAccount, choice: connectionChoices.choice })
      .from(connectionChoices)
      .where(and(eq(connectionChoices.eventId, eventId), eq(connectionChoices.toAccount, myId), inArray(connectionChoices.fromAccount, targets)))
      .limit(300),
    db
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.eventId, eventId),
          or(and(eq(connections.aAccount, myId), inArray(connections.bAccount, targets)), and(eq(connections.bAccount, myId), inArray(connections.aAccount, targets))),
        ),
      )
      .limit(300),
  ]);
  const theirChoice = new Map(theirs.map((r) => [r.from, r.choice]));
  const existingByOther = new Map(existing.map((x) => [x.aAccount === myId ? x.bAccount : x.aAccount, x]));

  const writes: { toSQL(): { sql: string; params: unknown[] } }[] = [
    db
      .insert(connectionChoices)
      .values(targets.map((to) => ({ id: newId(), eventId, fromAccount: myId, toAccount: to, choice: picks.get(to)! })))
      .onConflictDoUpdate({
        target: [connectionChoices.eventId, connectionChoices.fromAccount, connectionChoices.toAccount],
        set: { choice: sql`excluded.choice` },
      }),
  ];

  const upserts: { id: string; aAccount: string; bAccount: string; level: Level; eventId: string }[] = [];
  const removeIds: string[] = [];
  const notifyIds: string[] = [];
  for (const other of targets) {
    const theirs = theirChoice.get(other);
    if (!theirs) continue; // they haven't chosen yet: nothing to resolve, nothing to reveal
    const them = byId.get(other)!;
    const romanceOk = iAmEligible && romanceEligible(them) && romanceCompatible(myProfile, them);
    const level = resolveMutual(picks.get(other)!, theirs, romanceOk);
    const prev = existingByOther.get(other);
    if (level === null) {
      if (prev && !prev.removedAt) removeIds.push(prev.id);
      continue;
    }
    if (prev && !prev.removedAt && prev.level === level) continue; // unchanged
    const [a, b] = myId < other ? [myId, other] : [other, myId];
    upserts.push({ id: newId(), aAccount: a, bAccount: b, level, eventId });
    if (!prev || prev.removedAt) notifyIds.push(myId, other);
  }
  if (upserts.length) {
    writes.push(
      db
        .insert(connections)
        .values(upserts)
        .onConflictDoUpdate({
          target: [connections.aAccount, connections.bAccount, connections.eventId],
          set: { level: sql`excluded.level`, removedAt: null },
        }),
    );
  }
  if (removeIds.length) {
    writes.push(
      db.update(connections).set({ removedAt: new Date() }).where(inArray(connections.id, removeIds)),
      // Contact shares last only as long as the connection (privacy notice): they go with it.
      db.delete(contactShares).where(inArray(contactShares.connectionId, removeIds)),
    );
  }
  if (notifyIds.length) {
    const ev = state.event;
    // Never mentions the level: a romance connection is only visible on /connections.
    writes.push(
      db.insert(notifications).values(
        [...new Set(notifyIds)].map((accountId) => ({
          id: newId(),
          accountId,
          kind: "connection",
          titleTh: `คุณมีคนรู้จักใหม่จาก ${ev.title}`,
          titleEn: `You have a new connection from ${ev.titleEn || ev.title}`,
          link: "/connections",
        })),
      ),
    );
  }
  await batch(c.env, writes);
  // A new mutual connection gets its moment (the spark); anything else just says saved.
  return c.redirect(`/events/${eventId}/people?notice=${notifyIds.length ? "connected" : "choices_saved"}`);
});

// ----------------------------------------------------- My Bangkok circle --

type CircleRow = {
  id: string;
  level: string;
  createdAt: Date;
  /** name: nickname with pronouns, for headings; nickname: bare, for use inside sentences. */
  other: { id: string; name: string; nickname: string; resident: boolean; vibe?: VibeInfo; photo?: boolean };
  event: { id: string; title: string; startsAt: Date } | null;
  /** A Bangkok Buddy connection rather than one from an event. */
  buddy?: boolean;
  mine: { method: string; value: string } | null;
  theirs: { method: string; value: string } | null;
  /** Shared contacts and met twice or more: they don't need us anymore. */
  graduated?: boolean;
  /** The friendship milestone landed on this very page load: the one moment that gets confetti. */
  celebrate?: boolean;
  /** I've already sent this person a thank-you note for this connection. */
  iThanked?: boolean;
  /** Other events where we chose each other: one card per person, not per meeting. */
  alsoMet?: { id: string; title: string; startsAt: Date }[];
  /** How many times we've met (events where we chose each other). */
  meets?: number;
  /** Their social links, only when they let their people see them (services/profile-links.ts). */
  links?: ShownLink[];
};

/**
 * One card per person (owner: no repeats). Rows come newest first, so the
 * newest meeting leads; earlier ones are listed under "Also met at", and a
 * contact shared at any of them carries over.
 */
function onePerPerson(rows: CircleRow[]): CircleRow[] {
  const byPerson = new Map<string, CircleRow>();
  for (const r of rows) {
    const first = byPerson.get(r.other.id);
    if (!first) {
      byPerson.set(r.other.id, { ...r, alsoMet: [] });
      continue;
    }
    if (r.event) first.alsoMet!.push(r.event);
    first.mine ??= r.mine;
    first.theirs ??= r.theirs;
    first.graduated ||= r.graduated;
    first.celebrate ||= r.celebrate;
  }
  for (const r of byPerson.values()) r.meets = 1 + (r.alsoMet?.length ?? 0);
  return [...byPerson.values()];
}

async function loadCircle(c: Ctx): Promise<{ rows: CircleRow[]; myVibe?: VibeInfo }> {
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const lang = c.var.lang;
  const rows = await db
    .select()
    .from(connections)
    .where(and(or(eq(connections.aAccount, me), eq(connections.bAccount, me)), isNull(connections.removedAt)))
    .orderBy(desc(connections.createdAt))
    .limit(200);
  if (rows.length === 0) return { rows: [] };
  const otherIds = [...new Set(rows.map((r) => (r.aAccount === me ? r.bAccount : r.aAccount)))];
  const eventIds = [...new Set(rows.map((r) => r.eventId))];
  const [people, evs, shares, vibeMap, links] = await Promise.all([
    db
      .select({
        id: accounts.id,
        status: accounts.status,
        suspendedUntil: accounts.suspendedUntil,
        bkkRegistered: accounts.bkkRegistered,
        nickname: profiles.nickname,
        pronouns: profiles.pronouns,
        showPronouns: profiles.showPronouns,
        showResidentBadge: profiles.showResidentBadge,
        photoKey: profiles.photoKey,
      })
      .from(accounts)
      .innerJoin(profiles, eq(profiles.accountId, accounts.id))
      .where(inArray(accounts.id, otherIds))
      .limit(200),
    db.select({ id: events.id, title: events.title, titleEn: events.titleEn, startsAt: events.startsAt }).from(events).where(inArray(events.id, eventIds)).limit(200),
    db
      .select()
      .from(contactShares)
      .where(inArray(contactShares.connectionId, rows.map((r) => r.id)))
      .limit(400),
    vibesFor(db, [...otherIds, me]),
    visibleLinks(db, me, otherIds),
  ]);
  const personById = new Map(people.map((p) => [p.id, p]));
  const eventById = new Map(evs.map((e) => [e.id, e]));
  const out: CircleRow[] = [];
  for (const r of rows) {
    const otherId = r.aAccount === me ? r.bAccount : r.aAccount;
    const p = personById.get(otherId);
    if (!p || p.status === "banned" || p.status === "deactivated") continue;
    const e = eventById.get(r.eventId);
    const mine = shares.find((s) => s.connectionId === r.id && s.accountId === me);
    const theirs = shares.find((s) => s.connectionId === r.id && s.accountId === otherId);
    out.push({
      id: r.id,
      level: r.level,
      createdAt: r.createdAt,
      other: { id: otherId, name: displayName(p), nickname: p.nickname, resident: showsResidentBadge(p, p), vibe: vibeMap.get(otherId), photo: !!p.photoKey },
      event: e ? { id: e.id, title: eventTitle(e, lang), startsAt: e.startsAt } : null,
      buddy: r.eventId.startsWith("buddy:"),
      mine: mine ? { method: mine.method, value: mine.value } : null,
      theirs: theirs ? { method: theirs.method, value: theirs.value } : null,
      links: links.get(otherId),
    });
  }
  await markGraduations(c, out);
  return { rows: onePerPerson(out), myVibe: vibeMap.get(me) };
}

/** Meets with someone: shared events (one connection row each) plus buddy quests finished together. */
async function markGraduations(c: Ctx, rows: CircleRow[]) {
  if (!rows.length) return;
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const ids = rows.map((r) => r.id);
  const [grads, sent, matches] = await Promise.all([
    db.select({ connectionId: graduations.connectionId }).from(graduations).where(inArray(graduations.connectionId, ids)).limit(ids.length),
    db.select({ context: thanks.context }).from(thanks).where(and(eq(thanks.fromAccount, me), inArray(thanks.context, ids.map((x) => `conn:${x}`)))).limit(ids.length),
    db.select({ id: buddyMatches.id, a: buddyMatches.aAccount, b: buddyMatches.bAccount }).from(buddyMatches).where(or(eq(buddyMatches.aAccount, me), eq(buddyMatches.bAccount, me))).limit(50),
  ]);
  const done = new Set(grads.map((g) => g.connectionId));
  const thanked = new Set(sent.map((x) => x.context.slice(5)));
  const quests = matches.length
    ? await db.select({ matchId: buddyQuests.matchId, a: buddyQuests.aDoneAt, b: buddyQuests.bDoneAt }).from(buddyQuests).where(inArray(buddyQuests.matchId, matches.map((m) => m.id))).limit(500)
    : [];
  const questsWith = (other: string) => {
    const mids = matches.filter((m) => m.a === other || m.b === other).map((m) => m.id);
    return quests.filter((q) => mids.includes(q.matchId) && q.a && q.b).length;
  };
  const now = new Date();
  for (const r of rows) {
    r.iThanked = thanked.has(r.id);
    if (done.has(r.id)) {
      r.graduated = true;
      continue;
    }
    if (!r.mine || !r.theirs) continue;
    const meets = rows.filter((x) => x.other.id === r.other.id && !x.buddy).length + questsWith(r.other.id);
    if (meets < 2) continue;
    // Only the first row for this pair graduates, once.
    if (rows.find((x) => x.other.id === r.other.id && x.mine && x.theirs)?.id !== r.id) continue;
    const made = await db.insert(graduations).values({ id: newId(), connectionId: r.id }).onConflictDoNothing().returning({ id: graduations.id });
    r.graduated = true;
    if (made.length) {
      r.celebrate = true;
      const later = new Date(now.getTime() + 30 * 86_400_000);
      // A friendship to celebrate, with the other person named (owner: the old "you don't need us" read like goodbye).
      const myName = c.var.user!.profile?.nickname ?? "";
      for (const [who, name] of [[me, r.other.nickname], [r.other.id, myName]] as const) {
        await notify(db, who, "graduated", `🎉 คุณกับ ${name} เจอกันมา ${meets} ครั้งแล้ว นี่แหละมิตรภาพ`, `🎉 You and ${name} have met ${meets} times. That's a friendship.`, "/connections?notice=friendship");
        await db.insert(notifications).values({ id: newId(), accountId: who, kind: "still_in_touch", titleTh: "ยังติดต่อกันอยู่ไหม? แตะเพื่อบอกเรา", titleEn: "Still in touch? Tap to tell us", link: `/connections/${r.id}/still`, createdAt: later });
      }
    }
  }
}

type CircleExtras = {
  buddy: { state: string; nickname: string } | null;
  hangouts: { id: string; title: string; startsAt: Date; district: string; host: string; href: string }[];
  ideas: { emoji: string; name: string; why: string; district: string; type: string }[];
  tables: { id: string; name: string; district: string; hosting: boolean }[];
};

/**
 * The top of the circle page: your Bangkok Buddy, private hangouts your circle
 * sent you, a button to host one, and group hangout ideas from the types in
 * your circle (only types people chose to show).
 */
async function loadCircleExtras(c: Ctx, rows: CircleRow[], myVibe: VibeInfo | undefined): Promise<CircleExtras> {
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const lang = view(c).lang;
  const now = new Date();
  const [matches, shares, tables] = await Promise.all([
    db
      .select()
      .from(buddyMatches)
      .where(and(ne(buddyMatches.state, "ended"), or(eq(buddyMatches.aAccount, me), eq(buddyMatches.bAccount, me))))
      .orderBy(desc(buddyMatches.createdAt))
      .limit(1),
    db.select({ eventId: circleShares.eventId, from: circleShares.fromAccount }).from(circleShares).where(eq(circleShares.toAccount, me)).orderBy(desc(circleShares.createdAt)).limit(50),
    myTables(db, me),
  ]);
  const m = matches[0];
  const buddyId = m ? (m.aAccount === me ? m.bAccount : m.aAccount) : null;
  const eventIds = shares.map((x) => x.eventId);
  const [evs, names] = await Promise.all([
    eventIds.length ? db.select().from(events).where(inArray(events.id, eventIds)).limit(eventIds.length) : Promise.resolve([] as Event[]),
    db
      .select({ id: profiles.accountId, nickname: profiles.nickname })
      .from(profiles)
      .where(inArray(profiles.accountId, [...new Set([...shares.map((x) => x.from), ...(buddyId ? [buddyId] : [])])].concat(["-"])))
      .limit(100),
  ]);
  const nick = (id: string) => names.find((n) => n.id === id)?.nickname ?? "";
  const hangouts = evs
    .filter((e) => e.status === "published" && e.endsAt > now && e.privateToken)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((e) => ({
      id: e.id,
      title: eventTitle(e, lang),
      startsAt: e.startsAt,
      district: e.district,
      host: nick(shares.find((x) => x.eventId === e.id)!.from),
      href: `/events/${e.id}?t=${encodeURIComponent(e.privateToken!)}`,
    }));
  // Ideas: hangouts of the types most common in my circle (and my own).
  const counts = new Map<ArchetypeKey, number>();
  for (const v of [...rows.map((r) => r.other.vibe), myVibe]) if (v?.visible || v === myVibe) if (v) counts.set(v.archetype, (counts.get(v.archetype) ?? 0) + 1);
  const ideas: CircleExtras["ideas"] = [];
  for (const [type] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    for (const h of ARCHETYPES[type].hangouts) {
      if (ideas.length >= 3) break;
      if (ideas.some((i) => i.name === h.name.en)) continue;
      ideas.push({ emoji: h.emoji, name: lang === "en" ? h.name.en : h.name.th, why: lang === "en" ? h.why.en : h.why.th, district: h.district, type: lang === "en" ? ARCHETYPES[type].name.en : ARCHETYPES[type].name.th });
      break;
    }
  }
  return {
    buddy: m && buddyId ? { state: m.state, nickname: nick(buddyId) } : null,
    hangouts,
    ideas,
    tables: tables.map((x) => ({ id: x.id, name: x.name, district: x.district, hosting: x.hosting })),
  };
}

function CircleTop(props: { v: View; extras: CircleExtras }) {
  const { t } = props.v;
  const { buddy, tables } = props.extras;
  // Only circle heads, verified partners and admins host; everyone else can ask to lead a circle.
  const host = !!props.v.user && canHost(props.v.user.account, true);
  const hostsTable = tables.some((x) => x.hosting);
  return (
    <nav class="circle-chips" aria-label={t("ทางลัด", "Shortcuts")}>
      <ChatsLink t={t} n={props.v.user?.chatUnread ?? 0} />
      <a href="/buddy" class="circle-buddy">
        🤝{" "}
        {buddy
          ? buddy.state === "active"
            ? t(`สำรวจกรุงเทพฯ กับ ${buddy.nickname}`, `Exploring with ${buddy.nickname}`)
            : t(`บัดดี้คนใหม่: ${buddy.nickname}`, `New buddy: ${buddy.nickname}`)
          : t("หาบัดดี้", "Get a buddy")}
      </a>
      {host && hostsTable ? (
        <a href="/host/new?table=1">＋ {t("ชวนโต๊ะประจำไปแฮงเอาต์", "Plan a hangout for your Regular Table")}</a>
      ) : host ? (
        <a href="/host/new?visibility=private">＋ {t("ชวนคนรู้จักไปด้วยกัน", "Plan something with your people")}</a>
      ) : (
        <a href="/circles/lead">👑 {t("เป็นเจ้าภาพโต๊ะประจำ", "Host a Regular Table")}</a>
      )}
      <a href="/events">🗓️ {t("กิจกรรมกลุ่ม", "Browse group events")}</a>
    </nav>
  );
}

/** Tables, hangouts and ideas, under the member's own people. With none of them, one line and one next step. */
function CircleGroups(props: { v: View; extras: CircleExtras }) {
  const { t, lang } = props.v;
  const { hangouts, ideas, tables } = props.extras;
  const host = !!props.v.user && canHost(props.v.user.account, true);
  if (!tables.length && !hangouts.length && !ideas.length)
    return (
      <Card class="circle-none">
        <p class="muted">
          {t(
            "ยังไม่มีโต๊ะประจำหรือนัดจากคนรู้จัก ไปแฮงเอาต์กับเจ้าภาพโต๊ะสักครั้ง แล้วเข้าร่วมโต๊ะได้จากหน้ากิจกรรมนั้น",
            "No Regular Tables or plans from your people yet. Go to a hangout with a Table Host, then join their table from that event's page.",
          )}
        </p>
        <a href="/tables">🪑 {t("ดูโต๊ะประจำ", "See Regular Tables")}</a>
      </Card>
    );
  return (
    <>
      <h2 class="spread">
        <span>🪑 {t("โต๊ะประจำของฉัน", "My Regular Tables")}</span>
        <a href="/tables" class="muted">{t("ดูทั้งหมด", "See all")}</a>
      </h2>
      {tables.length ? (
        <div class="rail2">
          {tables.map((x) => (
            <a href={`/tables/${x.id}`} class="place-card">
              <QuestionArt art={artFor(x.name, "👥", { en: label(DISTRICTS, x.district, "en"), th: label(DISTRICTS, x.district, "th") })} lang={lang} />
              <div>
                <strong>{x.name}</strong>
                <small>{x.hosting ? t("👑 คุณเป็นเจ้าภาพโต๊ะ", "👑 You're the Table Host") : label(DISTRICTS, x.district, lang)}</small>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <p class="muted">{t("ยังไม่ได้นั่งโต๊ะประจำไหน ไปแฮงเอาต์กับเจ้าภาพโต๊ะสักครั้ง แล้วเข้าร่วมได้จากหน้ากิจกรรมนั้น", "No Regular Tables yet. Go to a hangout with a Table Host, then join from that event's page.")}</p>
      )}
      <h2>👥 {t("นัดจากคนรู้จัก", "Plans from your people")}</h2>
      {hangouts.length ? (
        <div class="rail2">
          {hangouts.map((h) => (
            <a href={h.href} class="place-card">
              <QuestionArt art={artFor(h.title, "🔒", { en: label(DISTRICTS, h.district, "en"), th: label(DISTRICTS, h.district, "th") })} lang={lang} />
              <div>
                <strong>{h.title}</strong>
                <small>
                  {fmtDay(h.startsAt, lang)} · {t(`ชวนโดย ${h.host}`, `from ${h.host}`)}
                </small>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <p class="muted">{t("ยังไม่มีนัดจากคนรู้จักของคุณ", "No plans from your people yet.")}</p>
      )}
      {ideas.length ? (
        <>
          <h3>💡 {t("ไอเดียจากไทป์ของคนรู้จักคุณ", "Ideas from your people's types")}</h3>
          <div class="rail2">
            {ideas.map((i) => (
              <a href={host ? `/host/new?visibility=private&district=${encodeURIComponent(i.district)}&title=${encodeURIComponent(i.name)}` : "/circles/lead"} class="place-card">
                <QuestionArt art={artFor(i.name, i.emoji, { en: label(DISTRICTS, i.district, "en"), th: label(DISTRICTS, i.district, "th") })} lang={lang} />
                <div>
                  <strong>{i.name}</strong>
                  <small>{i.type}</small>
                </div>
              </a>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

/**
 * One person on My people (finalize review B1 + C2), as a row of the grouped list: avatar, name, one "last met"
 * line, Chat, and one ⋯ that opens the Sheet with everything else. The
 * conversation spark and the full meeting history live on their profile.
 */
function PersonCard(props: { v: View; r: CircleRow; error?: string }) {
  const { t, lang } = props.v;
  const { r } = props;
  const method = (m: string) => label(CONTACT_METHODS, m, lang);
  const times = Math.max(2, r.meets ?? 2);
  const met = r.event
    ? t(`เจอล่าสุดที่ ${r.event.title} · ${fmtDay(r.event.startsAt, lang)}`, `Last met at ${r.event.title} · ${fmtDay(r.event.startsAt, lang)}`)
    : r.buddy
      ? t("🤝 บัดดี้กรุงเทพฯ", "🤝 Bangkok Buddy")
      : "";
  const vibe = r.other.vibe?.visible ? ARCHETYPES[r.other.vibe.archetype] : null;
  return (
    <li class="person-row">
      <div class="pc-row">
        {r.other.photo ? (
          <img class="pc-av" src={`/people/${r.other.id}/photo/main`} alt="" width={48} height={48} loading="lazy" />
        ) : (
          <AvatarStack items={[{ label: r.other.nickname, emoji: vibe?.emoji, seed: r.other.id }]} size={48} />
        )}
        <div class="pc-main">
          <h2 class="pc-name">
            <a href={`/people/${r.other.id}`}>{r.other.name}</a>
          </h2>
          <p class="pc-met" data-celebrate={r.celebrate ? "" : undefined}>
            {/* The resident tag leads the line under the name, so the name keeps one line beside Chat and ⋯. */}
            {r.other.resident ? (
              <>
                <ResidentTag v={props.v} />{" "}
              </>
            ) : null}
            {r.graduated ? <>{t(`🎉 เจอกันมา ${times} ครั้ง`, `🎉 Met ${times} times`)} · </> : null}
            {met}
            {r.level === "romance" ? (
              <>
                {" · "}
                <Tag tone="love">เกี่ยวก้อย · Pinky</Tag>
              </>
            ) : null}
          </p>
        </div>
      </div>
      <div class="pc-acts">
        <a class="btn primary" href={`/chat/conn:${r.id}`}>💬 {t("แชต", "Chat")}</a>
        <Sheet
          t={t}
          title={r.other.nickname}
          trigger={<span aria-hidden="true">⋯</span>}
          triggerClass="sheet-more"
          triggerLabel={t(`ตัวเลือกเพิ่มเติมสำหรับ ${r.other.nickname}`, `More options for ${r.other.nickname}`)}
          open={!!props.error}
        >
          {/* Pinky slot: the quiet "เกี่ยวก้อย · Pinky" row for members with 💘 on goes first here, never on the card face. */}
          {r.graduated ? (
            <a class="sheet-item" href={`/chat/conn:${r.id}?say=${encodeURIComponent(t("สัปดาห์นี้ไปโต๊ะด้วยกันไหม 🙂", "Want to come to a table with me this week? 🙂"))}`}>
              <span aria-hidden="true">🍽️</span> {t(`ชวน ${r.other.nickname} ไปโต๊ะด้วยกัน`, `Invite ${r.other.nickname} to a table`)}
            </a>
          ) : null}
          {r.iThanked ? (
            <p class="muted">💌 {t("ส่งคำขอบคุณแล้ว", "Thank-you sent")}</p>
          ) : (
            <details class="how">
              <summary>💌 {t("ส่งคำขอบคุณสั้น ๆ", "Send a short thank-you")}</summary>
              <form method="post" action={`/connections/${r.id}/thanks`}>
                <p class="chips2 thanks-starters">
                  {THANK_STARTERS.map((x) => (
                    <button type="button" data-thanks={lang === "en" ? x.en : x.th}>
                      {lang === "en" ? x.en : x.th}
                    </button>
                  ))}
                </p>
                <Field label={t("ข้อความ (ส่วนตัว)", "Your note (private)")} name="body" maxlength={THANKS_MAX} required />
                <Button kind="ghost">{t("ส่งคำขอบคุณ", "Send thanks")}</Button>
              </form>
            </details>
          )}
          {r.mine || r.theirs ? (
            <p class="chips2">
              <span>{t("คุณแชร์", "You shared")}: {r.mine ? `${method(r.mine.method)} ${r.mine.value}` : t("ยังไม่แชร์", "nothing yet")}</span>
              <span>{t("เขาแชร์", "They shared")}: {r.theirs ? `${method(r.theirs.method)} ${r.theirs.value}` : t("ยังไม่แชร์", "nothing yet")}</span>
            </p>
          ) : null}
          {r.links?.length ? <ProfileLinksSheet t={t} links={r.links} /> : null}
          {props.error ? <Notice kind="error">{props.error}</Notice> : null}
          <details class="how" open={!!props.error}>
            <summary>📇 {r.mine ? t("อัปเดตช่องทางติดต่อ", "Update contact") : t("แชร์ช่องทางติดต่อ", "Share contact")}</summary>
            <form method="post" action={`/connections/${r.id}/share`}>
              <Select label={t("ช่องทาง", "Method")} name="method" options={CONTACT_METHODS} value={r.mine?.method ?? "line"} lang={lang} required />
              <Field
                label={t("ไอดี / ชื่อผู้ใช้", "ID / handle")}
                name="value"
                value={r.mine?.value}
                required
                maxlength={60}
                hint={t("ตัวอักษร ตัวเลข _ . - เท่านั้น", "Letters, numbers, _ . - only")}
              />
              <Button kind="ghost">{r.mine ? t("อัปเดตช่องทางติดต่อ", "Update contact") : t("แชร์ช่องทางติดต่อ", "Share contact")}</Button>
            </form>
          </details>
          <div class="sheet-sep" role="separator" />
          <a class="sheet-item" href={`/report?account=${r.other.id}${r.event ? `&event=${r.event.id}` : ""}`}>
            <span aria-hidden="true">🚩</span> {t("รายงาน", "Report")}
          </a>
          <form method="post" action={`/block/${r.other.id}`}>
            <input type="hidden" name="back" value="/connections" />
            <button class="sheet-item danger">
              <span aria-hidden="true">⛔</span> {t("บล็อก", "Block")}
            </button>
          </form>
          <form method="post" action={`/connections/${r.id}/remove`}>
            <button class="sheet-item">
              <span aria-hidden="true">👋</span> {t("ลบออกจากคนรู้จัก", "Remove connection")}
            </button>
          </form>
        </Sheet>
      </div>
    </li>
  );
}

/**
 * Unread chats first (owner card 5, 2026-10-17): only when there are some, up
 * to 3 rows of the Chats list's own row, then All chats. A finite list, nothing
 * animated, so the page doesn't pull for attention.
 */
export function NewMessages(props: { v: View; rows: ChatRowData[] }) {
  const { t } = props.v;
  const rows = props.rows.filter((r) => r.unread).slice(0, 3);
  if (!rows.length) return null;
  return (
    <section class="people-new" aria-labelledby="people-new-h">
      <h2 id="people-new-h" class="h3">{t("ข้อความใหม่", "New messages")}</h2>
      <ul class="glist chat-list">
        {rows.map((r) => (
          <ChatRow v={props.v} r={r} count />
        ))}
      </ul>
      <a class="people-new-all" href="/chat">
        {t("แชตทั้งหมด", "All chats")} <span aria-hidden="true">›</span>
      </a>
    </section>
  );
}

function Circle(props: { v: View; rows: CircleRow[]; myVibe?: VibeInfo; error?: { id: string; text: string }; extras?: CircleExtras; again?: SeeAgain | null; chats?: ChatRowData[] }) {
  const { t } = props.v;
  return (
    <>
      {props.extras ? null : (
        <p class="spread">
          <span />
          <ChatsLink t={t} n={props.v.user?.chatUnread ?? 0} />
        </p>
      )}
      <h1>{t("คนรู้จักในกรุงเทพฯ ของฉัน", "My people in Bangkok")}</h1>
      {props.chats ? <NewMessages v={props.v} rows={props.chats} /> : null}
      <script
        dangerouslySetInnerHTML={{
          __html: `document.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-thanks]");if(!b)return;var i=b.closest("form").querySelector("input[name=body]");if(i){i.value=b.dataset.thanks;i.focus()}})`,
        }}
      />
      <p class="muted">
        {t("คนที่เลือกกันและกัน บัดดี้ และนัดจากคนรู้จัก", "People you chose each other with, your buddy, and plans from your people.")}
      </p>
      {props.extras ? <CircleTop v={props.v} extras={props.extras} /> : null}
      {props.again ? <SeeAgainCard v={props.v} data={props.again} /> : null}
      {props.extras ? (
        <h2 class="people-h">
          🫂 {t("คนรู้จักของคุณ", "Your people")}{" "}
          {props.rows.length ? (
            <AvatarStack
              items={props.rows.slice(0, 6).map((r) => ({ label: r.other.name, emoji: r.other.vibe?.visible ? ARCHETYPES[r.other.vibe.archetype].emoji : undefined, seed: r.other.id }))}
              more={Math.max(0, props.rows.length - 6)}
              size={34}
            />
          ) : null}
        </h2>
      ) : null}
      {props.rows.length === 0 ? (
        <Card>
          <Empty>
            {t(
              "ยังไม่มีคนรู้จัก ลองไปกิจกรรมสักงาน แล้วเลือกคนที่อยากเจออีกภายใน 72 ชั่วโมงหลังจบงาน",
              "No connections yet. Join an event, then choose who you'd like to meet again within 72 hours.",
            )}
          </Empty>
          <LinkButton href="/events">{t("ดูกิจกรรม", "Find an event")}</LinkButton>
        </Card>
      ) : (
        // One grouped list, rows split by hairlines (owner, 2026-10-16: "too card/boxy").
        <ul class="glist people-list" aria-label={props.v.t("คนรู้จักของคุณ", "Your people")}>
          {props.rows.map((r) => (
            <PersonCard v={props.v} r={r} error={props.error?.id === r.id ? props.error.text : undefined} />
          ))}
        </ul>
      )}
      {props.extras ? <CircleGroups v={props.v} extras={props.extras} /> : null}
    </>
  );
}

peopleRoutes.get("/connections", requireMember, async (c) => {
  const v = view(c);
  const { rows, myVibe } = await loadCircle(c);
  const user = c.var.user!;
  const [extras, again, chats] = await Promise.all([
    loadCircleExtras(c, rows, myVibe),
    rows.length ? seeAgain(getDb(c.env), { id: user.account.id, birthDate: user.profile!.birthDate }) : Promise.resolve(null),
    // The same unread rule as the Chats list (read up to the last message seen), so the two always agree.
    chatRows(getDb(c.env), user.account.id),
  ]);
  return page(c, { title: v.t("คนรู้จัก", "My people"), tab: "connections" }, <Circle v={v} rows={rows} myVibe={myVibe} extras={extras} again={again} chats={chats} />);
});

/** The connection, if I'm one of its two people and it's still active. */
async function myConnection(c: Ctx, id: string) {
  const me = c.var.user!.account.id;
  const [row] = await getDb(c.env).select().from(connections).where(eq(connections.id, id)).limit(1);
  if (!row || (row.aAccount !== me && row.bAccount !== me)) return null;
  return { row, me, other: row.aAccount === me ? row.bAccount : row.aAccount };
}

peopleRoutes.post("/connections/:id/share", requireMember, async (c) => {
  const v = view(c);
  const found = await myConnection(c, c.req.param("id"));
  if (!found || found.row.removedAt) return c.text("Not found", 404);
  const body = await c.req.parseBody();
  const methodRaw = str(body.method);
  const value = cleanHandle(str(body.value));
  if (!CONTACT_METHODS.some((m) => m.value === methodRaw) || !value) {
    const { rows, myVibe } = await loadCircle(c);
    return page(
      c,
      { title: v.t("คนรู้จัก", "My people"), tab: "connections", status: 400 },
      <Circle v={v} rows={rows} myVibe={myVibe} error={{ id: found.row.id, text: v.t("ใส่ไอดีให้ถูกต้อง (ตัวอักษร ตัวเลข _ . - ไม่เกิน 60 ตัว)", "Please enter a valid handle (letters, numbers, _ . -, up to 60).") }} />,
    );
  }
  const db = getDb(c.env);
  // A daily cap on handing out contacts: sharing should be deliberate.
  const today = await db
    .select({ id: contactShares.id })
    .from(contactShares)
    .where(and(eq(contactShares.accountId, found.me), gte(contactShares.createdAt, new Date(Date.now() - 86_400_000))))
    .limit(MAX_SHARES_PER_DAY);
  if (today.length >= MAX_SHARES_PER_DAY) {
    const { rows, myVibe } = await loadCircle(c);
    return page(
      c,
      { title: v.t("คนรู้จัก", "My people"), tab: "connections", status: 400 },
      <Circle v={v} rows={rows} myVibe={myVibe} error={{ id: found.row.id, text: v.t(`วันนี้แชร์ช่องทางติดต่อครบ ${MAX_SHARES_PER_DAY} ครั้งแล้ว ลองใหม่พรุ่งนี้`, `You've shared ${MAX_SHARES_PER_DAY} contacts today. Try again tomorrow.`) }} />,
    );
  }
  const nick = c.var.user!.profile!.nickname;
  await batch(c.env, [
    db
      .insert(contactShares)
      .values({ id: newId(), connectionId: found.row.id, accountId: found.me, method: methodRaw, value })
      .onConflictDoUpdate({ target: [contactShares.connectionId, contactShares.accountId], set: { method: methodRaw, value } }),
    notify(db, found.other, "contact_shared", `${nick} แชร์ช่องทางติดต่อกับคุณแล้ว`, `${nick} shared a contact with you`, "/connections"),
  ]);
  return c.redirect("/connections?notice=shared");
});

peopleRoutes.post("/connections/:id/remove", requireMember, async (c) => {
  const found = await myConnection(c, c.req.param("id"));
  if (!found) return c.text("Not found", 404);
  const db = getDb(c.env);
  const { me, other } = found;
  // One card per person, so Remove removes every connection with them.
  const all = await db
    .select({ id: connections.id, eventId: connections.eventId })
    .from(connections)
    .where(and(or(and(eq(connections.aAccount, me), eq(connections.bAccount, other)), and(eq(connections.aAccount, other), eq(connections.bAccount, me))), isNull(connections.removedAt)))
    .limit(50);
  await batch(c.env, [
    db.update(connections).set({ removedAt: new Date() }).where(and(inArray(connections.id, all.map((x) => x.id)), isNull(connections.removedAt))),
    // Both people's contact shares go with the connection (privacy notice: until either removes them).
    deletePairShares(db, me, other),
    // My choice becomes "none", so a later save by the other person can't quietly bring it back.
    ...all.map((x) =>
      db
        .insert(connectionChoices)
        .values({ id: newId(), eventId: x.eventId, fromAccount: me, toAccount: other, choice: "none" })
        .onConflictDoUpdate({
          target: [connectionChoices.eventId, connectionChoices.fromAccount, connectionChoices.toAccount],
          set: { choice: "none" },
        }),
    ),
    // Privacy R9: staff can read the audit log, so it never says who was removed.
    audit(db, me, "connection.remove", undefined, { count: all.length }),
  ]);
  return c.redirect("/connections?notice=done");
});

// ---------------------------------------------------------------- report --

type ReportTarget =
  | { ok: true; accountId: string | null; eventId: string | null; name: string }
  | { ok: false; status: 400 | 403 | 404 };

/**
 * A person can be reported by someone who shared an event with them or is
 * connected to them; an event by someone registered for it.
 */
async function reportTarget(c: Ctx, accountId: string, eventId: string): Promise<ReportTarget> {
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const lang = c.var.lang;
  if (!accountId && !eventId) return { ok: false, status: 400 };
  if (accountId === me) return { ok: false, status: 400 };

  let ev: { id: string; title: string; titleEn: string | null } | undefined;
  if (eventId) {
    [ev] = await db.select({ id: events.id, title: events.title, titleEn: events.titleEn }).from(events).where(eq(events.id, eventId)).limit(1);
    if (!ev) return { ok: false, status: 404 };
  }

  if (!accountId) {
    const [reg] = await db
      .select({ id: registrations.id })
      .from(registrations)
      .where(and(eq(registrations.eventId, eventId), eq(registrations.accountId, me)))
      .limit(1);
    if (!reg) return { ok: false, status: 403 };
    return { ok: true, accountId: null, eventId, name: eventTitle(ev!, lang) };
  }

  const [target] = await db.select({ nickname: profiles.nickname }).from(profiles).where(eq(profiles.accountId, accountId)).limit(1);
  if (!target) return { ok: false, status: 404 };
  const [regs, conn] = await Promise.all([
    db
      .select({ eventId: registrations.eventId, accountId: registrations.accountId })
      .from(registrations)
      .where(
        and(
          inArray(registrations.accountId, [me, accountId]),
          inArray(
            registrations.eventId,
            db.select({ id: registrations.eventId }).from(registrations).where(eq(registrations.accountId, me)),
          ),
        ),
      )
      .limit(2000),
    db
      .select({ id: connections.id })
      .from(connections)
      .where(
        or(
          and(eq(connections.aAccount, me), eq(connections.bAccount, accountId)),
          and(eq(connections.aAccount, accountId), eq(connections.bAccount, me)),
        ),
      )
      .limit(1),
  ]);
  const theirEvents = new Set(regs.filter((r) => r.accountId === accountId).map((r) => r.eventId));
  const sharedEvent = theirEvents.size > 0;
  if (!sharedEvent && conn.length === 0) return { ok: false, status: 403 };
  // Keep the event only if it really is one we shared.
  const keepEvent = eventId && theirEvents.has(eventId) ? eventId : null;
  return { ok: true, accountId, eventId: keepEvent, name: target.nickname };
}

function Emergency(props: { v: View }) {
  const { t } = props.v;
  return (
    <Notice kind="warn">
      <strong>
        {t("ถ้าคุณอยู่ในอันตรายตอนนี้ โทร ", "If you're in danger right now, call ")}
        <a href="tel:191">191</a> {t("(ตำรวจ) หรือ ", "(police) or ")}
        <a href="tel:1669">1669</a> {t("(เจ็บป่วยฉุกเฉิน)", "(medical emergency)")}
      </strong>
    </Notice>
  );
}

function ReportForm(props: { v: View; target: { accountId: string | null; eventId: string | null; name: string }; error?: string; values?: Record<string, string> }) {
  const { t, lang } = props.v;
  const val = props.values ?? {};
  return (
    <>
      <h1>{props.target.accountId ? t("รายงานสมาชิก", "Report a person") : t("รายงานกิจกรรม", "Report an event")}</h1>
      <Emergency v={props.v} />
      <p>
        {t("คุณกำลังรายงาน: ", "You're reporting: ")}
        <strong>{props.target.name}</strong>
      </p>
      <p class="muted">{t("อีกฝ่ายจะไม่รู้ว่าใครรายงาน", "They won't be told who reported them.")}</p>
      {props.error ? <Notice kind="error">{props.error}</Notice> : null}
      <form method="post" action="/report">
        {props.target.accountId ? <input type="hidden" name="account" value={props.target.accountId} /> : null}
        {props.target.eventId ? <input type="hidden" name="event" value={props.target.eventId} /> : null}
        <Choices legend={t("เกิดอะไรขึ้น?", "What happened?")} name="reason" options={REPORT_REASON_LABELS} values={val.reason ? [val.reason] : []} lang={lang} type="radio" required />
        <TextArea label={t("รายละเอียด (ไม่บังคับ)", "Details (optional)")} name="details" value={val.details} rows={4} maxlength={1000} hint={t("ไม่เกิน 1000 ตัวอักษร", "Up to 1000 characters")} />
        <Toggle name="unsafe" label={t("ฉันรู้สึกไม่ปลอดภัยตอนนี้", "I feel unsafe right now")} checked={val.unsafe === "1"} hint={t("ทีมงานจะดูรายงานนี้ก่อนเรื่องอื่น", "Our team will see this first.")} />
        <Button kind="danger">{t("ส่งรายงาน", "Send report")}</Button>
      </form>
    </>
  );
}

const refusal = (c: Ctx, v: View, status: 400 | 403 | 404) =>
  page(
    c,
    { title: v.t("รายงาน", "Report"), status },
    <>
      <h1>{v.t("รายงาน", "Report")}</h1>
      <Emergency v={v} />
      <Card>
        <p>
          {status === 403
            ? v.t("คุณรายงานได้เฉพาะคนที่เคยเจอในกิจกรรม หรือกิจกรรมที่เคยไป", "You can only report people or events you've attended with.")
            : v.t("ไม่พบสิ่งที่ต้องการรายงาน", "We couldn't find what you want to report.")}
        </p>
      </Card>
    </>,
  );

peopleRoutes.get("/report", requireMember, async (c) => {
  const v = view(c);
  const target = await reportTarget(c, c.req.query("account") ?? "", c.req.query("event") ?? "");
  if (!target.ok) return refusal(c, v, target.status);
  return page(c, { title: v.t("รายงาน", "Report") }, <ReportForm v={v} target={target} />);
});

peopleRoutes.post("/report", requireMember, async (c) => {
  const v = view(c);
  const { t } = v;
  const body = await c.req.parseBody();
  const target = await reportTarget(c, str(body.account), str(body.event));
  if (!target.ok) return refusal(c, v, target.status);
  const values = { reason: str(body.reason), details: str(body.details), unsafe: str(body.unsafe) };
  const fail = (error: string) => page(c, { title: t("รายงาน", "Report"), status: 400 }, <ReportForm v={v} target={target} error={error} values={values} />);
  if (!(REPORT_REASONS as readonly string[]).includes(values.reason)) return fail(t("เลือกเหตุผลก่อนส่งรายงาน", "Please choose a reason."));
  if (values.details.length > 1000) return fail(t("รายละเอียดยาวเกิน 1000 ตัวอักษร", "Details must be 1000 characters or fewer."));
  const critical = values.unsafe === "1";

  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  // Owner card A: 1 a day about the same person, 10 a day in all; critical never blocked.
  const limit = await reportLimit(db, me, target.accountId, critical);
  if (limit) {
    const [th, en] = limitText(limit);
    return page(c, { title: t("รายงาน", "Report"), status: 429 }, <ReportForm v={v} target={target} error={t(th, en)} values={values} />);
  }
  const alert = await staffAlert(c.env, db, { critical, aboutStaff: await isStaffTarget(db, target.accountId) });
  const id = newId();
  const writes: { toSQL(): { sql: string; params: unknown[] } }[] = [
    db.insert(reports).values({
      id,
      reporter: me,
      targetAccount: target.accountId,
      targetEvent: target.eventId,
      reason: values.reason,
      details: values.details,
      severity: critical ? "critical" : "standard",
    }),
    audit(db, me, "report.create", { type: "report", id }, { severity: critical ? "critical" : "standard", reason: values.reason }),
    ...alert.writes,
  ];
  await batch(c.env, writes);
  await alert.push();
  if (!critical) return c.redirect("/connections?notice=reported");
  return page(
    c,
    { title: t("รายงาน", "Report") },
    <>
      <Notice kind="ok">{t("ได้รับรายงานแล้ว ทีมงานจะดูรายงานด่วนนี้ก่อน", "Report received. Our team will look at this urgent report first.")}</Notice>
      <Emergency v={v} />
      <p>{t("ถ้าคุณอยู่ที่งาน ไปหาโฮสต์หรือทีมงานที่อยู่ใกล้ที่สุดได้เลย", "If you're at the event, go to the host or the nearest staff member.")}</p>
      <LinkButton href="/connections" kind="ghost">{t("กลับ", "Back")}</LinkButton>
    </>,
  );
});

// ----------------------------------------------------------------- block --

peopleRoutes.post("/block/:accountId", requireMember, async (c) => {
  const me = c.var.user!.account.id;
  const other = c.req.param("accountId");
  if (other === me) return c.text("You can't block yourself", 400);
  const db = getDb(c.env);
  const [exists] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, other)).limit(1);
  if (!exists) return c.text("Not found", 404);
  const body = await c.req.parseBody();
  await batch(c.env, [
    db.insert(blocks).values({ id: newId(), blocker: me, blocked: other }).onConflictDoNothing({ target: [blocks.blocker, blocks.blocked] }),
    // A block ends the connection, so both people's contact shares are deleted, not just hidden.
    deletePairShares(db, me, other),
    db
      .update(connections)
      .set({ removedAt: new Date() })
      .where(
        and(
          isNull(connections.removedAt),
          or(and(eq(connections.aAccount, me), eq(connections.bAccount, other)), and(eq(connections.aAccount, other), eq(connections.bAccount, me))),
        ),
      ),
    // A Bangkok Buddy pairing ends at once: safety first, and never counted as ghosting.
    db
      .update(buddyMatches)
      .set({ state: "ended", endedBy: me, endReason: "blocked", endedAt: new Date() })
      .where(
        and(
          ne(buddyMatches.state, "ended"),
          or(and(eq(buddyMatches.aAccount, me), eq(buddyMatches.bAccount, other)), and(eq(buddyMatches.aAccount, other), eq(buddyMatches.bAccount, me))),
        ),
      ),
    // A block withdraws both people's Pinky taps on each other, at tables and as buddies (owner, C4 panel).
    withdrawPairTaps(db, me, other),
    // Privacy R9: the audit log never says who was blocked.
    audit(db, me, "block.create"),
  ]);
  // Two people at the same regular table: nobody is removed; the host decides (/tables/:id/conflicts).
  await raiseConflicts(c.env, me, other);
  return c.redirect(withNotice(safeNext(str(body.back), "/connections"), "blocked"));
});

// --------------------------------------------------------- notifications --

/** The bell's dropdown list (an HTML fragment). Opening it marks these read. */
peopleRoutes.get("/notifications/panel", requireMember, async (c) => {
  const { t, lang } = view(c);
  const me = c.var.user!.account.id;
  const db = getDb(c.env);
  // New messages live with Chats (their own count on My people), so the bell leaves them out.
  const rows = await db.select().from(notifications).where(and(eq(notifications.accountId, me), notInArray(notifications.kind, [CHAT_KIND, KIND_DIGEST]), lte(notifications.createdAt, new Date()))).orderBy(desc(notifications.createdAt)).limit(12);
  // Only what the dropdown actually shows becomes read; older unread ones keep the badge.
  const shown = rows.filter((r) => !r.readAt).map((r) => r.id);
  if (shown.length) {
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.accountId, me), inArray(notifications.id, shown)));
  }
  c.header("cache-control", "no-store");
  return c.html(<NotifItems t={t} lang={lang} rows={rows} alertOn={!!c.var.user!.profile?.districtAlertOptIn} />);
});

peopleRoutes.get("/notifications", requireMember, async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const me = c.var.user!.account.id;
  const db = getDb(c.env);
  const rows = await db.select().from(notifications).where(and(eq(notifications.accountId, me), notInArray(notifications.kind, [CHAT_KIND, KIND_DIGEST]), lte(notifications.createdAt, new Date()))).orderBy(desc(notifications.createdAt)).limit(50);
  if (rows.some((r) => !r.readAt)) {
    // A chat's "new message" stays unread until that chat is opened.
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.accountId, me), ne(notifications.kind, CHAT_KIND), isNull(notifications.readAt), lte(notifications.createdAt, new Date())));
  }
  // They are read now: the bell on this page shows no badge (it was counted before this request marked them).
  c.var.user!.unread = 0;
  const push = vapidKeys(c.env);
  const alertOn = !!c.var.user!.profile?.districtAlertOptIn;
  return page(
    c,
    { title: t("การแจ้งเตือน", "Notifications") },
    <>
      <h1>{t("การแจ้งเตือน", "Notifications")}</h1>
      {push ? <PushSwitch t={t} publicKey={push.publicKey} card /> : null}
      {rows.length === 0 ? (
        <Empty>{t("ยังไม่มีการแจ้งเตือน", "No notifications yet.")}</Empty>
      ) : (
        // Grouped by day, and the same message on the same day folds into one row with a count (Phase 3).
        groupNotifications(rows, lang).map((g) => (
          <section class="notif-day">
            <h2 class="h3">{t(g.th, g.en)}</h2>
            <ul class="glist notif-list notif-page">
              {g.items.map(({ n, count }) => {
                const title = lang === "en" ? n.titleEn : n.titleTh;
                const href = n.link && safeNext(n.link, "") ? n.link : undefined;
                const body = (
                  <>
                    <span class="notif-title">
                      {title}
                      {count > 1 ? <b class="notif-count"> ×{count}</b> : null}
                    </span>
                    <small>
                      {!n.readAt ? <NewBadge t={t} /> : null} {fmtDate(n.createdAt, lang)}
                    </small>
                  </>
                );
                return (
                  <li class={n.readAt ? undefined : "unread"}>
                    {href ? (
                      <a href={href}>
                        {body}
                        <span class="notif-go" aria-hidden="true">›</span>
                      </a>
                    ) : (
                      <div>{body}</div>
                    )}
                    {n.kind === KIND_DISTRICT_ALERT && alertOn ? <DistrictAlertOff t={t} /> : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </>,
  );
});

// ------------------------------------------------------------ thank-yous --

const THANKS_MAX = 140;
const THANK_STARTERS = [
  { th: "ขอบคุณที่ชวนคุยนะ", en: "Thanks for the great chat" },
  { th: "ขอบคุณที่แนะนำร้านอร่อย", en: "Thanks for the food tip" },
  { th: "ดีใจที่ได้เจอ ไว้เจอกันอีกนะ", en: "So glad we met. See you again" },
];

/** A private one-line thank-you. One per connection, no counts anywhere. */
peopleRoutes.post("/connections/:id/thanks", requireMember, async (c) => {
  const found = await myConnection(c, c.req.param("id"));
  if (!found || found.row.removedAt) return c.text("Not found", 404);
  const body = str((await c.req.parseBody()).body).replace(/\s+/g, " ").trim().slice(0, THANKS_MAX);
  if (!body) return c.redirect("/connections");
  const db = getDb(c.env);
  const made = await db
    .insert(thanks)
    .values({ id: newId(), fromAccount: found.me, toAccount: found.other, context: `conn:${found.row.id}`, body })
    .onConflictDoNothing()
    .returning({ id: thanks.id });
  if (made.length) {
    const nick = c.var.user!.profile!.nickname;
    await notify(db, found.other, "thanks", `💌 ${nick} ส่งคำขอบคุณถึงคุณ`, `💌 ${nick} sent you a thank-you`, "/thanks");
  }
  return c.redirect("/connections?notice=saved");
});

peopleRoutes.get("/thanks", requireMember, async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const rows = await db
    .select({ body: thanks.body, createdAt: thanks.createdAt, nickname: profiles.nickname })
    .from(thanks)
    .innerJoin(profiles, eq(profiles.accountId, thanks.fromAccount))
    .where(eq(thanks.toAccount, me))
    .orderBy(desc(thanks.createdAt))
    .limit(50);
  return page(
    c,
    { title: t("คำขอบคุณ", "Thank-yous"), tab: "connections" },
    <>
      <h1>💌 {t("คำขอบคุณถึงคุณ", "Thank-yous for you")}</h1>
      <p class="muted">{t("เห็นแค่คุณคนเดียว ไม่มีการนับคะแนน", "Only you can see these. Nothing is counted or scored.")}</p>
      {rows.length === 0 ? (
        <Empty>{t("ยังไม่มี", "None yet.")}</Empty>
      ) : (
        rows.map((r) => (
          <Card>
            <p style="margin:0;font-size:1.1rem">“{r.body}”</p>
            <p class="muted">
              {r.nickname} · {fmtDay(r.createdAt, lang)}
            </p>
          </Card>
        ))
      )}
    </>,
  );
});

// ------------------------------------------------------------ graduation --

/** "Still in touch?" 30 days after graduating: yes or no, for M&E only. */
peopleRoutes.get("/connections/:id/still", requireMember, async (c) => {
  const v = view(c);
  const { t } = v;
  const found = await myConnection(c, c.req.param("id"));
  if (!found) return c.text("Not found", 404);
  return page(
    c,
    { title: t("ยังติดต่อกันอยู่ไหม", "Still in touch?"), tab: "connections" },
    <>
      <h1>🎓 {t("ยังติดต่อกันอยู่ไหม?", "Still in touch?")}</h1>
      <p class="muted">{t("แตะครั้งเดียว ช่วยให้เรารู้ว่า Jurrgun ช่วยให้คนได้เพื่อนจริง ๆ หรือเปล่า", "One tap. It tells us whether Jurrgun helps people make real friends.")}</p>
      <form method="post" class="row">
        <button class="btn primary" name="still" value="yes">{t("ยังคุยกันอยู่", "Yes, we are")}</button>
        <button class="btn ghost" name="still" value="no">{t("ห่าง ๆ กันไป", "Not really")}</button>
      </form>
    </>,
  );
});

peopleRoutes.post("/connections/:id/still", requireMember, async (c) => {
  const found = await myConnection(c, c.req.param("id"));
  if (!found) return c.text("Not found", 404);
  const yes = str((await c.req.parseBody()).still) === "yes";
  const side = found.row.aAccount === found.me ? { aStill: yes } : { bStill: yes };
  await getDb(c.env).update(graduations).set(side).where(eq(graduations.connectionId, found.row.id));
  return c.redirect("/connections?notice=saved");
});

/** Delete every contact share either person made on any connection between the two of them. */
function deletePairShares(db: ReturnType<typeof getDb>, x: string, y: string) {
  const pair = or(and(eq(connections.aAccount, x), eq(connections.bAccount, y)), and(eq(connections.aAccount, y), eq(connections.bAccount, x)));
  return db.delete(contactShares).where(inArray(contactShares.connectionId, db.select({ id: connections.id }).from(connections).where(pair)));
}
