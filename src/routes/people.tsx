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
import { MAX_SHARES_PER_DAY } from "../domain/rules";
import { canHost } from "../domain/hosting";
import { Hono, type Context } from "hono";
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
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
import { NotifItems } from "../ui/notif-menu";
import { AvatarStack, Bento, Pill, Tile, artFor } from "../ui/visual";
import { QuestionArt } from "../ui/question-art";

export const peopleRoutes = new Hono<AppEnv>();

type Ctx = Context<AppEnv>;
type Db = ReturnType<typeof getDb>;

const CHOICE_SET = new Set<string>(["friend", "activity", "again", "romance", "none"]);
const CONTACT_METHODS = [
  { value: "line", th: "LINE", en: "LINE" },
  { value: "instagram", th: "Instagram", en: "Instagram" },
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
// Shared with the live page in events.tsx. Both are DISPLAY ONLY: they never
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
  if (!event) return { kind: "missing" };
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
      <h1>{t("คนที่ได้เจอ", "People I met")}</h1>
      <p class="muted">{eventTitle(s.event, lang)}</p>
      <Card>
        {s.kind === "not_attended" ? (
          <p>{t("เฉพาะคนที่เช็กอินที่งานนี้เท่านั้นที่ดูรายชื่อนี้ได้", "Only people who checked in at this event can see this list.")}</p>
        ) : s.kind === "before" ? (
          <p>
            {t("รายชื่อจะเปิดหลังกิจกรรมจบ และเปิดไว้ 72 ชั่วโมง", "This opens after the event ends, and stays open for 72 hours.")}{" "}
            ({fmtDate(s.event.endsAt, lang)})
          </p>
        ) : (
          <p>
            {t(
              "รายชื่อนี้ปิดแล้ว (เปิดให้เลือกแค่ 72 ชั่วโมงหลังจบงาน) ตัวเลือกที่ไม่ตรงกันจะหายไปเงียบ ๆ",
              "This closed 72 hours after the event. Choices that weren't mutual have quietly expired.",
            )}
          </p>
        )}
      </Card>
      <LinkButton href="/connections" kind="ghost">
        {t("ไปที่คนรู้จักของฉัน", "Go to my Bangkok circle")}
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
      <h1>{t("คนที่ได้เจอ", "People I met")}</h1>
      <p class="muted">
        {eventTitle(props.event, lang)} · {fmtDay(props.event.startsAt, lang)}
      </p>
      <Notice kind="info">
        {t(
          "ตัวเลือกของคุณเป็นความลับ จะได้รู้จักกันต่อก็ต่อเมื่อเลือกกันทั้งสองฝ่าย ไม่มีใครได้รับแจ้งว่าคุณไม่ได้เลือกเขา",
          "Your choices are private. Only mutual choices create a connection. Nobody is ever told you didn't choose them.",
        )}
      </Notice>
      {props.candidates.length === 0 ? (
        <Empty>{t("ยังไม่มีรายชื่อให้เลือกในกลุ่มของคุณ", "There's nobody to show from your group.")}</Empty>
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
              "เปลี่ยนใจได้จนกว่ารายชื่อจะปิด 72 ชั่วโมงหลังงานจบ",
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
    return page(c, { title: v.t("คนที่ได้เจอ", "People I met"), tab: "mine", status: state.kind === "not_attended" ? 403 : 200 }, <PeopleClosed v={v} state={state} />);
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
    { title: v.t("คนที่ได้เจอ", "People I met"), tab: "mine" },
    <PeopleForm v={v} event={state.event} candidates={state.candidates} mine={mine} romance={romance} vibes={vibeMap} myVibe={vibeMap.get(me.account.id)} />,
  );
});

peopleRoutes.post("/events/:id/people", requireMember, async (c) => {
  const v = view(c);
  const eventId = c.req.param("id");
  const state = await loadPeople(c, eventId);
  if (state.kind === "missing") return c.text("Not found", 404);
  if (state.kind !== "open") return page(c, { title: v.t("คนที่ได้เจอ", "People I met"), tab: "mine", status: 403 }, <PeopleClosed v={v} state={state} />);

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
  if (removeIds.length) writes.push(db.update(connections).set({ removedAt: new Date() }).where(inArray(connections.id, removeIds)));
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
  return c.redirect(`/events/${eventId}/people?notice=choices_saved`);
});

