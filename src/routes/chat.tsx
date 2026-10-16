/**
 * Chat with limits (rules in src/domain/chat.ts).
 *
 *   GET  /chat                         my open threads
 *   GET  /chat/:thread                 one thread (buddy:<id>, conn:<id>, circle:<eventId>, table:<regularTableId>)
 *   POST /chat/:thread                 send
 *   POST /chat/:thread/report/:msgId   report a message (goes to the moderation queue)
 *   POST /chat/:thread/photo           circle chats: share a photo from the day
 *   GET  /chat/:thread/photo/:msgId    the photo, only for members of the thread
 *   POST /chat/:thread/poll            circle chats: start a quick poll
 *   POST /chat/:thread/vote/:msgId     vote (or change your vote)
 *
 *   GET  /chat/:thread/live            receive-only live connection: the page hears
 *                                      "chat.changed" after a new message (no polling)
 *
 * Who may read and write is worked out from the pairing, connection or
 * hangout on every request, so a thread closes by itself when the buddy
 * pairing ends, a connection is removed, someone blocks, or a hangout is a
 * week past. No read receipts, typing indicators or online status.
 */
import { DayStatusLine } from "../ui/day-of";
import { shownDayStatus } from "../domain/day-of";
import { Hono, type Context } from "hono";
import { and, desc, eq, gte, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { getDb } from "../db";
import { CHAT_KIND, EXTRA_TEXT, HANGOUT_OPEN_DAYS, POLL_MAX, checkMessage, checkPhoto, checkPoll, notifyAt, parseThread, REASON_TEXT, shouldNudge, tally, threadKey } from "../domain/chat";
import { newId } from "../lib/crypto";
import type { AppEnv } from "../lib/env";
import { fmtDate, fmtDay, L } from "../lib/i18n";
import { audit } from "../lib/records";
import { requireMember } from "../lib/session";
import { accounts, blocks, buddyMatches, buddyQuests, chatMessages, chatReads, chatVotes, circleHeadRequests, connections, events, notifications, profiles, registrations, reports } from "../schema";
import { getObject, getObjectUrl, putObject } from "../storage";
import { PROMPT_BANK } from "../content/profile";
import { icebreakersFor, icebreakerWindow } from "../content/icebreakers";
import { getStatefulObject } from "../state";
import { blockedAmong, getTable, memberIds, myTables, standing } from "../services/regular-tables";
import { Sheet } from "../ui/sheet";
import { Button, Card, Empty, Notice, page, str, view, type View } from "../ui/kit";
import { NewBadge, UnreadCount } from "../ui/unread";

export const chatRoutes = new Hono<AppEnv>();
chatRoutes.use("/chat", requireMember);
chatRoutes.use("/chat/*", requireMember);

const DAY = 86_400_000;
/** Group threads (a hangout's or a regular table's) show their title and get photos and polls. */
const isGroup = (key: string) => key.startsWith("circle:") || key.startsWith("table:");
type Db = ReturnType<typeof getDb>;
type C = Context<AppEnv>;

export type Thread = {
  key: string;
  members: string[];
  open: boolean;
  met: boolean;
  title: { th: string; en: string };
  back: string;
  host?: string;
  /** Every thread key whose messages belong here: one chat per person (owner), so for someone met at several events, all those meetings' threads. */
  keys?: string[];
  /** A hangout's group chat: its event, for the curated icebreakers. */
  event?: { id: string; startsAt: Date; endsAt: Date; dayStatus: string | null; dayStatusNote: string | null; dayStatusAt: Date | null };
};
export const keysOf = (th: Thread) => th.keys ?? [th.key];

async function blockedBetween(db: Db, me: string, others: string[]): Promise<Set<string>> {
  if (!others.length) return new Set();
  const rows = await db
    .select({ a: blocks.blocker, b: blocks.blocked })
    .from(blocks)
    .where(or(and(eq(blocks.blocker, me), inArray(blocks.blocked, others)), and(eq(blocks.blocked, me), inArray(blocks.blocker, others))))
    .limit(500);
  return new Set(rows.map((r) => (r.a === me ? r.b : r.a)));
}

/** Have these two buddies met (both finished a quest together)? */
async function buddiesMet(db: Db, matchId: string): Promise<boolean> {
  const qs = await db.select({ a: buddyQuests.aDoneAt, b: buddyQuests.bDoneAt }).from(buddyQuests).where(eq(buddyQuests.matchId, matchId)).limit(60);
  return qs.some((q) => !!q.a && !!q.b);
}

/** Every connection between two people, newest first. */
async function pairConnections(db: Db, x: string, y: string) {
  return db
    .select()
    .from(connections)
    .where(or(and(eq(connections.aAccount, x), eq(connections.bAccount, y)), and(eq(connections.aAccount, y), eq(connections.bAccount, x))))
    .orderBy(desc(connections.createdAt))
    .limit(20);
}

/** The active buddy pairing between two people, if any: while it runs, their one chat is the buddy chat. */
async function activeBuddy(db: Db, x: string, y: string) {
  const [m] = await db
    .select({ id: buddyMatches.id })
    .from(buddyMatches)
    .where(and(or(and(eq(buddyMatches.aAccount, x), eq(buddyMatches.bAccount, y)), and(eq(buddyMatches.aAccount, y), eq(buddyMatches.bAccount, x))), eq(buddyMatches.state, "active")))
    .limit(1);
  return m ?? null;
}

/** Ended buddy pairings between two people (their chats now live with the person). */
async function pastBuddies(db: Db, x: string, y: string) {
  return db
    .select({ id: buddyMatches.id })
    .from(buddyMatches)
    .where(and(or(and(eq(buddyMatches.aAccount, x), eq(buddyMatches.bAccount, y)), and(eq(buddyMatches.aAccount, y), eq(buddyMatches.bAccount, x))), ne(buddyMatches.state, "active"), ne(buddyMatches.state, "proposed")))
    .limit(10);
}

/** The thread, if `me` belongs in it; null otherwise (so nobody can probe ids). */
export async function resolveThread(db: Db, key: string, me: string, now = new Date()): Promise<Thread | null> {
  const t = parseThread(key);
  if (!t) return null;
  if (t.kind === "buddy") {
    const [m] = await db.select().from(buddyMatches).where(eq(buddyMatches.id, t.ref)).limit(1);
    if (!m || (m.aAccount !== me && m.bAccount !== me) || m.state === "proposed") return null;
    const other = m.aAccount === me ? m.bAccount : m.aAccount;
    if ((await blockedBetween(db, me, [other])).size) return null;
    // One chat per person: while the pairing runs, their My people chats show here too.
    const pair = m.state === "active" ? await pairConnections(db, m.aAccount, m.bAccount) : [];
    return { key, keys: [key, ...pair.map((x) => `conn:${x.id}`)], members: [m.aAccount, m.bAccount], open: m.state === "active", met: await buddiesMet(db, m.id), title: { th: "บัดดี้กรุงเทพฯ", en: "Bangkok Buddy" }, back: "/buddy" };
  }
  if (t.kind === "conn") {
    const [cn] = await db.select().from(connections).where(eq(connections.id, t.ref)).limit(1);
    if (!cn || (cn.aAccount !== me && cn.bAccount !== me)) return null;
    const other = cn.aAccount === me ? cn.bAccount : cn.aAccount;
    if ((await blockedBetween(db, me, [other])).size) return null;
    // One chat per person: every connection with them, the newest open one leading (its key is the thread's).
    const [pair, buddy] = await Promise.all([pairConnections(db, cn.aAccount, cn.bAccount), activeBuddy(db, cn.aAccount, cn.bAccount)]);
    const lead = pair.find((x) => !x.removedAt) ?? cn;
    // Paired as buddies right now: the buddy chat is their one chat.
    if (buddy) return resolveThread(db, `buddy:${buddy.id}`, me, now);
    // Connections from an event: you met there. From a buddy pairing: met once a quest is done together.
    const met = pair.some((x) => !x.eventId.startsWith("buddy:")) || (await buddiesMet(db, lead.eventId.slice(6)));
    return {
      key: `conn:${lead.id}`,
      // Past buddy pairings between them too, so the buddy chat's history stays with the person.
      keys: [...pair.map((x) => `conn:${x.id}`), ...(await pastBuddies(db, cn.aAccount, cn.bAccount)).map((b) => `buddy:${b.id}`)],
      members: [cn.aAccount, cn.bAccount],
      open: !lead.removedAt,
      met,
      title: { th: "คนรู้จัก", en: "My people" },
      back: "/connections",
    };
  }
  if (t.kind === "table") {
    // A regular table's chat: the host and current members only (a block with the host puts you outside it).
    const table = await getTable(db, t.ref);
    if (!table || !(await standing(db, table, me)).isMember) return null;
    const [ids, started] = await Promise.all([
      memberIds(db, table.id),
      db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.regularTableId, table.id), eq(events.status, "published"), lte(events.startsAt, now)))
        .limit(1),
    ]);
    const outside = await blockedAmong(db, table.hostAccountId, ids);
    const members = [table.hostAccountId, ...ids.filter((id) => !outside.has(id))];
    // "Met" once the table has had a hangout: before that, the before-meet limits apply to everyone.
    return { key, members, open: true, met: started.length > 0, title: { th: table.name, en: table.name }, back: `/tables/${table.id}`, host: table.hostAccountId };
  }
  const [e] = await db.select().from(events).where(eq(events.id, t.ref)).limit(1);
  if (!e || e.visibility !== "private" || e.status !== "published") return null;
  const regs = await db
    .select({ accountId: registrations.accountId })
    .from(registrations)
    .where(and(eq(registrations.eventId, e.id), eq(registrations.status, "confirmed")))
    .limit(200);
  const members = [...new Set([e.hostAccountId ?? e.createdBy, ...regs.map((r) => r.accountId)])];
  if (!members.includes(me)) return null;
  return {
    key,
    members,
    open: now.getTime() < e.endsAt.getTime() + HANGOUT_OPEN_DAYS * DAY,
    met: now.getTime() >= e.startsAt.getTime(),
    // The date too: a recurring hangout's chats would otherwise share one title in the list.
    title: { th: `${e.title} · ${fmtDay(e.startsAt, "th")}`, en: `${e.titleEn ?? e.title} · ${fmtDay(e.startsAt, "en")}` },
    back: `/events/${e.id}`,
    host: e.hostAccountId ?? e.createdBy,
    event: { id: e.id, startsAt: e.startsAt, endsAt: e.endsAt, dayStatus: e.dayStatus, dayStatusNote: e.dayStatusNote, dayStatusAt: e.dayStatusAt },
  };
}

