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
import { Hono, type Context } from "hono";
import { and, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
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
import { CHOICE_LABELS, label, REPORT_REASON_LABELS } from "../lib/constants";
import { newId } from "../lib/crypto";
import type { AppEnv } from "../lib/env";
import { fmtDate, fmtDay } from "../lib/i18n";
import { audit, notify } from "../lib/records";
import { requireMember } from "../lib/session";
import {
  accounts,
  blocks,
  connectionChoices,
  connections,
  contactShares,
  events,
  notifications,
  profiles,
  registrations,
  REPORT_REASONS,
  reports,
  vibes,
  type Event,
  type Profile,
} from "../schema";
import { ARCHETYPES, displayName as typeName, matchLabel, MATCH_LABELS, normalizeType, type ArchetypeKey } from "../vibe/archetypes";
import { Button, Card, Choices, Empty, Field, LinkButton, Notice, page, Select, str, Tag, TextArea, Toggle, view, safeNext, type View } from "../ui/kit";

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
              "รายชื่อนี้ปิดแล้วหลังกิจกรรมจบ 72 ชั่วโมง ตัวเลือกที่ไม่ตรงกันจะหมดอายุไปเงียบ ๆ",
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
          "ตัวเลือกของคุณเป็นความลับ จะเกิดการเชื่อมต่อเมื่อเลือกตรงกันทั้งสองฝ่ายเท่านั้น ไม่มีใครได้รับแจ้งว่าคุณไม่ได้เลือกเขา",
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
  mine: { method: string; value: string } | null;
  theirs: { method: string; value: string } | null;
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
      mine: mine ? { method: mine.method, value: mine.value } : null,
      theirs: theirs ? { method: theirs.method, value: theirs.value } : null,
    });
  }
  return { rows: out, myVibe: vibeMap.get(me) };
}

function Circle(props: { v: View; rows: CircleRow[]; myVibe?: VibeInfo; error?: { id: string; text: string } }) {
  const { t, lang } = props.v;
  const method = (m: string) => label(CONTACT_METHODS, m, lang);
  return (
    <>
      <h1>{t("คนรู้จักในกรุงเทพฯ ของฉัน", "My Bangkok circle")}</h1>
      <p class="muted">
        {t(
          "คนที่เลือกกันและกันหลังกิจกรรม แชร์ช่องทางติดต่อเมื่อพร้อม — อีกฝ่ายจะเห็นเฉพาะที่คุณแชร์",
          "People you chose each other with after an event. Share a contact when you're ready — they only see what you share.",
        )}
      </p>
      {props.rows.length === 0 ? (
        <Card>
          <Empty>
            {t(
              "ยังไม่มีคนรู้จัก — ไปกิจกรรม แล้วเลือกคนที่อยากเจออีกภายใน 72 ชั่วโมงหลังงาน",
              "No connections yet. Join an event, then choose who you'd like to meet again within 72 hours.",
            )}
          </Empty>
          <LinkButton href="/events">{t("ดูกิจกรรม", "Find an event")}</LinkButton>
        </Card>
      ) : (
        props.rows.map((r) => (
          <Card>
            <h2>
              {r.other.name}
              {r.other.resident ? (
                <>
                  {" "}
                  <ResidentTag v={props.v} />
                </>
              ) : null}
            </h2>
            <TypeSpark v={props.v} theirs={r.other.vibe} mine={props.myVibe} />
            <p class="muted">
              {r.event ? `${r.event.title} · ${fmtDay(r.event.startsAt, lang)}` : ""} · {label(CHOICE_LABELS, r.level, lang)}
            </p>
            <dl>
              <dt>{t("ช่องทางที่คุณแชร์", "What you shared")}</dt>
              <dd>{r.mine ? `${method(r.mine.method)}: ${r.mine.value}` : t("ยังไม่ได้แชร์", "Nothing yet")}</dd>
              <dt>{t("ช่องทางที่เขาแชร์", "What they shared")}</dt>
              <dd>{r.theirs ? `${method(r.theirs.method)}: ${r.theirs.value}` : t("ยังไม่ได้แชร์", "Nothing yet")}</dd>
            </dl>
            {props.error?.id === r.id ? <Notice kind="error">{props.error.text}</Notice> : null}
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
  return page(c, { title: v.t("คนรู้จัก", "My Bangkok circle"), tab: "connections" }, <Circle v={v} rows={rows} myVibe={myVibe} />);
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
      <p class="muted">{t("อีกฝ่ายจะไม่รู้ว่าใครเป็นผู้รายงาน", "They won't be told who reported them.")}</p>
      {props.error ? <Notice kind="error">{props.error}</Notice> : null}
      <form method="post" action="/report">
        {props.target.accountId ? <input type="hidden" name="account" value={props.target.accountId} /> : null}
        {props.target.eventId ? <input type="hidden" name="event" value={props.target.eventId} /> : null}
        <Choices legend={t("เกิดอะไรขึ้น?", "What happened?")} name="reason" options={REPORT_REASON_LABELS} values={val.reason ? [val.reason] : []} lang={lang} type="radio" required />
        <TextArea label={t("รายละเอียด (ไม่บังคับ)", "Details (optional)")} name="details" value={val.details} rows={4} maxlength={1000} hint={t("ไม่เกิน 1000 ตัวอักษร", "Up to 1000 characters")} />
        <Toggle name="unsafe" label={t("ฉันรู้สึกไม่ปลอดภัยตอนนี้", "I feel unsafe right now")} checked={val.unsafe === "1"} hint={t("ทีมงานจะเห็นรายงานนี้ก่อน", "Our team will see this first.")} />
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
    audit(db, me, "block.create", { type: "account", id: other }),
  ]);
  return c.redirect(withNotice(safeNext(str(body.back), "/connections"), "blocked"));
});

// --------------------------------------------------------- notifications --

peopleRoutes.get("/notifications", requireMember, async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const me = c.var.user!.account.id;
  const db = getDb(c.env);
  const rows = await db.select().from(notifications).where(eq(notifications.accountId, me)).orderBy(desc(notifications.createdAt)).limit(50);
  if (rows.some((r) => !r.readAt)) {
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.accountId, me), isNull(notifications.readAt)));
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