// ----------------------------------------------------- My Bangkok circle --

type CircleRow = {
  id: string;
  level: string;
  createdAt: Date;
  other: { id: string; name: string; resident: boolean; vibe?: VibeInfo };
  event: { id: string; title: string; startsAt: Date } | null;
  /** A Bangkok Buddy connection rather than one from an event. */
  buddy?: boolean;
  mine: { method: string; value: string } | null;
  theirs: { method: string; value: string } | null;
  /** Shared contacts and met twice or more: they don't need us anymore. */
  graduated?: boolean;
  /** I've already sent this person a thank-you note for this connection. */
  iThanked?: boolean;
};

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
  const [people, evs, shares, vibeMap] = await Promise.all([
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
      other: { id: otherId, name: displayName(p), resident: showsResidentBadge(p, p), vibe: vibeMap.get(otherId) },
      event: e ? { id: e.id, title: eventTitle(e, lang), startsAt: e.startsAt } : null,
      buddy: r.eventId.startsWith("buddy:"),
      mine: mine ? { method: mine.method, value: mine.value } : null,
      theirs: theirs ? { method: theirs.method, value: theirs.value } : null,
    });
  }
  await markGraduations(c, out);
  return { rows: out, myVibe: vibeMap.get(me) };
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
      const later = new Date(now.getTime() + 30 * 86_400_000);
      for (const who of [me, r.other.id]) {
        await notify(db, who, "graduated", "🎓 คุณสองคนไม่ต้องพึ่งเราแล้ว ยินดีด้วย!", "🎓 You two don't need us anymore. Congrats!", "/connections");
        await db.insert(notifications).values({ id: newId(), accountId: who, kind: "still_in_touch", titleTh: "ยังติดต่อกันอยู่ไหม? แตะเพื่อบอกเรา", titleEn: "Still in touch? Tap to tell us", link: `/connections/${r.id}/still`, createdAt: later });
      }
    }
  }
}

