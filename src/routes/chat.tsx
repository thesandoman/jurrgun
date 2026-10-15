/**
 * Chat with limits (rules in src/domain/chat.ts).
 *
 *   GET  /chat                         my open threads
 *   GET  /chat/:thread                 one thread (buddy:<id>, conn:<id>, circle:<eventId>)
 *   POST /chat/:thread                 send
 *   POST /chat/:thread/report/:msgId   report a message (goes to the moderation queue)
 *
 *   GET  /chat/:thread/live            receive-only live connection: the page hears
 *                                      "chat.changed" after a new message (no polling)
 *
 * Who may read and write is worked out from the pairing, connection or
 * hangout on every request, so a thread closes by itself when the buddy
 * pairing ends, a connection is removed, someone blocks, or a hangout is a
 * week past. No read receipts, typing indicators or online status.
 */
import { Hono, type Context } from "hono";
import { and, desc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "../db";
import { HANGOUT_OPEN_DAYS, checkMessage, notifyAt, parseThread, REASON_TEXT, shouldNudge, threadKey } from "../domain/chat";
import { newId } from "../lib/crypto";
import type { AppEnv } from "../lib/env";
import { fmtDate, L } from "../lib/i18n";
import { audit } from "../lib/records";
import { requireMember } from "../lib/session";
import { accounts, blocks, buddyMatches, buddyQuests, chatMessages, chatReads, connections, events, notifications, profiles, registrations, reports } from "../schema";
import { PROMPT_BANK } from "../content/profile";
import { getStatefulObject } from "../state";
import { Button, Card, Empty, Notice, page, str, view, type View } from "../ui/kit";

export const chatRoutes = new Hono<AppEnv>();
chatRoutes.use("/chat", requireMember);
chatRoutes.use("/chat/*", requireMember);

const DAY = 86_400_000;
type Db = ReturnType<typeof getDb>;
type C = Context<AppEnv>;

export type Thread = { key: string; members: string[]; open: boolean; met: boolean; title: { th: string; en: string }; back: string };

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

/** The thread, if `me` belongs in it; null otherwise (so nobody can probe ids). */
export async function resolveThread(db: Db, key: string, me: string, now = new Date()): Promise<Thread | null> {
  const t = parseThread(key);
  if (!t) return null;
  if (t.kind === "buddy") {
    const [m] = await db.select().from(buddyMatches).where(eq(buddyMatches.id, t.ref)).limit(1);
    if (!m || (m.aAccount !== me && m.bAccount !== me) || m.state === "proposed") return null;
    const other = m.aAccount === me ? m.bAccount : m.aAccount;
    if ((await blockedBetween(db, me, [other])).size) return null;
    return { key, members: [m.aAccount, m.bAccount], open: m.state === "active", met: await buddiesMet(db, m.id), title: { th: "บัดดี้กรุงเทพฯ", en: "Bangkok Buddy" }, back: "/buddy" };
  }
  if (t.kind === "conn") {
    const [cn] = await db.select().from(connections).where(eq(connections.id, t.ref)).limit(1);
    if (!cn || (cn.aAccount !== me && cn.bAccount !== me)) return null;
    const other = cn.aAccount === me ? cn.bAccount : cn.aAccount;
    if ((await blockedBetween(db, me, [other])).size) return null;
    // Connections from an event: you met there. From a buddy pairing: met once a quest is done together.
    const met = cn.eventId.startsWith("buddy:") ? await buddiesMet(db, cn.eventId.slice(6)) : true;
    return { key, members: [cn.aAccount, cn.bAccount], open: !cn.removedAt, met, title: { th: "คนรู้จัก", en: "Circle" }, back: "/connections" };
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
    title: { th: e.title, en: e.titleEn ?? e.title },
    back: `/events/${e.id}`,
  };
}

/** The threads `me` is in right now, newest activity first. */
async function myThreads(db: Db, me: string, now: Date): Promise<string[]> {
  const [matches, conns, regs, hosted] = await Promise.all([
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
  ]);
  return [
    ...matches.map((m) => `buddy:${m.id}`),
    ...conns.map((c) => `conn:${c.id}`),
    ...[...new Set([...regs, ...hosted].map((e) => e.id))].map((id) => `circle:${id}`),
  ];
}

chatRoutes.get("/chat", async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const now = new Date();
  const keys = await myThreads(db, me, now);
  const threads = (await Promise.all(keys.map((k) => resolveThread(db, k, me, now)))).filter((x): x is Thread => !!x);
  const others = [...new Set(threads.flatMap((th) => th.members).filter((x) => x !== me))];
  const [names, lasts, reads] = await Promise.all([
    others.length ? db.select({ id: profiles.accountId, nickname: profiles.nickname }).from(profiles).where(inArray(profiles.accountId, others)).limit(others.length) : [],
    keys.length
      ? db.select({ thread: chatMessages.thread, body: chatMessages.body, createdAt: chatMessages.createdAt, sender: chatMessages.sender }).from(chatMessages).where(and(inArray(chatMessages.thread, keys), isNull(chatMessages.hiddenAt))).orderBy(desc(chatMessages.createdAt)).limit(500)
      : [],
    db.select().from(chatReads).where(eq(chatReads.accountId, me)).limit(200),
  ]);
  const nameOf = new Map(names.map((n) => [n.id, n.nickname]));
  const lastOf = new Map<string, (typeof lasts)[number]>();
  for (const m of lasts) if (!lastOf.has(m.thread)) lastOf.set(m.thread, m);
  const readOf = new Map(reads.map((r) => [r.thread, r.lastReadAt.getTime()]));
  const rows = threads
    .map((th) => ({ th, last: lastOf.get(th.key) }))
    .sort((a, b) => (b.last?.createdAt.getTime() ?? 0) - (a.last?.createdAt.getTime() ?? 0));
  return page(
    c,
    { title: t("แชต", "Chats"), tab: "connections" },
    <>
      <h1>💬 {t("แชต", "Chats")}</h1>
      <p class="muted">{t("คุยสั้น ๆ แล้วนัดเจอกันจริง ไม่มีสถานะออนไลน์หรือการอ่านแล้ว", "Short chats that lead to meeting. No online status, no read receipts.")}</p>
      {rows.length === 0 ? (
        <Empty>{t("ยังไม่มีแชต แชตเปิดเมื่อมีบัดดี้ คนรู้จัก หรือแฮงเอาต์ของวง", "No chats yet. They open with a buddy, a circle connection or a circle hangout.")}</Empty>
      ) : (
        <ul class="chat-list">
          {rows.map(({ th, last }) => {
            const who = th.members.filter((x) => x !== me).map((x) => nameOf.get(x) ?? "?");
            const unread = !!last && last.sender !== me && last.createdAt.getTime() > (readOf.get(th.key) ?? 0);
            return (
              <li>
                <a href={`/chat/${th.key}`} class={unread ? "unread" : undefined}>
                  <b aria-hidden="true">{th.key.startsWith("buddy") ? "🤝" : th.key.startsWith("circle") ? "👥" : "💬"}</b>
                  <span>
                    <strong>{th.key.startsWith("circle") ? L(lang, th.title) : who.join(", ")}</strong>
                    <small>{last ? last.body.slice(0, 70) : t("ยังไม่มีข้อความ", "No messages yet")}</small>
                  </span>
                  {!th.open ? <small class="muted">{t("ปิดแล้ว", "Closed")}</small> : unread ? <i class="dot" aria-label={t("ใหม่", "New")} /> : null}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>,
  );
});

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
  const others = th.members.filter((x) => x !== me);
  const hide = await blockedBetween(db, me, others);
  const [msgs, names] = await Promise.all([
    db.select().from(chatMessages).where(and(eq(chatMessages.thread, key), isNull(chatMessages.hiddenAt))).orderBy(desc(chatMessages.createdAt)).limit(120),
    db.select({ id: profiles.accountId, nickname: profiles.nickname }).from(profiles).where(inArray(profiles.accountId, th.members)).limit(th.members.length),
  ]);
  const visible = msgs.filter((m) => !hide.has(m.sender)).reverse();
  const nameOf = new Map(names.map((n) => [n.id, n.nickname]));
  await db
    .insert(chatReads)
    .values({ thread: key, accountId: me, lastReadAt: now })
    .onConflictDoUpdate({ target: [chatReads.thread, chatReads.accountId], set: { lastReadAt: now } });
  const title = th.key.startsWith("circle") ? L(lang, th.title) : others.map((x) => nameOf.get(x) ?? "?").join(", ");
  return page(
    c,
    { title: t("แชต", "Chat"), tab: "connections", status },
    <>
      <p class="spread">
        <a href="/chat">← {t("แชต", "Chats")}</a>
        <a href={th.back}>{L(lang, th.title)}</a>
      </p>
      <h1>{title}</h1>
      {c.req.query("notice") === "reported" ? (
        <Notice kind="ok">{t("ได้รับรายงานแล้ว ทีมงานจะตรวจสอบ ถ้าไม่อยากคุยต่อ บล็อกได้จากหน้าคนรู้จัก", "Reported. Our team will review it. You can block from your circle if you'd rather not talk.")}</Notice>
      ) : null}
      {!th.met ? (
        <Notice kind="info">
          {t(
            "ยังไม่ได้เจอกัน: ส่งลิงก์ เบอร์ หรือไอดีไม่ได้ และมีคนละ 25 ข้อความ นัดเจอในที่สาธารณะตอนกลางวันก่อนนะ",
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
          <li class={m.sender === me ? "mine" : undefined}>
            {m.sender !== me && th.members.length > 2 ? <small class="who">{nameOf.get(m.sender) ?? "?"}</small> : null}
            {m.moneyFlag && m.sender !== me ? (
              <p class="chat-warn">⚠️ {t("ข้อความนี้พูดถึงเงิน อย่าโอนเงินให้คนที่เพิ่งรู้จัก", "This mentions money. Never send money to someone you've just met.")}</p>
            ) : null}
            <p class="bubble">{m.body}</p>
            <small class="when">
              {fmtDate(m.createdAt, lang)}
              {m.sender !== me ? (
                <form method="post" action={`/chat/${key}/report/${m.id}`} class="inline">
                  <button class="linkish">{t("รายงาน", "Report")}</button>
                </form>
              ) : null}
            </small>
          </li>
        ))}
      </ol>
      {visible.length === 0 ? <p class="muted">{t("เริ่มด้วยคำถามข้างล่างก็ได้", "Start with one of these.")}</p> : null}
      {th.open ? (
        <form method="post" action={`/chat/${key}`} class="chat-send">
          {visible.length < 3 ? (
          <p class="chat-starters">
            {starters(key, now).map((p) => (
              <button type="button" data-starter={lang === "en" ? p.en : p.th}>
                {p.emoji} {lang === "en" ? p.en : p.th}
              </button>
            ))}
          </p>
          ) : null}
          {error ? <Notice kind="warn">{L(lang, error)}</Notice> : null}
          <textarea name="body" rows={1} maxlength={500} required aria-label={t("ข้อความ", "Message")} placeholder={t("พิมพ์ข้อความ…", "Write a message…")} />
          <Button>{t("ส่ง", "Send")}</Button>
        </form>
      ) : (
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
    db.select({ id: chatMessages.id }).from(chatMessages).where(and(eq(chatMessages.thread, key), eq(chatMessages.sender, me), gte(chatMessages.createdAt, dayStart))).limit(200),
    db.select({ id: chatMessages.id }).from(chatMessages).where(and(eq(chatMessages.sender, me), gte(chatMessages.createdAt, dayStart))).limit(500),
    db.select({ id: chatMessages.id }).from(chatMessages).where(and(eq(chatMessages.thread, key), eq(chatMessages.sender, me))).limit(200),
  ]);
  const res = checkMessage(str((await c.req.parseBody()).body), {
    met: th.met,
    open: th.open,
    sentToday: mineToday.length,
    sentTodayAll: mineAllToday.length,
    sentInThread: mineInThread.length,
  });
  if (!res.ok) return renderThread(c, key, REASON_TEXT[res.reason], 400);
  await db.insert(chatMessages).values({ id: newId(), thread: key, sender: me, body: res.body, moneyFlag: res.moneyFlag, createdAt: now });
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
    await db.insert(notifications).values(fresh.map((accountId) => ({ id: newId(), accountId, kind: "chat", titleTh: "มีข้อความใหม่", titleEn: "New message", link, createdAt: due })));
  }
  await db.insert(chatReads).values({ thread: key, accountId: me, lastReadAt: now }).onConflictDoUpdate({ target: [chatReads.thread, chatReads.accountId], set: { lastReadAt: now } });
  // Tell open pages in this thread to refetch. Never fail the send over it.
  try {
    const feed = await getStatefulObject(c.env, `chat:${th.key}`);
    await feed.publish({ type: "chat.changed" }).catch(() => {});
  } catch {
    /* local dev: no live objects */
  }
  return c.redirect(`/chat/${key}#msgs`);
});

chatRoutes.post("/chat/:thread/report/:msgId", async (c) => {
  const key = c.req.param("thread");
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const th = await resolveThread(db, key, me);
  if (!th) return c.text("Not found", 404);
  const [m] = await db.select().from(chatMessages).where(and(eq(chatMessages.id, c.req.param("msgId")), eq(chatMessages.thread, key))).limit(1);
  if (!m || m.sender === me) return c.redirect(`/chat/${key}`);
  const id = newId();
  await db.insert(reports).values({
    id,
    reporter: me,
    targetAccount: m.sender,
    targetMessage: m.id,
    reason: m.moneyFlag ? "spam_scam" : "harassment",
    details: `Chat message: ${m.body.slice(0, 500)}`,
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
const CHAT_JS = `(function(){var ta=document.querySelector(".chat-send textarea");document.querySelectorAll("[data-starter]").forEach(function(b){b.addEventListener("click",function(){if(ta){ta.value=b.dataset.starter;ta.focus()}})});
var box=document.getElementById("msgs");if(!box)return;box.lastElementChild&&box.lastElementChild.scrollIntoView({block:"end"});
function refetch(){fetch(location.pathname,{credentials:"same-origin"}).then(function(r){return r.text()}).then(function(h){var d=new DOMParser().parseFromString(h,"text/html").getElementById("msgs");if(d&&d.innerHTML!==box.innerHTML){box.innerHTML=d.innerHTML;box.lastElementChild&&box.lastElementChild.scrollIntoView({block:"end"})}}).catch(function(){})}
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")refetch()});
var tries=0;function live(){if(!("WebSocket" in window)||tries>5)return;var ws=new WebSocket(location.origin.replace(/^http/,"ws")+location.pathname+"/live");var ka;
ws.onopen=function(){tries=0;refetch();ka=setInterval(function(){ws.readyState===1&&ws.send("ping")},30000)};
ws.onmessage=function(e){if(e.data==="pong")return;try{if(JSON.parse(e.data).type==="chat.changed")refetch()}catch(x){}};
ws.onclose=function(){clearInterval(ka);tries++;setTimeout(live,Math.min(30000,2000*Math.pow(2,tries)))}}
live()})()`;

