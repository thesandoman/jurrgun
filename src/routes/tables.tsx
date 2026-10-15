/**
 * Regular tables (โต๊ะประจำ): the recurring group a Table Host (เจ้าภาพโต๊ะ)
 * leads. Rules in src/domain/regular-tables.ts, data in
 * src/services/regular-tables.ts.
 *
 *   GET  /tables                    My regular tables (and, for a Table Host without one, open it)
 *   POST /tables/start              a Table Host opens their regular table
 *   GET  /tables/:id                the table: members see everything, others name, host, district and join
 *   POST /tables/:id/join           join, with the invite link (t) or after a hangout with the host
 *   POST /tables/:id/leave          leave, any time
 *   POST /tables/:id/edit           host: name, district, a short description, women-only
 *   POST /tables/:id/link/reset     host: a new invite link; the old one stops working
 *
 * The table's group chat is the thread `table:<id>` in src/routes/chat.tsx,
 * open only to the host and current members.
 */
import { Hono, type Context } from "hono";
import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";
import { batch, getDb } from "../db";
import { canJoin, canSetWomenOnly, DESCRIPTION_MAX, JOIN_TEXT, MAX_MEMBERS, NAME_MAX, tableVisible } from "../domain/regular-tables";
import { DISTRICTS, districtsAZ, label } from "../lib/constants";
import { randomToken, safeEqual } from "../lib/crypto";
import type { AppEnv } from "../lib/env";
import { fmtDate } from "../lib/i18n";
import { audit, notify } from "../lib/records";
import { requireMember } from "../lib/session";
import { circleHeadRequests, events, profiles, regularTableMembers, regularTables, type RegularTable } from "../schema";
import { blockedAmong, getTable, hostTable, memberIds, myTables, newTable, standing, wentWithHost } from "../services/regular-tables";
import { newId } from "../lib/crypto";
import { Button, Card, Empty, Field, LinkButton, Notice, page, Select, str, Tag, TextArea, Toggle, view } from "../ui/kit";

export const tableRoutes = new Hono<AppEnv>();
tableRoutes.use("/tables", requireMember);
tableRoutes.use("/tables/*", requireMember);

type C = Context<AppEnv>;
type Db = ReturnType<typeof getDb>;

const nicknames = async (db: Db, ids: string[]) =>
  ids.length ? await db.select({ id: profiles.accountId, nickname: profiles.nickname }).from(profiles).where(inArray(profiles.accountId, ids)).limit(ids.length) : [];

const inviteLink = (c: C, t: RegularTable) => `${new URL(c.req.url).origin}/tables/${t.id}?t=${encodeURIComponent(t.joinToken)}`;

// ---------------------------------------------------------- my tables --