type CircleExtras = {
  buddy: { state: string; nickname: string } | null;
  hangouts: { id: string; title: string; startsAt: Date; district: string; host: string; href: string }[];
  ideas: { emoji: string; name: string; why: string; district: string; type: string }[];
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
  const [matches, shares] = await Promise.all([
    db
      .select()
      .from(buddyMatches)
      .where(and(ne(buddyMatches.state, "ended"), or(eq(buddyMatches.aAccount, me), eq(buddyMatches.bAccount, me))))
      .orderBy(desc(buddyMatches.createdAt))
      .limit(1),
    db.select({ eventId: circleShares.eventId, from: circleShares.fromAccount }).from(circleShares).where(eq(circleShares.toAccount, me)).orderBy(desc(circleShares.createdAt)).limit(50),
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
  return { buddy: m && buddyId ? { state: m.state, nickname: nick(buddyId) } : null, hangouts, ideas };
}

function CircleTop(props: { v: View; extras: CircleExtras; people: { name: string; emoji?: string; seed: string }[] }) {
  const { t, lang } = props.v;
  const { buddy, hangouts, ideas } = props.extras;
  // Only circle heads, verified partners and admins host; everyone else can ask to lead a circle.
  const host = !!props.v.user && canHost(props.v.user.account, true);
  return (
    <>
      <Bento>
        <Tile href="/buddy" tone="deep" size="wide" class="circle-buddy">
          <span class="go" aria-hidden="true">↗</span>
          <Pill dot>🤝 {t("บัดดี้กรุงเทพฯ", "Bangkok Buddy")}</Pill>
          <h3>
            {buddy
              ? buddy.state === "active"
                ? t(`สำรวจกรุงเทพฯ กับ ${buddy.nickname}`, `Exploring with ${buddy.nickname}`)
                : t(`บัดดี้คนใหม่: ${buddy.nickname}`, `New buddy: ${buddy.nickname}`)
              : t("หาบัดดี้", "Get a buddy")}
          </h3>
        </Tile>
        {host ? (
          <Tile href="/host/new?visibility=private" tone="brand">
            <span class="ico" aria-hidden="true">＋</span>
            <h3>{t("ชวนวงไปแฮงเอาต์", "Host a hangout for your circle")}</h3>
          </Tile>
        ) : (
          <Tile href="/circles/lead" tone="brand">
            <span class="ico" aria-hidden="true">👑</span>
            <h3>{t("ตั้งวงของคุณเอง", "Lead a circle")}</h3>
          </Tile>
        )}
        <Tile href="/events">
          <span class="ico" aria-hidden="true">🗓️</span>
          <h3>{t("กิจกรรมกลุ่ม", "Browse group events")}</h3>
        </Tile>
      </Bento>
      <h2>👥 {t("แฮงเอาต์กลุ่ม", "Group hangouts")}</h2>
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
        <p class="muted">{t("ยังไม่มีแฮงเอาต์จากวงของคุณ", "No hangouts from your circle yet.")}</p>
      )}
      {ideas.length ? (
        <>
          <h3>💡 {t("ไอเดียจากไทป์ในวงของคุณ", "Ideas from the types in your circle")}</h3>
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
      <h2 class="people-h">
        🫂 {t("คนในวงของคุณ", "Your people")}{" "}
        {props.people.length ? <AvatarStack items={props.people.slice(0, 6).map((p) => ({ label: p.name, emoji: p.emoji, seed: p.seed }))} more={Math.max(0, props.people.length - 6)} size={34} /> : null}
      </h2>
    </>
  );
}

function Circle(props: { v: View; rows: CircleRow[]; myVibe?: VibeInfo; error?: { id: string; text: string }; extras?: CircleExtras }) {
  const { t, lang } = props.v;
  const method = (m: string) => label(CONTACT_METHODS, m, lang);
  return (
    <>
      <p class="spread">
        <span />
        <a href="/chat">💬 {t("แชต", "Chats")}</a>
      </p>
      <h1>{t("คนรู้จักในกรุงเทพฯ ของฉัน", "My Bangkok circle")}</h1>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-thanks]");if(!b)return;var i=b.closest("form").querySelector("input[name=body]");if(i){i.value=b.dataset.thanks;i.focus()}})`,
        }}
      />
      <p class="muted">
        {t("คนที่เลือกกันและกัน บัดดี้ และแฮงเอาต์กลุ่ม", "People you chose each other with, your buddy, and group hangouts.")}
      </p>
      {props.extras ? (
        <CircleTop
          v={props.v}
          extras={props.extras}
          people={props.rows.map((r) => ({ name: r.other.name, emoji: r.other.vibe?.visible ? ARCHETYPES[r.other.vibe.archetype].emoji : undefined, seed: r.other.id }))}
        />
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
        props.rows.map((r) => (
          <Card>
            <h2>
              <a href={`/people/${r.other.id}`}>{r.other.name}</a>
              {r.other.resident ? (
                <>
                  {" "}
                  <ResidentTag v={props.v} />
                </>
              ) : null}
            </h2>
            <TypeSpark v={props.v} theirs={r.other.vibe} mine={props.myVibe} />
            <p class="muted">
              {r.event ? `${r.event.title} · ${fmtDay(r.event.startsAt, lang)}` : r.buddy ? t("🤝 บัดดี้กรุงเทพฯ", "🤝 Bangkok Buddy") : ""} · {label(CHOICE_LABELS, r.level, lang)}
            </p>
            {r.graduated ? (
              <p class="grad">🎓 {t("คุณสองคนไม่ต้องพึ่งเราแล้ว ยินดีด้วย!", "You two don't need us anymore. Congrats!")}</p>
            ) : null}
            <p class="acts">
              <a class="btn primary" href={`/chat/conn:${r.id}`}>💬 {t("แชต", "Chat")}</a>
            </p>
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
                  <Button kind="ghost">{t("ส่ง", "Send")}</Button>
                </form>
              </details>
            )}
            <p class="chips2">
              <span>{t("คุณแชร์", "You shared")}: {r.mine ? `${method(r.mine.method)} ${r.mine.value}` : t("ยังไม่แชร์", "nothing yet")}</span>
              <span>{t("เขาแชร์", "They shared")}: {r.theirs ? `${method(r.theirs.method)} ${r.theirs.value}` : t("ยังไม่แชร์", "nothing yet")}</span>
            </p>
            {props.error?.id === r.id ? <Notice kind="error">{props.error.text}</Notice> : null}
            <details class="how" open={props.error?.id === r.id}>
              <summary>{r.mine ? t("อัปเดตช่องทางติดต่อ", "Update contact") : t("แชร์ช่องทางติดต่อ", "Share contact")}</summary>
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
            <div class="row">
              <form method="post" action={`/connections/${r.id}/remove`}>
                <Button kind="ghost">{t("ลบออกจากคนรู้จัก", "Remove connection")}</Button>
              </form>
              <a href={`/report?account=${r.other.id}${r.event ? `&event=${r.event.id}` : ""}`}>{t("รายงาน", "Report")}</a>
              <form method="post" action={`/block/${r.other.id}`}>
                <input type="hidden" name="back" value="/connections" />
                <Button kind="danger">{t("บล็อก", "Block")}</Button>
              </form>
            </div>
          </Card>
        ))
      )}
    </>
  );
}