/** The threads `me` is in right now, newest activity first. */
async function myThreads(db: Db, me: string, now: Date): Promise<string[]> {
  const [matches, conns, regs, hosted, tables] = await Promise.all([
    db
      .select({ id: buddyMatches.id })
      .from(buddyMatches)
      .where(and(or(eq(buddyMatches.aAccount, me), eq(buddyMatches.bAccount, me)), eq(buddyMatches.state, "active")))
      .limit(5),
    db
      .select({ id: connections.id })
      .from(connections)
      .where(and(or(eq(connections.aAccount, me), eq(connections.bAccount, me)), isNull(connections.removedAt)))
      .limit(100),
    db
      .select({ id: events.id })
      .from(registrations)
      .innerJoin(events, eq(events.id, registrations.eventId))
      .where(and(eq(registrations.accountId, me), eq(registrations.status, "confirmed"), eq(events.visibility, "private"), gte(events.endsAt, new Date(now.getTime() - 7 * DAY))))
      .limit(30),
    db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.hostAccountId, me), eq(events.visibility, "private"), eq(events.status, "published"), gte(events.endsAt, new Date(now.getTime() - 7 * DAY))))
      .limit(30),
    myTables(db, me),
  ]);
  return [
    ...matches.map((m) => `buddy:${m.id}`),
    ...conns.map((c) => `conn:${c.id}`),
    ...[...new Set([...regs, ...hosted].map((e) => e.id))].map((id) => `circle:${id}`),
    ...tables.map((x) => `table:${x.id}`),
  ];
}