tableRoutes.get("/tables", async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const db = getDb(c.env);
  const user = c.var.user!;
  const me = user.account.id;
  const tables = await myTables(db, me);
  const hosting = tables.some((x) => x.hosting);
  const isTableHost = user.account.role === "circle_head";
  const [lastApproved] =
    isTableHost && !hosting
      ? await db
          .select({ name: circleHeadRequests.circleName })
          .from(circleHeadRequests)
          .where(and(eq(circleHeadRequests.accountId, me), eq(circleHeadRequests.status, "approved")))
          .orderBy(asc(circleHeadRequests.createdAt))
          .limit(1)
      : [];
  return page(
    c,
    { title: t("โต๊ะประจำของฉัน", "My regular tables"), tab: "connections" },
    <>
      <p>
        <a href="/connections">← {t("คนรู้จัก", "My people")}</a>
      </p>
      <h1>👥 {t("โต๊ะประจำของฉัน", "My regular tables")}</h1>
      <p class="muted">{t("กลุ่มเล็ก ๆ ที่นัดเจอกันบ่อย ๆ มีเจ้าภาพโต๊ะคอยชวน", "Small groups that keep meeting, with a Table Host who brings everyone together.")}</p>
      {c.req.query("notice") === "left" ? <Notice kind="ok">{t("ออกจากโต๊ะแล้ว อยากกลับมาเมื่อไหร่ ขอลิงก์ชวนจากเจ้าภาพได้เลย", "You've left the table. Ask the host for the invite link if you'd like to come back.")}</Notice> : null}
      {isTableHost && !hosting ? (
        <Card>
          <h2 style="margin-top:0">{t("เปิดโต๊ะประจำของคุณ", "Open your regular table")}</h2>
          <form method="post" action="/tables/start">
            <Field label={t("ชื่อโต๊ะประจำ", "Regular table name")} name="name" value={lastApproved?.name ?? ""} maxlength={NAME_MAX} required />
            <Select label={t("เขต", "District")} name="district" options={districtsAZ(lang)} value={user.profile?.district} lang={lang} required />
            <Button>{t("เปิดโต๊ะ", "Open the table")}</Button>
          </form>
        </Card>
      ) : null}
      {tables.length === 0 ? (
        <Card>
          <Empty>{t("ยังไม่มีโต๊ะประจำ ไปแฮงเอาต์กับเจ้าภาพโต๊ะสักครั้ง หรือขอลิงก์ชวนจากเขาได้เลย", "No regular tables yet. Go to a hangout with a Table Host, or ask one for their invite link.")}</Empty>
          {isTableHost ? null : <LinkButton href="/circles/lead" kind="ghost">👑 {t("เป็นเจ้าภาพโต๊ะประจำ", "Host a regular table")}</LinkButton>}
        </Card>
      ) : (
        tables.map((x) => (
          <Card href={`/tables/${x.id}`}>
            <div class="spread">
              <strong>{x.name}</strong>
              {x.hosting ? <Tag tone="accent">👑 {t("เจ้าภาพโต๊ะ", "Table Host")}</Tag> : null}
            </div>
            <p class="muted" style="margin:4px 0 0">
              {label(DISTRICTS, x.district, lang)}
              {x.womenOnly ? ` · ${t("เฉพาะผู้หญิงและนอนไบนารี", "Women and non-binary only")}` : ""}
            </p>
          </Card>
        ))
      )}
    </>,
  );
});

tableRoutes.post("/tables/start", async (c) => {
  const user = c.var.user!;
  if (user.account.role !== "circle_head") return c.redirect("/circles/lead");
  const db = getDb(c.env);
  if (await hostTable(db, user.account.id)) return c.redirect("/tables");
  const body = await c.req.parseBody();
  const name = str(body.name).replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  const district = DISTRICTS.some((d) => d.value === str(body.district)) ? str(body.district) : (user.profile?.district ?? "");
  if (!name || !district) return c.redirect("/tables");
  const made = newTable(db, { hostAccountId: user.account.id, name, district });
  await batch(c.env, [made.query, audit(db, user.account.id, "regular_table.open", { type: "regular_table", id: made.id })]);
  return c.redirect(`/tables/${made.id}`);
});

// ------------------------------------------------------------ one table --

/** The table and where the viewer stands, or null when it's hidden from them. */
async function load(c: C) {
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const table = await getTable(db, c.req.param("id") ?? "");
  if (!table) return null;
  const st = await standing(db, table, me);
  if (!st.isHost && !tableVisible(table, c.var.user!.profile ?? {}, st.blockedWithHost)) return null;
  return { db, me, table, st };
}

/** Join check for someone not at the table yet. */
async function joinCheck(c: C, db: Db, table: RegularTable, me: string, token: string) {
  const members = await memberIds(db, table.id);
  const [blocked, went] = await Promise.all([blockedAmong(db, me, [table.hostAccountId, ...members]), wentWithHost(db, table.hostAccountId, me)]);
  const invited = (!!token && safeEqual(token, table.joinToken)) || went;
  return canJoin({
    archived: !!table.archivedAt,
    isHost: table.hostAccountId === me,
    invited,
    blocked: blocked.size > 0,
    womenOnly: table.womenOnly,
    viewer: c.var.user!.profile ?? {},
    memberCount: members.length,
  });
}