peopleRoutes.get("/connections", requireMember, async (c) => {
  const v = view(c);
  const { rows, myVibe } = await loadCircle(c);
  const extras = await loadCircleExtras(c, rows, myVibe);
  return page(c, { title: v.t("คนรู้จัก", "My Bangkok circle"), tab: "connections" }, <Circle v={v} rows={rows} myVibe={myVibe} extras={extras} />);
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
      { title: v.t("คนรู้จัก", "My Bangkok circle"), tab: "connections", status: 400 },
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
      { title: v.t("คนรู้จัก", "My Bangkok circle"), tab: "connections", status: 400 },
      <Circle v={v} rows={rows} myVibe={myVibe} error={{ id: found.row.id, text: v.t(`วันนี้แชร์ช่องทางติดต่อครบ ${MAX_SHARES_PER_DAY} ครั้งแล้ว พรุ่งนี้ค่อยแชร์ต่อนะ`, `You've shared ${MAX_SHARES_PER_DAY} contacts today. Try again tomorrow.`) }} />,
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
  const { row, me, other } = found;
  await batch(c.env, [
    db.update(connections).set({ removedAt: new Date() }).where(and(eq(connections.id, row.id), isNull(connections.removedAt))),
    // My choice becomes "none", so a later save by the other person can't quietly bring it back.
    db
      .insert(connectionChoices)
      .values({ id: newId(), eventId: row.eventId, fromAccount: me, toAccount: other, choice: "none" })
      .onConflictDoUpdate({
        target: [connectionChoices.eventId, connectionChoices.fromAccount, connectionChoices.toAccount],
        set: { choice: "none" },
      }),
    audit(db, me, "connection.remove", { type: "connection", id: row.id }),
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
        {t("หากอยู่ในอันตรายตอนนี้ โทร ", "If you're in danger right now, call ")}
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
      <h1>{props.target.accountId ? t("รายงานผู้ใช้", "Report a person") : t("รายงานกิจกรรม", "Report an event")}</h1>
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
      <Emergency v={v} />
      <Card>
        <p>
          {status === 403
            ? v.t("คุณรายงานได้เฉพาะคนหรือกิจกรรมที่คุณเคยร่วมด้วย", "You can only report people or events you've attended with.")
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
  if (!(REPORT_REASONS as readonly string[]).includes(values.reason)) return fail(t("เลือกเหตุผล", "Please choose a reason."));
  if (values.details.length > 1000) return fail(t("รายละเอียดยาวเกิน 1000 ตัวอักษร", "Details must be 1000 characters or fewer."));
  const critical = values.unsafe === "1";

  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const staff = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(inArray(accounts.role, ["moderator", "bma_admin"]), eq(accounts.status, "active")))
    // Every active moderator is told; the cap only guards against runaway growth.
    .limit(500);
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
  ];
  if (staff.length) {
    writes.push(
      db.insert(notifications).values(
        staff.map((s) => ({
          id: newId(),
          accountId: s.id,
          kind: "report",
          titleTh: critical ? "รายงานด่วน: มีคนรู้สึกไม่ปลอดภัย" : "มีรายงานใหม่รอตรวจสอบ",
          titleEn: critical ? "Urgent report: someone feels unsafe" : "New report to review",
          link: "/admin/moderation",
        })),
      ),
    );
  }
  await batch(c.env, writes);
  if (!critical) return c.redirect("/connections?notice=reported");
  return page(
    c,
    { title: t("รายงาน", "Report") },
    <>
      <Notice kind="ok">{t("ได้รับรายงานแล้ว ทีมงานจะดูรายงานด่วนนี้ก่อน", "Report received — our team will look at this urgent report first.")}</Notice>
      <Emergency v={v} />
      <p>{t("ถ้าคุณอยู่ที่งาน ให้ไปหาผู้จัดงานหรือเจ้าหน้าที่ใกล้ตัว", "If you're at the event, go to the host or the nearest staff member.")}</p>
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
    audit(db, me, "block.create", { type: "account", id: other }),
  ]);
  return c.redirect(withNotice(safeNext(str(body.back), "/connections"), "blocked"));
});