chatRoutes.get("/chat", async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const now = new Date();
  const keys = await myThreads(db, me, now);
  // Someone met at several events resolves to one thread (the newest meeting's): list it once.
  const seen = new Set<string>();
  const threads = (await Promise.all(keys.map((k) => resolveThread(db, k, me, now)))).filter((x): x is Thread => !!x && !seen.has(x.key) && !!seen.add(x.key));
  const allKeys = threads.flatMap(keysOf);
  const leadOf = new Map(threads.flatMap((th) => keysOf(th).map((k) => [k, th.key] as const)));
  const others = [...new Set(threads.flatMap((th) => th.members).filter((x) => x !== me))];
  const [names, lasts, reads] = await Promise.all([
    others.length ? db.select({ id: profiles.accountId, nickname: profiles.nickname }).from(profiles).where(inArray(profiles.accountId, others)).limit(others.length) : [],
    allKeys.length
      ? db.select({ thread: chatMessages.thread, body: chatMessages.body, kind: chatMessages.kind, createdAt: chatMessages.createdAt, sender: chatMessages.sender }).from(chatMessages).where(and(inArray(chatMessages.thread, allKeys), isNull(chatMessages.hiddenAt))).orderBy(desc(chatMessages.createdAt)).limit(500)
      : [],
    db.select().from(chatReads).where(eq(chatReads.accountId, me)).limit(200),
  ]);
  const nameOf = new Map(names.map((n) => [n.id, n.nickname]));
  const lastOf = new Map<string, (typeof lasts)[number]>();
  for (const m of lasts) {
    const lead = leadOf.get(m.thread) ?? m.thread;
    if (!lastOf.has(lead)) lastOf.set(lead, m);
  }
  const readOf = new Map(reads.map((r) => [r.thread, r.lastReadAt.getTime()]));
  const rows = threads
    .map((th) => {
      const last = lastOf.get(th.key);
      return { th, last, unread: !!last && last.sender !== me && last.createdAt.getTime() > (readOf.get(th.key) ?? 0) };
    })
    .sort((a, b) => (b.last?.createdAt.getTime() ?? 0) - (a.last?.createdAt.getTime() ?? 0));
  const unreadCount = rows.filter((r) => r.unread).length;
  return page(
    c,
    { title: t("แชต", "Chats"), tab: "connections" },
    <>
      <h1>💬 {t("แชต", "Chats")}</h1>
      <p class="muted">{t("คุยสั้น ๆ แล้วนัดเจอกันจริง ไม่มีสถานะออนไลน์ และไม่บอกว่าอ่านแล้ว", "Short chats that lead to meeting. No online status, no read receipts.")}</p>
      {unreadCount > 0 ? (
        <p class="unread-sum">
          <UnreadCount n={unreadCount} /> {t(`ยังไม่ได้อ่าน ${unreadCount} แชต`, `${unreadCount} unread ${unreadCount === 1 ? "chat" : "chats"}`)}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <Empty>{t("ยังไม่มีแชต แชตจะเปิดเมื่อคุณมีบัดดี้ คนรู้จัก โต๊ะประจำ หรือแฮงเอาต์ส่วนตัว", "No chats yet. They open with a buddy, someone you've met, a Regular Table or a private hangout.")}</Empty>
      ) : (
        <ul class="chat-list">
          {rows.map(({ th, last, unread }) => {
            const who = th.members.filter((x) => x !== me).map((x) => nameOf.get(x) ?? "?");
            return (
              <li>
                <a href={`/chat/${th.key}`} class={unread ? "unread" : undefined}>
                  <b aria-hidden="true">{th.key.startsWith("buddy") ? "🤝" : isGroup(th.key) ? "👥" : "💬"}</b>
                  <span>
                    <strong>{isGroup(th.key) ? L(lang, th.title) : who.join(", ")}</strong>
                    <small>{last ? preview(last, t) : t("ยังไม่มีข้อความ", "No messages yet")}</small>
                  </span>
                  {unread ? <NewBadge t={t} /> : !th.open ? <small class="muted">{t("ปิดแล้ว", "Closed")}</small> : null}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>,
  );
});

type Msg = typeof chatMessages.$inferSelect;

/** The chat list's one-line preview of the latest message. */
function preview(m: Pick<Msg, "kind" | "body">, t: View["t"]): string {
  if (m.kind === "photo") return `📷 ${m.body || t("รูป", "Photo")}`.slice(0, 70);
  if (m.kind === "poll") return `📊 ${m.body}`.slice(0, 70);
  return m.body.slice(0, 70);
}

/** A poll: tap an option to vote (tap another to change it). Totals only, never who voted what. */
function Poll(props: { v: View; k: string; m: Msg; votes: { accountId: string; option: number }[]; me: string; open: boolean }) {
  const { t } = props.v;
  const opts = props.m.pollOptions ?? [];
  const counts = tally(opts.length, props.votes);
  const total = props.votes.length;
  const mine = props.votes.find((x) => x.accountId === props.me)?.option;
  return (
    <div class="chat-poll">
      <p class="q">📊 {props.m.body}</p>
      {opts.map((o, i) => {
        const pct = total ? Math.round((counts[i] / total) * 100) : 0;
        return (
          <form method="post" action={`/chat/${props.k}/vote/${props.m.id}`}>
            <input type="hidden" name="option" value={String(i)} />
            <button class={mine === i ? "opt mine" : "opt"} disabled={!props.open} aria-pressed={mine === i ? "true" : "false"}>
              <i style={`width:${pct}%`} aria-hidden="true" />
              <span>{mine === i ? "✓ " : ""}{o}</span>
              <b>{counts[i]}</b>
            </button>
          </form>
        );
      })}
      <small class="muted">{t(`โหวตแล้ว ${total} คน · ไม่แสดงว่าใครเลือกอะไร`, `${total} ${total === 1 ? "vote" : "votes"} · nobody sees who picked what`)}</small>
    </div>
  );
}

/** Circle chats: share a photo from the day, or start a quick poll. */
function CircleExtras(props: { v: View; k: string; met: boolean }) {
  const { t } = props.v;
  return (
    <div class="chat-extras">
      {props.met ? (
        <form method="post" action={`/chat/${props.k}/photo`} enctype="multipart/form-data" class="chat-photo-form">
          <label class="chip">
            📷 {t("แชร์รูปจากวันนี้", "Share a photo from today")}
            <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required />
          </label>
          <input type="text" name="caption" maxlength={140} placeholder={t("คำบรรยาย (ไม่บังคับ)", "Caption (optional)")} aria-label={t("คำบรรยาย", "Caption")} />
          <Button kind="ghost">{t("ส่งรูป", "Send photo")}</Button>
        </form>
      ) : (
        <p class="muted">📷 {t("แชร์รูปได้เมื่อแฮงเอาต์เริ่มแล้ว", "Photos open once the hangout starts.")}</p>
      )}
      <details class="how chat-poll-new">
        <summary>📊 {t("สร้างโพล", "Start a poll")}</summary>
        <form method="post" action={`/chat/${props.k}/poll`}>
          <input type="text" name="question" maxlength={120} required placeholder={t("เช่น วันไหนดี?", "e.g. Which Sunday works?")} aria-label={t("คำถาม", "Question")} />
          {Array.from({ length: POLL_MAX }, (_, i) => (
            <input type="text" name="options" maxlength={60} required={i < 2} placeholder={t(`ตัวเลือก ${i + 1}`, `Option ${i + 1}`)} aria-label={t(`ตัวเลือก ${i + 1}`, `Option ${i + 1}`)} />
          ))}
          <Button kind="ghost">{t("ส่งโพล", "Post poll")}</Button>
        </form>
      </details>
    </div>
  );
}

/** Three conversation starters, the same for everyone in a thread on a given day. */
function starters(key: string, now: Date) {
  const text = PROMPT_BANK.filter((p) => p.kind === "text");
  let h = 0;
  for (const ch of `${key}|${now.toISOString().slice(0, 10)}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return [0, 1, 2].map((i) => text[(h + i * 7) % text.length]);
}

async function renderThread(c: C, key: string, error?: { th: string; en: string }, status: 200 | 400 = 200) {
  const v: View = view(c);
  const { t, lang } = v;
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const now = new Date();
  const th = await resolveThread(db, key, me, now);
  if (!th) return c.text("Not found", 404);
  // An earlier meeting's chat opens as the person's one chat.
  if (th.key !== key) return c.redirect(`/chat/${th.key}`);
  const others = th.members.filter((x) => x !== me);
  const hide = await blockedBetween(db, me, others);
  const [msgs, names] = await Promise.all([
    db.select().from(chatMessages).where(and(inArray(chatMessages.thread, keysOf(th)), isNull(chatMessages.hiddenAt))).orderBy(desc(chatMessages.createdAt)).limit(120),
    db.select({ id: profiles.accountId, nickname: profiles.nickname }).from(profiles).where(inArray(profiles.accountId, th.members)).limit(th.members.length),
  ]);
  const visible = msgs.filter((m) => !hide.has(m.sender)).reverse();
  const nameOf = new Map(names.map((n) => [n.id, n.nickname]));
  const pollIds = visible.filter((m) => m.kind === "poll").map((m) => m.id);
  const [votes, headOf] = await Promise.all([
    pollIds.length ? db.select().from(chatVotes).where(inArray(chatVotes.messageId, pollIds)).limit(5000) : Promise.resolve([]),
    th.host
      ? db.select({ name: circleHeadRequests.circleName }).from(circleHeadRequests).where(and(eq(circleHeadRequests.accountId, th.host), eq(circleHeadRequests.status, "approved"))).orderBy(desc(circleHeadRequests.createdAt)).limit(1)
      : Promise.resolve([]),
  ]);
  const isCircle = isGroup(th.key);
  const hostLabel = key.startsWith("table:") ? t("👑 เจ้าภาพโต๊ะ", "👑 Table Host") : headOf[0]?.name ? `👑 ${headOf[0].name}` : t("👑 ผู้จัด", "👑 Host");
  // Opening the chat reads it: its waiting "new message" (any of the person's threads) clears too,
  // including one held back for quiet hours, so the My people count drops straight away.
  const links = keysOf(th).map((k) => `/chat/${k}`);
  const [, cleared] = await Promise.all([
    db
      .insert(chatReads)
      .values({ thread: key, accountId: me, lastReadAt: now })
      .onConflictDoUpdate({ target: [chatReads.thread, chatReads.accountId], set: { lastReadAt: now } }),
    db
      .update(notifications)
      .set({ readAt: now })
      .where(and(eq(notifications.accountId, me), eq(notifications.kind, CHAT_KIND), inArray(notifications.link, links), isNull(notifications.readAt)))
      .returning({ link: notifications.link, createdAt: notifications.createdAt }),
  ]);
  // This page's own tab badge no longer counts the chat being read (the count was taken before this request).
  const counted = new Set(cleared.filter((r) => r.createdAt.getTime() <= now.getTime()).map((r) => r.link)).size;
  c.var.user!.chatUnread = Math.max(0, (c.var.user!.chatUnread ?? 0) - counted);
  const title = isCircle ? L(lang, th.title) : others.map((x) => nameOf.get(x) ?? "?").join(", ");
  const ice = th.open && th.event && icebreakerWindow(th.event.startsAt, th.event.endsAt, now) ? icebreakersFor(th.event.id) : null;
  return page(
    c,
    { title: t("แชต", "Chat"), tab: "connections", status },
    <>
      <p class="spread">
        <a href="/chat">← {t("แชต", "Chats")}</a>
        {/* Group chats: the name is the heading below, so this link names the page it goes to (it showed the name twice). */}
        <a href={th.back}>{isCircle ? (key.startsWith("table:") ? t("หน้าโต๊ะ", "Table page") : t("หน้ากิจกรรม", "Event page")) : L(lang, th.title)}</a>
      </p>
      <h1>{title}</h1>
      {/* A hangout on its day: the host's one-line status, the same as on the event page. */}
      {th.event ? <DayStatusLine t={t} lang={lang} shown={shownDayStatus(th.event, now)} /> : null}
      {c.req.query("notice") === "reported" ? (
        <Notice kind="ok">{t("ได้รับรายงานแล้ว ทีมงานจะตรวจสอบ ถ้าไม่อยากคุยต่อ บล็อกได้จากหน้าคนรู้จัก", "Reported. Our team will review it. You can block them from My people if you'd rather not talk.")}</Notice>
      ) : null}
      {!th.met ? (
        <Notice kind="info">
          {t(
            "ยังไม่ได้เจอกัน: ส่งลิงก์ เบอร์โทร หรือไอดียังไม่ได้ และส่งได้คนละ 25 ข้อความ นัดเจอในที่สาธารณะตอนกลางวันก่อนนะ",
            "You haven't met yet: no links, numbers or handles, and 25 messages each. Meet somewhere public, in daylight, first.",
          )}
        </Notice>
      ) : null}
      {shouldNudge(th.met, visible.length) ? (
        <Card class="hint">
          <strong>🗓️ {t("นัดเจอกันเลยดีกว่าไหม?", "Plan a meet instead?")}</strong>
          <p class="muted">{t("คุยกันมาเยอะแล้ว เจอตัวจริงสนุกกว่า", "You've chatted a lot. Meeting is better.")}</p>
        </Card>
      ) : null}
      <ol class="chat-msgs" id="msgs">
        {visible.map((m) => (
          <li class={m.sender === me ? "mine" : undefined} data-sheet-hold={m.sender !== me ? "" : undefined}>
            {m.sender !== me && th.members.length > 2 ? (
              <small class="who">
                {nameOf.get(m.sender) ?? "?"}
                {isCircle && m.sender === th.host ? <span class="host-badge">{hostLabel}</span> : null}
              </small>
            ) : null}
            {m.moneyFlag && m.sender !== me ? (
              <p class="chat-warn">⚠️ {t("ข้อความนี้พูดถึงเงิน อย่าโอนเงินให้คนที่เพิ่งรู้จัก", "This mentions money. Never send money to someone you've just met.")}</p>
            ) : null}
            {m.kind === "photo" ? (
              <figure class="chat-photo">
                <img src={`/chat/${key}/photo/${m.id}`} alt={m.body || t("รูปจากแฮงเอาต์", "A photo from the hangout")} loading="lazy" />
                {m.body ? <figcaption>{m.body}</figcaption> : null}
              </figure>
            ) : m.kind === "poll" ? (
              <Poll v={v} k={key} m={m} votes={votes.filter((x) => x.messageId === m.id)} me={me} open={th.open} />
            ) : (
              <p class="bubble">{m.body}</p>
            )}
            <div class="msg-meta">
              <small class="when">{fmtDate(m.createdAt, lang)}</small>
              {m.sender !== me ? (
                // B3: Report sits behind a ⋯ that shows on a focused, hovered or long-pressed bubble.
                <Sheet
                  t={t}
                  title={t(`ข้อความจาก ${nameOf.get(m.sender) ?? "?"}`, `Message from ${nameOf.get(m.sender) ?? "?"}`)}
                  trigger={<span aria-hidden="true">⋯</span>}
                  triggerClass="bubble-more"
                  triggerLabel={t(`ตัวเลือกสำหรับข้อความจาก ${nameOf.get(m.sender) ?? "?"}`, `Options for the message from ${nameOf.get(m.sender) ?? "?"}`)}
                  align="start"
                >
                  <form method="post" action={`/chat/${key}/report/${m.id}`}>
                    <button class="sheet-item danger">
                      <span aria-hidden="true">🚩</span> {t("รายงานข้อความนี้", "Report this message")}
                    </button>
                  </form>
                </Sheet>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {visible.length === 0 && th.open ? <p class="muted">{t("แตะ + เพื่อเลือกคำถามเริ่มคุย", "Tap + for a question to start with.")}</p> : null}
      {th.open ? (
        // B3: one row, "+" (photo, poll, icebreakers), the text field, then Send.
        <div class="chat-compose">
          <Sheet
            t={t}
            title={isCircle ? t("เพิ่มในแชต", "Add to the chat") : t("คำถามชวนคุย", "Icebreakers")}
            trigger={<span aria-hidden="true">+</span>}
            triggerClass="sheet-more chat-plus"
            triggerLabel={isCircle ? t("เพิ่มรูป โพล หรือคำถามชวนคุย", "Add a photo, poll or icebreaker") : t("คำถามชวนคุย", "Icebreakers")}
            align="start"
          >
            {isCircle ? <CircleExtras v={v} k={key} met={th.met} /> : null}
            {ice ? (
              // A hangout's group chat, in the days before and on the day: the event's curated icebreakers, one tap sends one.
              <details class="how chat-ice" open>
                <summary>
                  <span aria-hidden="true">💬</span> {t("คำถามชวนคุย แตะเพื่อส่ง", "Icebreakers: tap one to send")}
                </summary>
                <ul>
                  {ice.map((x) => {
                    const text = lang === "en" ? x.en : x.th;
                    return (
                      <li>
                        <form method="post" action={`/chat/${key}`}>
                          <button name="body" value={text}>
                            <span aria-hidden="true">{x.emoji}</span> <span class="sr-only">{t("ส่งคำถามนี้: ", "Send: ")}</span>
                            {text}
                          </button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ) : (
              // Everyday starters: with JS a tap puts it in the text field to edit; without JS it sends.
              <div class="chat-starters">
                {starters(key, now).map((p) => {
                  const text = lang === "en" ? p.en : p.th;
                  return (
                    <form method="post" action={`/chat/${key}`}>
                      <button class="sheet-item" name="body" value={text} data-starter={text}>
                        <span aria-hidden="true">{p.emoji}</span> {text}
                      </button>
                    </form>
                  );
                })}
              </div>
            )}
          </Sheet>
          <form method="post" action={`/chat/${key}`} class="chat-send">
            {error ? <Notice kind="warn">{L(lang, error)}</Notice> : null}
            {/* ?say= prefills a suggested first line (e.g. from "Invite to a table"); the member still decides to send it. */}
            <textarea name="body" rows={1} maxlength={500} required aria-label={t("ข้อความ", "Message")} placeholder={t("พิมพ์ข้อความ…", "Write a message…")}>
              {(c.req.query("say") ?? "").slice(0, 200)}
            </textarea>
            <Button>{t("ส่ง", "Send")}</Button>
          </form>
        </div>
      ) : null}
      {th.open ? null : (
        <Notice kind="info">{t("แชตนี้ปิดแล้ว อ่านย้อนหลังได้", "This chat has closed. You can still read it.")}</Notice>
      )}
      <script dangerouslySetInnerHTML={{ __html: CHAT_JS }} />
    </>,
  );
}

chatRoutes.get("/chat/:thread", (c) => renderThread(c, c.req.param("thread")));

/**
 * The thread's live feed. The object's name comes from the thread key, and only
 * after resolveThread confirmed this member belongs in it (hard rule 8). Only
 * a signal is published; each page refetches through its own checked route.
 */
chatRoutes.get("/chat/:thread/live", async (c) => {
  const key = c.req.param("thread");
  const th = await resolveThread(getDb(c.env), key, c.var.user!.account.id);
  if (!th) return c.text("Not found", 404);
  try {
    const feed = await getStatefulObject(c.env, `chat:${th.key}`);
    return feed.listen(c.req.raw);
  } catch {
    // Not available under `npm run dev`; the page still updates on send and on focus.
    return c.text("Live updates unavailable", 503);
  }
});

chatRoutes.post("/chat/:thread", async (c) => {
  const key = c.req.param("thread");
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const now = new Date();
  const th = await resolveThread(db, key, me, now);
  if (!th) return c.text("Not found", 404);
  const dayStart = new Date(now.getTime() - DAY);
  const [mineToday, mineAllToday, mineInThread] = await Promise.all([
    db.select({ id: chatMessages.id }).from(chatMessages).where(and(eq(chatMessages.thread, th.key), eq(chatMessages.sender, me), gte(chatMessages.createdAt, dayStart))).limit(200),
    db.select({ id: chatMessages.id }).from(chatMessages).where(and(eq(chatMessages.sender, me), gte(chatMessages.createdAt, dayStart))).limit(500),
    db.select({ id: chatMessages.id }).from(chatMessages).where(and(eq(chatMessages.thread, th.key), eq(chatMessages.sender, me))).limit(200),
  ]);
  const res = checkMessage(str((await c.req.parseBody()).body), {
    met: th.met,
    open: th.open,
    sentToday: mineToday.length,
    sentTodayAll: mineAllToday.length,
    sentInThread: mineInThread.length,
  });
  if (!res.ok) return renderThread(c, key, REASON_TEXT[res.reason], 400);
  await db.insert(chatMessages).values({ id: newId(), thread: th.key, sender: me, body: res.body, moneyFlag: res.moneyFlag, createdAt: now });
  // One waiting notification per thread per person; it appears after quiet hours.
  const others = th.members.filter((x) => x !== me);
  const link = `/chat/${threadKey(parseThread(key)!)}`;
  const waiting = await db
    .select({ accountId: notifications.accountId })
    .from(notifications)
    .where(and(inArray(notifications.accountId, others), eq(notifications.link, link), isNull(notifications.readAt)))
    .limit(others.length);
  const already = new Set(waiting.map((w) => w.accountId));
  const due = notifyAt(now);
  const fresh = others.filter((x) => !already.has(x));
  if (fresh.length) {
    await db.insert(notifications).values(fresh.map((accountId) => ({ id: newId(), accountId, kind: CHAT_KIND, titleTh: "มีข้อความใหม่", titleEn: "New message", link, createdAt: due })));
  }
  await db.insert(chatReads).values({ thread: th.key, accountId: me, lastReadAt: now }).onConflictDoUpdate({ target: [chatReads.thread, chatReads.accountId], set: { lastReadAt: now } });
  // Tell open pages in this thread to refetch. Never fail the send over it.
  try {
    const feed = await getStatefulObject(c.env, `chat:${th.key}`);
    await feed.publish({ type: "chat.changed" }).catch(() => {});
  } catch {
    /* local dev: no live objects */
  }
  return c.redirect(`/chat/${key}#msgs`);
});

/** Tell open pages in this thread to refetch. Never fails the request. */
async function ping(c: C, key: string) {
  try {
    const feed = await getStatefulObject(c.env, `chat:${key}`);
    await feed.publish({ type: "chat.changed" }).catch(() => {});
  } catch {
    /* local dev: no live objects */
  }
}

chatRoutes.post("/chat/:thread/photo", async (c) => {
  const key = c.req.param("thread");
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const now = new Date();
  const th = await resolveThread(db, key, me, now);
  if (!th) return c.text("Not found", 404);
  const body = await c.req.parseBody();
  const file = body.photo instanceof File ? body.photo : null;
  const sent = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(and(eq(chatMessages.thread, th.key), eq(chatMessages.sender, me), eq(chatMessages.kind, "photo"), gte(chatMessages.createdAt, new Date(now.getTime() - DAY))))
    .limit(50);
  const res = checkPhoto(file ? { type: file.type, size: file.size } : null, { kind: parseThread(key)!.kind, met: th.met, open: th.open, sentToday: sent.length });
  if (!res.ok) return renderThread(c, key, EXTRA_TEXT[res.reason], 400);
  const photoKey = `chat/${key.replace(":", "-")}/${crypto.randomUUID()}`;
  await putObject(c.env, photoKey, await file!.arrayBuffer(), { contentType: file!.type });
  const caption = str(body.caption).replace(/\s+/g, " ").trim().slice(0, 140);
  await db.insert(chatMessages).values({ id: newId(), thread: th.key, sender: me, body: caption, kind: "photo", photoKey, createdAt: now });
  await ping(c, key);
  return c.redirect(`/chat/${key}#msgs`);
});

/** A photo, only for members of its thread (checked on every request). Deployed: a short-lived signed URL. */
chatRoutes.get("/chat/:thread/photo/:msgId", async (c) => {
  const key = c.req.param("thread");
  const db = getDb(c.env);
  const th = await resolveThread(db, key, c.var.user!.account.id);
  if (!th) return c.notFound();
  const [m] = await db.select().from(chatMessages).where(and(eq(chatMessages.id, c.req.param("msgId")), inArray(chatMessages.thread, keysOf(th)), isNull(chatMessages.hiddenAt))).limit(1);
  if (!m || m.kind !== "photo" || !m.photoKey) return c.notFound();
  if (c.env.FILES) {
    return new Response(null, { status: 302, headers: { location: await getObjectUrl(c.env, m.photoKey), "cache-control": "private, max-age=60" } });
  }
  const obj = await getObject(c.env, m.photoKey).catch(() => null);
  if (!obj) return c.notFound();
  return new Response(obj.body, { headers: { "content-type": obj.metadata.contentType ?? "application/octet-stream", "cache-control": "private, max-age=60" } });
});

chatRoutes.post("/chat/:thread/poll", async (c) => {
  const key = c.req.param("thread");
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const th = await resolveThread(db, key, me);
  if (!th) return c.text("Not found", 404);
  const body = await c.req.parseBody({ all: true });
  const opts = (Array.isArray(body.options) ? body.options : [body.options]).map((x) => str(x));
  const res = checkPoll(str(body.question), opts, { kind: parseThread(key)!.kind, open: th.open });
  if (!res.ok) return renderThread(c, key, EXTRA_TEXT[res.reason], 400);
  await db.insert(chatMessages).values({ id: newId(), thread: th.key, sender: me, body: res.question, kind: "poll", pollOptions: res.options });
  await ping(c, key);
  return c.redirect(`/chat/${key}#msgs`);
});

chatRoutes.post("/chat/:thread/vote/:msgId", async (c) => {
  const key = c.req.param("thread");
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const th = await resolveThread(db, key, me);
  if (!th) return c.text("Not found", 404);
  const [m] = await db.select().from(chatMessages).where(and(eq(chatMessages.id, c.req.param("msgId")), inArray(chatMessages.thread, keysOf(th)), isNull(chatMessages.hiddenAt))).limit(1);
  if (!m || m.kind !== "poll" || !th.open) return c.redirect(`/chat/${key}`);
  const option = Math.trunc(Number(str((await c.req.parseBody()).option)));
  if (!(option >= 0 && option < (m.pollOptions?.length ?? 0))) return c.redirect(`/chat/${key}`);
  await db.insert(chatVotes).values({ messageId: m.id, accountId: me, option }).onConflictDoUpdate({ target: [chatVotes.messageId, chatVotes.accountId], set: { option } });
  await ping(c, key);
  return c.redirect(`/chat/${key}#msgs`);
});

chatRoutes.post("/chat/:thread/report/:msgId", async (c) => {
  const key = c.req.param("thread");
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const th = await resolveThread(db, key, me);
  if (!th) return c.text("Not found", 404);
  const [m] = await db.select().from(chatMessages).where(and(eq(chatMessages.id, c.req.param("msgId")), inArray(chatMessages.thread, keysOf(th)))).limit(1);
  if (!m || m.sender === me) return c.redirect(`/chat/${key}`);
  const id = newId();
  await db.insert(reports).values({
    id,
    reporter: me,
    targetAccount: m.sender,
    targetMessage: m.id,
    reason: m.moneyFlag ? "spam_scam" : "harassment",
    details: m.kind === "photo" ? `Chat photo (caption: ${m.body.slice(0, 200)})` : m.kind === "poll" ? `Chat poll: ${m.body.slice(0, 500)}` : `Chat message: ${m.body.slice(0, 500)}`,
    severity: m.moneyFlag ? "critical" : "standard",
  });
  await audit(db, me, "chat.report", { type: "report", id });
  const staff = await db.select({ id: accounts.id }).from(accounts).where(and(inArray(accounts.role, ["moderator", "bma_admin"]), eq(accounts.status, "active"))).limit(500);
  if (staff.length) {
    await db.insert(notifications).values(staff.map((s) => ({ id: newId(), accountId: s.id, kind: "report", titleTh: "มีรายงานแชตรอตรวจสอบ", titleEn: "Chat message reported", link: "/admin/moderation" })));
  }
  return c.redirect(`/chat/${key}?notice=reported`);
});

/**
 * Starter chips fill the box. New messages arrive over a receive-only live
 * connection (no polling, SVAGENTS hard rule 10): refetch on connect, on each
 * "chat.changed" signal and when the tab becomes visible. If the connection
 * can't open, retry a few times with a growing delay, then stop.
 */
const CHAT_JS = `(function(){var ta=document.querySelector(".chat-send textarea");document.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-starter]");if(!b||!ta)return;e.preventDefault();ta.value=b.dataset.starter;var d=b.closest("details.sheet");if(d&&window.jgSheet)jgSheet.shut(d,true);ta.focus()});
var box=document.getElementById("msgs");if(!box)return;box.lastElementChild&&box.lastElementChild.scrollIntoView({block:"end"});
function refetch(){if(box.querySelector("details.sheet[open]"))return;fetch(location.pathname,{credentials:"same-origin"}).then(function(r){return r.text()}).then(function(h){var d=new DOMParser().parseFromString(h,"text/html").getElementById("msgs");if(d&&d.innerHTML!==box.innerHTML){box.innerHTML=d.innerHTML;box.lastElementChild&&box.lastElementChild.scrollIntoView({block:"end"})}}).catch(function(){})}
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")refetch()});
var tries=0;function live(){if(!("WebSocket" in window)||tries>5)return;var ws=new WebSocket(location.origin.replace(/^http/,"ws")+location.pathname+"/live");var ka;
ws.onopen=function(){tries=0;refetch();ka=setInterval(function(){ws.readyState===1&&ws.send("ping")},30000)};
ws.onmessage=function(e){if(e.data==="pong")return;try{if(JSON.parse(e.data).type==="chat.changed")refetch()}catch(x){}};
ws.onclose=function(){clearInterval(ka);tries++;setTimeout(live,Math.min(30000,2000*Math.pow(2,tries)))}}
live()})()`;