function notFound(c: C) {
  const { t } = view(c);
  return page(
    c,
    { title: t("ไม่พบโต๊ะประจำ", "Regular table not found"), tab: "connections", status: 404 },
    <>
      <h1>{t("ไม่พบโต๊ะประจำนี้", "We couldn't find that regular table")}</h1>
      <LinkButton href="/tables" kind="ghost">← {t("โต๊ะประจำของฉัน", "My regular tables")}</LinkButton>
    </>,
  );
}

tableRoutes.get("/tables/:id", async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const got = await load(c);
  if (!got) return notFound(c);
  const { db, me, table, st } = got;
  const [hostRow] = await nicknames(db, [table.hostAccountId]);
  const hostName = hostRow?.nickname ?? "";
  const head = (
    <>
      <p>
        <a href="/tables">← {t("โต๊ะประจำของฉัน", "My regular tables")}</a>
      </p>
      <p class="eyebrow">👥 {t("โต๊ะประจำ", "Regular Table")}</p>
      <h1>{table.name}</h1>
      <p class="muted">
        👑 {t(`เจ้าภาพโต๊ะ: ${hostName}`, `Table Host: ${hostName}`)} · 📍 {label(DISTRICTS, table.district, lang)}
        {table.womenOnly ? ` · ${t("เฉพาะผู้หญิงและนอนไบนารี", "Women and non-binary only")}` : ""}
      </p>
    </>
  );

  if (!st.isMember) {
    const token = c.req.query("t") ?? "";
    const check = await joinCheck(c, db, table, me, token);
    return page(
      c,
      { title: table.name, tab: "connections" },
      <>
        {head}
        <Card>
          {check.ok ? (
            <form method="post" action={`/tables/${table.id}/join`}>
              <input type="hidden" name="t" value={token} />
              <h2 style="margin-top:0">{t("มานั่งโต๊ะเดียวกันไหม", "Pull up a chair?")}</h2>
              <p class="muted">{t("คนในโต๊ะจะได้ชวนกันไปแฮงเอาต์ และคุยกันในแชตของโต๊ะ ออกได้ทุกเมื่อ", "You'll get the table's hangouts and its group chat. Leave any time.")}</p>
              <Button>{t("เข้าร่วมโต๊ะประจำ", "Join this regular table")}</Button>
            </form>
          ) : (
            <p class="muted" style="margin:0">{t(JOIN_TEXT[check.reason].th, JOIN_TEXT[check.reason].en)}</p>
          )}
        </Card>
      </>,
    );
  }

  const now = new Date();
  const ids = await memberIds(db, table.id);
  const [hidden, names, hangouts] = await Promise.all([
    blockedAmong(db, me, ids),
    nicknames(db, ids),
    db
      .select()
      .from(events)
      .where(and(eq(events.regularTableId, table.id), eq(events.status, "published"), gt(events.endsAt, now)))
      .orderBy(asc(events.startsAt))
      .limit(10),
  ]);
  const seen = ids.filter((id) => !hidden.has(id) && id !== me);
  const nameOf = new Map(names.map((n) => [n.id, n.nickname]));
  const hostProfile = st.isHost ? c.var.user!.profile : null;
  const notice = c.req.query("notice");
  return page(
    c,
    { title: table.name, tab: "connections" },
    <>
      {notice === "joined" ? <Notice kind="ok">{t(`ยินดีต้อนรับสู่โต๊ะ "${table.name}" แล้วเจอกันนะ`, `Welcome to "${table.name}". See you there.`)}</Notice> : null}
      {notice === "link_reset" ? <Notice kind="ok">{t("สร้างลิงก์ใหม่แล้ว ลิงก์เดิมใช้ไม่ได้อีก", "New invite link made. The old one no longer works.")}</Notice> : null}
      {head}
      {table.description ? <p>{table.description}</p> : null}
      <p class="row">
        <LinkButton href={`/chat/table:${table.id}`}>💬 {t("แชตของโต๊ะ", "Table chat")}</LinkButton>
        {st.isHost ? (
          <LinkButton href="/host/new?table=1" kind="ghost">
            ＋ {t("ชวนโต๊ะไปแฮงเอาต์", "Plan a hangout for the table")}
          </LinkButton>
        ) : null}
      </p>

      <h2>🗓️ {t("แฮงเอาต์ที่กำลังจะมา", "Coming up")}</h2>
      {hangouts.length ? (
        hangouts.map((e) => (
          <Card href={`/events/${e.id}`}>
            <strong>{lang === "en" && e.titleEn ? e.titleEn : e.title}</strong>
            <p class="muted" style="margin:4px 0 0">
              {fmtDate(e.startsAt, lang)} · {e.venueName} · {label(DISTRICTS, e.district, lang)}
            </p>
          </Card>
        ))
      ) : (
        <p class="muted">{st.isHost ? t("ยังไม่มีแฮงเอาต์ ชวนทุกคนสักนัดไหม", "No hangouts yet. Plan one for everyone?") : t("ยังไม่มีแฮงเอาต์ เดี๋ยวเจ้าภาพชวนนะ", "No hangouts yet. Your host will invite you soon.")}</p>
      )}

      <h2>🫂 {t(`คนในโต๊ะ ${ids.length} คน`, `${ids.length} ${ids.length === 1 ? "person" : "people"} at the table`)}</h2>
      <p>
        {[`👑 ${hostName}`, ...seen.map((id) => nameOf.get(id) ?? "")].filter(Boolean).join(" · ")}
        {st.isHost ? null : ` · ${t("คุณ", "you")}`}
      </p>
      <p class="muted">{t(`โต๊ะหนึ่งนั่งได้ไม่เกิน ${MAX_MEMBERS} คน`, `Up to ${MAX_MEMBERS} people per regular table.`)}</p>

      {st.isHost ? (
        <>
          <Card>
            <div class="field">
              <label for="invite">{t("ลิงก์ชวนเข้าโต๊ะ (ส่งให้คนที่อยากชวนเท่านั้น)", "Invite link (send it only to people you'd like at your table)")}</label>
              <input id="invite" type="text" readonly value={inviteLink(c, table)} onfocus="this.select()" />
            </div>
            <p class="muted">{t("คนที่เคยไปแฮงเอาต์กับคุณ เข้าโต๊ะได้จากหน้ากิจกรรมนั้นเลย", "People who've been to one of your hangouts can join from that event's page.")}</p>
            <form method="post" action={`/tables/${table.id}/link/reset`}>
              <Button kind="ghost">{t("สร้างลิงก์ใหม่", "New link")}</Button>
            </form>
          </Card>
          <Card>
            <h2 style="margin-top:0">{t("แก้ไขโต๊ะ", "Edit the table")}</h2>
            <form method="post" action={`/tables/${table.id}/edit`}>
              <Field label={t("ชื่อโต๊ะประจำ", "Regular table name")} name="name" value={table.name} maxlength={NAME_MAX} required />
              <Select label={t("เขต", "District")} name="district" options={districtsAZ(lang)} value={table.district} lang={lang} required />
              <TextArea label={t("เล่าสั้น ๆ ว่าโต๊ะนี้ทำอะไรกัน", "A line about your table")} name="description" value={table.description} rows={2} maxlength={DESCRIPTION_MAX} />
              {hostProfile && canSetWomenOnly(hostProfile) ? (
                <Toggle
                  name="womenOnly"
                  label={t("เฉพาะผู้หญิงและนอนไบนารี", "Women and non-binary only")}
                  checked={table.womenOnly}
                  hint={t("ใช้กับคนที่จะเข้าใหม่ คนที่อยู่ในโต๊ะแล้วยังอยู่ต่อ", "Applies to new members. People already at the table stay.")}
                />
              ) : null}
              <Button>{t("บันทึก", "Save")}</Button>
            </form>
          </Card>
        </>
      ) : (
        <form method="post" action={`/tables/${table.id}/leave`}>
          <p class="muted">{t("ออกได้ทุกเมื่อ ไม่มีใครได้รับแจ้ง", "You can leave any time. Nobody is notified.")}</p>
          <Button kind="ghost">{t("ออกจากโต๊ะ", "Leave the table")}</Button>
        </form>
      )}
    </>,
  );
});