// --------------------------------------------------------- notifications --

/** The bell's dropdown list (an HTML fragment). Opening it marks these read. */
peopleRoutes.get("/notifications/panel", requireMember, async (c) => {
  const { t, lang } = view(c);
  const me = c.var.user!.account.id;
  const db = getDb(c.env);
  const rows = await db.select().from(notifications).where(and(eq(notifications.accountId, me), lte(notifications.createdAt, new Date()))).orderBy(desc(notifications.createdAt)).limit(12);
  // Only what the dropdown actually shows becomes read; older unread ones keep the badge.
  const shown = rows.filter((r) => !r.readAt).map((r) => r.id);
  if (shown.length) {
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.accountId, me), inArray(notifications.id, shown)));
  }
  c.header("cache-control", "no-store");
  return c.html(<NotifItems t={t} lang={lang} rows={rows} />);
});

peopleRoutes.get("/notifications", requireMember, async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const me = c.var.user!.account.id;
  const db = getDb(c.env);
  const rows = await db.select().from(notifications).where(and(eq(notifications.accountId, me), lte(notifications.createdAt, new Date()))).orderBy(desc(notifications.createdAt)).limit(50);
  if (rows.some((r) => !r.readAt)) {
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.accountId, me), isNull(notifications.readAt), lte(notifications.createdAt, new Date())));
  }
  return page(
    c,
    { title: t("การแจ้งเตือน", "Notifications") },
    <>
      <h1>{t("การแจ้งเตือน", "Notifications")}</h1>
      {rows.length === 0 ? (
        <Empty>{t("ยังไม่มีการแจ้งเตือน", "No notifications yet.")}</Empty>
      ) : (
        <ul class="list">
          {rows.map((n) => {
            const title = lang === "en" ? n.titleEn : n.titleTh;
            return (
              <li>
                <Card href={n.link && safeNext(n.link, "") ? n.link : undefined}>
                  {!n.readAt ? <strong>{title}</strong> : <span>{title}</span>}
                  <br />
                  <small>{fmtDate(n.createdAt, lang)}</small>
                </Card>
              </li>
            );
          })}
        </ul>
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
      <p class="muted">{t("ตอบครั้งเดียว ช่วยให้เรารู้ว่า Jurrgun ช่วยให้คนได้เพื่อนจริงไหม", "One tap. It tells us whether Jurrgun helps people make real friends.")}</p>
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