tableRoutes.post("/tables/:id/join", async (c) => {
  const got = await load(c);
  if (!got) return notFound(c);
  const { db, me, table, st } = got;
  if (st.isMember) return c.redirect(`/tables/${table.id}`);
  const token = str((await c.req.parseBody()).t);
  const check = await joinCheck(c, db, table, me, token);
  if (!check.ok) return c.redirect(`/tables/${table.id}${token ? `?t=${encodeURIComponent(token)}` : ""}`);
  const now = new Date();
  const nick = c.var.user!.profile?.nickname ?? "";
  await batch(c.env, [
    db
      .insert(regularTableMembers)
      .values({ id: newId(), tableId: table.id, accountId: me, joinedAt: now })
      .onConflictDoUpdate({ target: [regularTableMembers.tableId, regularTableMembers.accountId], set: { leftAt: null, joinedAt: now } }),
    notify(db, table.hostAccountId, "table_join", `${nick} มานั่งโต๊ะ "${table.name}" แล้ว`, `${nick} joined "${table.name}"`, `/tables/${table.id}`),
    audit(db, me, "regular_table.join", { type: "regular_table", id: table.id }),
  ]);
  return c.redirect(`/tables/${table.id}?notice=joined`);
});

tableRoutes.post("/tables/:id/leave", async (c) => {
  const got = await load(c);
  if (!got || got.st.isHost) return c.redirect("/tables");
  const { db, me, table } = got;
  await batch(c.env, [
    db
      .update(regularTableMembers)
      .set({ leftAt: new Date() })
      .where(and(eq(regularTableMembers.tableId, table.id), eq(regularTableMembers.accountId, me), isNull(regularTableMembers.leftAt))),
    audit(db, me, "regular_table.leave", { type: "regular_table", id: table.id }),
  ]);
  return c.redirect("/tables?notice=left");
});

tableRoutes.post("/tables/:id/edit", async (c) => {
  const got = await load(c);
  if (!got || !got.st.isHost) return c.redirect("/tables");
  const { db, me, table } = got;
  const body = await c.req.parseBody();
  const name = str(body.name).replace(/\s+/g, " ").trim().slice(0, NAME_MAX) || table.name;
  const district = DISTRICTS.some((d) => d.value === str(body.district)) ? str(body.district) : table.district;
  const description = str(body.description).replace(/\s+/g, " ").trim().slice(0, DESCRIPTION_MAX);
  // Only a woman or non-binary host may switch women-only on; anyone may leave it as it is or switch it off.
  const asked = str(body.womenOnly) === "1";
  const womenOnly = asked ? table.womenOnly || canSetWomenOnly(c.var.user!.profile ?? {}) : false;
  await batch(c.env, [
    db.update(regularTables).set({ name, district, description, womenOnly }).where(eq(regularTables.id, table.id)),
    audit(db, me, "regular_table.edit", { type: "regular_table", id: table.id }),
  ]);
  return c.redirect(`/tables/${table.id}?notice=saved`);
});

tableRoutes.post("/tables/:id/link/reset", async (c) => {
  const got = await load(c);
  if (!got || !got.st.isHost) return c.redirect("/tables");
  const { db, me, table } = got;
  await batch(c.env, [
    db.update(regularTables).set({ joinToken: randomToken(18) }).where(eq(regularTables.id, table.id)),
    // The audit records that a reset happened, never the link itself.
    audit(db, me, "regular_table.link_reset", { type: "regular_table", id: table.id }),
  ]);
  return c.redirect(`/tables/${table.id}?notice=link_reset`);
});
