/**
 * Staff events, operations part (split from routes/admin/events.tsx, Core Platform C3: a pure move).
 * See ./index.ts for the route list.
 */
import { and, asc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { DISTRICTS, VISITBANGKOK_ROUTES, label } from "../../../lib/constants";
import { fmtDate } from "../../../lib/i18n";
import { keysetAll } from "../../../lib/bulk";
import { accounts, buddyPairs, events, profiles, registrations, strikes, talkQuestions } from "../../../schema";
import { refreshWaitlist } from "../../../services/events";
import { announceOpen, eventAnnouncements } from "../../../services/announcements";
import { canAnnounce } from "../../../domain/announcements";
import { AnnounceForm, AnnouncementList } from "../../../ui/announcements";
import { DayStatusForm, EtaSummary } from "../../../ui/day-of";
import { dayOfOpen, dayOfOpensAt, shownDayStatus, shownEta } from "../../../domain/day-of";
import { rosterAccess, seatCode } from "../../../domain/roster";
import { seatCodes } from "../../../services/roster";
import { Button, Card, Empty, Field, LinkButton, Notice, page, Select, Stat, Tag, view, pageOf, Pager } from "../../../ui/kit";
import { adminEvents } from "./app";
import { PROMPTS, registrationStatusLabel } from "./edit";
import {
  ATTENDEE_PAGE,
  BASE,
  SeatConcernForm,
  StatusTag,
  WAITLIST_SHOWN,
  canEdit,
  countsOnlyPage,
  me,
  seatLabel,
  withEvent,
} from "./shared";

// ----------------------------------------------------- operations page --

adminEvents.get(
  "/:id",
  withEvent(async (c, e0, db) => {
    const v = view(c);
    const { t, lang } = v;
    const a = me(c);
    const now = new Date();
    // Names, seat codes or counts only (src/domain/roster.ts).
    const access = rosterAccess(a, e0);
    if (access === "counts") return countsOnlyPage(c, e0, db, access, now);
    const codes = access === "codes";
    // Usernames are for bma_admin only, and never on a 💘 event.
    const isAdmin = a.role === "bma_admin" && !codes;

    // Lazy timer: lapse expired offers and fill free seats on page load.
    let e = e0;
    if (e.status === "published" && e.startsAt.getTime() > now.getTime()) {
      const offers = await refreshWaitlist(c.env, e.id, now);
      if (offers > 0) [e] = await db.select().from(events).where(eq(events.id, e.id)).limit(1);
    }

    // Totals come from one grouped count, never from loading every registration
    // (an event can hold 100,000). The attendee table is paged.
    const { page: ap, offset } = pageOf(c.req.query("ap"), ATTENDEE_PAGE);
    const notWaitlisted = and(eq(registrations.eventId, e.id), ne(registrations.status, "waitlisted"), ne(registrations.status, "requested"));
    const anns = await eventAnnouncements(db, e.id);
    const announcer = canAnnounce(e, a);
    // Requests waiting for the organiser (D57), and a private talk's anonymous questions (D52).
    const [requests, questions] = await Promise.all([
      e.approvalRequired
        ? db
            .select({ id: registrations.id, accountId: registrations.accountId, nickname: profiles.nickname, createdAt: registrations.createdAt })
            .from(registrations)
            .leftJoin(profiles, eq(profiles.accountId, registrations.accountId))
            .where(and(eq(registrations.eventId, e.id), eq(registrations.status, "requested")))
            .orderBy(asc(registrations.createdAt))
            .limit(200)
        : Promise.resolve([] as { id: string; accountId: string; nickname: string | null; createdAt: Date }[]),
      e.talkMode
        ? db.select({ id: talkQuestions.id, body: talkQuestions.body, createdAt: talkQuestions.createdAt }).from(talkQuestions).where(eq(talkQuestions.eventId, e.id)).orderBy(asc(talkQuestions.createdAt)).limit(300)
        : Promise.resolve([] as { id: string; body: string; createdAt: Date }[]),
    ]);
    const [totals, pageRows, waitRows, checked, pairs, hostRow] = await Promise.all([
      db
        .select({
          status: registrations.status,
          n: sql<number>`count(*)`.mapWith(Number),
          checkedIn: sql<number>`count(${registrations.checkedInAt})`.mapWith(Number),
          noShowPending: sql<number>`count(*) filter (where ${registrations.checkedInAt} is null and not ${registrations.noShowRecorded})`.mapWith(Number),
          plusOnes: sql<number>`count(${registrations.plusOneWith})`.mapWith(Number),
        })
        .from(registrations)
        .where(eq(registrations.eventId, e.id))
        .groupBy(registrations.status)
        .limit(20),
      db
        .select({
          id: registrations.id,
          accountId: registrations.accountId,
          status: registrations.status,
          plusOneWith: registrations.plusOneWith,
          wantsBuddy: registrations.wantsBuddy,
          checkedInAt: registrations.checkedInAt,
          checkInMethod: registrations.checkInMethod,
          groupNo: registrations.groupNo,
          noShowRecorded: registrations.noShowRecorded,
          nickname: profiles.nickname,
          // Usernames are for bma_admin only; nobody else even loads them.
          username: isAdmin ? accounts.username : sql<string | null>`null`,
        })
        .from(registrations)
        .innerJoin(accounts, eq(accounts.id, registrations.accountId))
        .leftJoin(profiles, eq(profiles.accountId, registrations.accountId))
        .where(notWaitlisted)
        .orderBy(asc(registrations.createdAt), asc(registrations.id))
        .limit(ATTENDEE_PAGE)
        .offset(offset),
      // The waitlist in the order members see their place in it: first come, first served.
      db
        .select({ id: registrations.id, accountId: registrations.accountId, status: registrations.status, offeredUntil: registrations.offeredUntil, nickname: profiles.nickname })
        .from(registrations)
        .leftJoin(profiles, eq(profiles.accountId, registrations.accountId))
        .where(and(eq(registrations.eventId, e.id), inArray(registrations.status, ["waitlisted", "offered"])))
        .orderBy(asc(registrations.createdAt), asc(registrations.id))
        .limit(WAITLIST_SHOWN),
      // Everyone checked in, for the seating view.
      keysetAll(registrations.id, (after, n) =>
        db
          .select({ id: registrations.id, accountId: registrations.accountId, groupNo: registrations.groupNo, createdAt: registrations.createdAt, nickname: profiles.nickname })
          .from(registrations)
          .leftJoin(profiles, eq(profiles.accountId, registrations.accountId))
          .where(and(eq(registrations.eventId, e.id), eq(registrations.status, "confirmed"), isNotNull(registrations.checkedInAt), after))
          .orderBy(asc(registrations.id))
          .limit(n),
      ),
      db.select().from(buddyPairs).where(eq(buddyPairs.eventId, e.id)).orderBy(asc(buddyPairs.createdAt)).limit(500),
      e.hostAccountId
        ? db.select({ nickname: profiles.nickname }).from(profiles).where(eq(profiles.accountId, e.hostAccountId)).limit(1)
        : Promise.resolve([] as { nickname: string }[]),
    ]);

    const tally = (pick: (r: (typeof totals)[number]) => number, only?: (status: string) => boolean) =>
      totals.filter((r) => !only || only(r.status)).reduce((sum, r) => sum + pick(r), 0);
    const confirmedCount = tally((r) => r.n, (s) => s === "confirmed");
    const checkedCount = tally((r) => r.checkedIn, (s) => s === "confirmed");
    const waitlistedCount = tally((r) => r.n, (s) => s === "waitlisted");
    const waitlistCount = tally((r) => r.n, (s) => s === "waitlisted" || s === "offered");
    const attendingCount = tally((r) => r.n, (s) => s !== "waitlisted" && s !== "requested");
    const anyPlusOne = tally((r) => r.plusOnes, (s) => s !== "waitlisted") > 0;
    const noShowPending = tally((r) => r.noShowPending, (s) => s === "confirmed");
    const ended = now.getTime() >= e.endsAt.getTime();
    const noShows = ended ? confirmedCount - checkedCount : 0;

    const attendeesHref = (n: number) => `${BASE}/${e.id}${n > 1 ? `?ap=${n}` : ""}#attendees`;
    // Past the last page (people cancelled): go to the last one.
    if (pageRows.length === 0 && ap > 1 && attendingCount > 0) return c.redirect(attendeesHref(Math.ceil(attendingCount / ATTENDEE_PAGE)));

    const noName = t("(ไม่มีชื่อ)", "(no name)");
    const nick = new Map<string, string>();
    for (const r of [...pageRows, ...waitRows, ...checked]) nick.set(r.accountId, r.nickname ?? noName);
    // +1 partners and buddies who aren't on this page: look their nicknames up by id.
    const missing = [...new Set([...pageRows.map((r) => r.plusOneWith), ...pairs.flatMap((p) => p.members)])].filter((x): x is string => !!x && !nick.has(x));
    const pageIds = pageRows.map((r) => r.accountId);
    const [extraNicks, strikeRows] = await Promise.all([
      missing.length
        ? db.select({ accountId: profiles.accountId, nickname: profiles.nickname }).from(profiles).where(inArray(profiles.accountId, missing)).limit(missing.length)
        : Promise.resolve([] as { accountId: string; nickname: string }[]),
      // Strikes only for the people on this page.
      pageIds.length
        ? db
            .select({ accountId: strikes.accountId, waivedBy: strikes.waivedBy, reason: strikes.reason })
            .from(strikes)
            .where(and(eq(strikes.eventId, e.id), inArray(strikes.accountId, pageIds)))
            .limit(pageIds.length * 2)
        : Promise.resolve([] as { accountId: string; waivedBy: string | null; reason: string }[]),
    ]);
    for (const x of extraNicks) nick.set(x.accountId, x.nickname ?? noName);
    for (const r of requests) nick.set(r.accountId, r.nickname ?? noName);
    // A 💘 event's host works with seat codes, never names: every label on this page becomes the seat code.
    if (codes) {
      const seat = await seatCodes(db, e.id, [...nick.keys()]);
      for (const id of nick.keys()) nick.set(id, seatLabel(t, seat.get(id)));
    }

    const strikeOf = new Map(strikeRows.map((s) => [s.accountId, s]));
    checked.sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime() || (x.id < y.id ? -1 : 1));
    const groups = new Map<number, typeof checked>();
    for (const r of checked) {
      if (r.groupNo == null) continue;
      groups.set(r.groupNo, [...(groups.get(r.groupNo) ?? []), r]);
    }
    const groupNos = [...groups.keys()].sort((x, y) => x - y);
    const ungrouped = checked.filter((r) => r.groupNo == null);
    // The manual +1 link offers the confirmed people on this page of the list.
    const confirmedHere = pageRows.filter((r) => r.status === "confirmed");
    const editable = canEdit(a, e);
    const title = lang === "en" && e.titleEn ? e.titleEn : e.title;

    // Day-of: the host's status, and who said they're running late or on the way (first names only).
    const dayOpen = dayOfOpen(e, now);
    const etaRows = dayOpen
      ? await db
          .select({ accountId: registrations.accountId, passToken: registrations.passToken, etaStatus: registrations.etaStatus, etaAt: registrations.etaAt, checkedInAt: registrations.checkedInAt, nickname: profiles.nickname })
          .from(registrations)
          .leftJoin(profiles, eq(profiles.accountId, registrations.accountId))
          .where(and(eq(registrations.eventId, e.id), eq(registrations.status, "confirmed"), isNotNull(registrations.etaStatus)))
          .limit(500)
      : [];
    const etaNames = (k: string) =>
      etaRows
        .filter((r) => !r.checkedInAt && shownEta(e, r, now) === k)
        .map((r) => (codes ? seatLabel(t, seatCode(r.passToken)) : ((r.nickname ?? noName).trim().split(/\s+/)[0] ?? noName)));

    const swaps = c.req.query("swaps");
    const isolated = c.req.query("isolated");
    const blockedQ = c.req.query("blocked");

    return page(c, { title, admin: true }, (
      <>
        <p>
          <a href={BASE}>{t("← กิจกรรมทั้งหมด", "← All events")}</a>
        </p>
        <div class="spread">
          <h1>{title}</h1>
          <StatusTag v={v} status={e.status} />
        </div>
        <div class="meta">
          <span>🗓 {fmtDate(e.startsAt, lang)} {t("ถึง", "to")} {fmtDate(e.endsAt, lang)}</span>
          <span>📍 {e.venueName} · {label(DISTRICTS, e.district, lang)}</span>
          <span>👤 {t("โฮสต์", "Host")}: {hostRow[0]?.nickname ?? t("ยังไม่กำหนด", "not assigned")}</span>
          {e.visitBangkokRoute ? <span>🧭 {label(VISITBANGKOK_ROUTES, e.visitBangkokRoute, lang)}</span> : null}
          {e.visibility === "private" ? <span>🔒 {t("ส่วนตัว", "Private")}</span> : null}
        </div>
        {e.visibility === "private" && e.privateToken && (editable || e.hostAccountId === a.id) ? (
          <div class="field">
            <label for="private-link">{t("ลิงก์ส่วนตัว (ส่งให้คนที่ชวนเท่านั้น)", "Private link (send it only to people you invite)")}</label>
            <input id="private-link" type="text" readonly value={`${new URL(c.req.url).origin}/events/${e.id}?t=${encodeURIComponent(e.privateToken)}`} data-select-all="" />
          </div>
        ) : null}
        <div class="row" style="margin:10px 0">
          {e.status !== "cancelled" ? <LinkButton href={`${BASE}/${e.id}/checkin`}>{t("📷 จุดเช็กอิน", "📷 Check-in station")}</LinkButton> : null}
          {editable ? (
            <LinkButton href={`${BASE}/${e.id}/edit`} kind="ghost">
              {t("แก้ไขรายละเอียด", "Edit details")}
            </LinkButton>
          ) : null}
          {editable && e.status === "draft" ? (
            <form method="post" action={`${BASE}/${e.id}/publish`}>
              <Button kind="ghost">{t("เผยแพร่", "Publish")}</Button>
            </form>
          ) : null}
          {editable && e.status !== "cancelled" ? (
            <form method="post" action={`${BASE}/${e.id}/cancel`} data-confirm={t("ยกเลิกกิจกรรมนี้และแจ้งผู้ลงทะเบียนทุกคน?", "Cancel this event and notify every registrant?")}>
              <Button kind="danger">{t("ยกเลิกกิจกรรม", "Cancel event")}</Button>
            </form>
          ) : null}
        </div>

        <div class="stats">
          <Stat label={t("ยืนยัน / ที่นั่ง", "Confirmed / capacity")} value={`${confirmedCount} / ${e.capacity}`} />
          <Stat label={t("คาดว่าจะมา", "Expected")} value={confirmedCount} />
          <Stat label={t("เช็กอินแล้ว", "Checked in")} value={checkedCount} />
          <Stat label={t("ไม่มาตามนัด", "No-shows")} value={ended ? noShows : t("ยังไม่มี", "Not yet")} hint={ended ? undefined : t("นับหลังจบงาน", "Counted after the end")} />
          <Stat label={t("คิวสำรอง", "Waitlist")} value={waitlistedCount} />
        </div>

        {e.approvalRequired ? (
          <>
            <h2 id="requests">{t("คำขอที่นั่ง", "Place requests")}</h2>
            {requests.length === 0 ? (
              <Empty>{t("ยังไม่มีคำขอ", "No requests waiting")}</Empty>
            ) : (
              <ul class="plain">
                {requests.map((r) => (
                  <li class="row">
                    <span>{nick.get(r.accountId)}</span>
                    {e.status === "published" ? (
                      <>
                        <form method="post" action={`${BASE}/${e.id}/requests/${r.id}/approve`} style="display:inline">
                          <Button>{t("อนุมัติ", "Approve")}</Button>
                        </form>
                        <form method="post" action={`${BASE}/${e.id}/requests/${r.id}/decline`} style="display:inline">
                          <Button kind="ghost">{t("ปฏิเสธ", "Decline")}</Button>
                        </form>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
        {e.talkMode ? (
          <>
            <h2 id="questions">{t("คำถามแบบไม่ระบุชื่อ", "Anonymous questions")}</h2>
            <p class="muted">{t("ไม่มีใครรู้ว่าใครถาม รวมถึงทีมงาน", "Nobody, staff included, can see who asked.")}</p>
            {questions.length === 0 ? (
              <Empty>{t("ยังไม่มีคำถาม", "No questions yet")}</Empty>
            ) : (
              <ol>
                {questions.map((q) => (
                  <li>{q.body}</li>
                ))}
              </ol>
            )}
          </>
        ) : null}

        <h2 id="attendees">{t("ผู้เข้าร่วม", "Attendees")}</h2>
        {attendingCount === 0 ? (
          <Empty>{t("ยังไม่มีผู้ลงทะเบียน", "No registrations yet")}</Empty>
        ) : (
          <>
          <Pager t={t} label={t("หน้าของรายชื่อผู้เข้าร่วม", "Attendee list pages")} page={ap} size={ATTENDEE_PAGE} shown={pageRows.length} total={attendingCount} href={attendeesHref} />
          <div class="table-wrap">
            <table>
              <caption class="sr-only">{t("ผู้เข้าร่วม", "Attendees")}</caption>
              <thead>
                <tr>
                  <th>{codes ? t("ที่นั่ง", "Seat") : t("ชื่อเล่น", "Nickname")}</th>
                  {isAdmin ? <th>{t("ชื่อผู้ใช้", "Username")}</th> : null}
                  <th>{t("สถานะ", "Status")}</th>
                  <th>{t("มากับ (+1)", "+1 with")}</th>
                  <th>{t("ขอบัดดี้", "Wants buddy")}</th>
                  <th>{t("เช็กอิน", "Checked in")}</th>
                  <th>{t("โต๊ะ", "Table")}</th>
                  <th>{t("ไม่มาตามนัด", "No-show")}</th>
                  {codes ? <th>{t("ความปลอดภัย", "Safety")}</th> : null}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const s = strikeOf.get(r.accountId);
                  return (
                    <tr>
                      <td>{nick.get(r.accountId)}</td>
                      {isAdmin ? <td>{r.username}</td> : null}
                      <td>{registrationStatusLabel(v, r.status)}</td>
                      <td>{r.plusOneWith ? nick.get(r.plusOneWith) ?? "-" : "-"}</td>
                      <td>{r.wantsBuddy ? t("ใช่", "Yes") : "-"}</td>
                      <td>
                        {r.checkedInAt ? (
                          <>
                            {fmtDate(r.checkedInAt, lang)} <small>({r.checkInMethod === "manual" ? t("พิมพ์รหัส", "manual") : t("สแกน", "scan")})</small>
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>{r.groupNo ?? "-"}</td>
                      <td>
                        {r.noShowRecorded ? (
                          s && !s.waivedBy && s.reason === "no_show" ? (
                            <form method="post" action={`${BASE}/${e.id}/strikes/${r.id}/waive`} class="row">
                              <input type="text" name="reason" required maxlength={200} placeholder={t("เหตุผลที่ยกเว้น", "Reason to waive")} aria-label={t("เหตุผลที่ยกเว้น", "Reason to waive")} />
                              <Button kind="ghost">{t("ยกเว้น", "Waive")}</Button>
                            </form>
                          ) : s?.waivedBy ? (
                            <Tag tone="ok">{t("ยกเว้นแล้ว", "Waived")}</Tag>
                          ) : (
                            <Tag tone="warn">{t("ไม่มาตามนัด", "No-show")}</Tag>
                          )
                        ) : (
                          "-"
                        )}
                      </td>
                      {codes ? (
                        <td>
                          <SeatConcernForm t={t} action={`${BASE}/${e.id}/seat-concern`} registrationId={r.id} />
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}

        <h2>{t("คิวสำรอง", "Waitlist")}</h2>
        {waitRows.length === 0 ? (
          <Empty>{t("ไม่มีใครในคิวสำรอง", "Nobody on the waitlist")}</Empty>
        ) : (
          <>
            <ol>
              {waitRows.map((r) => (
                <li>
                  {nick.get(r.accountId)}{" "}
                  {r.status === "offered" ? (
                    <Tag tone="accent">
                      {t("เสนอที่นั่งแล้ว ยืนยันได้ถึง ", "Offered until ")}
                      {r.offeredUntil ? fmtDate(r.offeredUntil, lang) : ""}
                    </Tag>
                  ) : null}
                </li>
              ))}
            </ol>
            {waitlistCount > waitRows.length ? (
              <p class="muted">{t(`แสดง ${waitRows.length} คนแรกจากทั้งหมด ${waitlistCount} คน`, `Showing the first ${waitRows.length} of ${waitlistCount}`)}</p>
            ) : null}
            <small>{t("ตอนเสนอที่นั่ง ระบบจะใช้สิทธิ์ผู้อยู่อาศัยและกฎใบเตือนมาจัดลำดับด้วย", "Offers apply resident priority and strike rules on top of this order")}</small>
          </>
        )}
        {e.status === "published" && !ended ? (
          <form method="post" action={`${BASE}/${e.id}/waitlist/offer`}>
            <Button kind="ghost">{t("เสนอที่ว่างให้คิวถัดไป", "Offer next spot")}</Button>
          </form>
        ) : null}

        <h2 id="groups">{t("โต๊ะ", "Small groups")}</h2>
        <p>
          <small>
            {t(
              "จัดเฉพาะคนที่เช็กอินแล้ว คู่ +1 ได้นั่งด้วยกัน และคนที่บล็อกกันจะไม่อยู่โต๊ะเดียวกัน",
              "Built from checked-in attendees only. +1 pairs stay together; blocked pairs are never seated together.",
            )}{" "}
            {t(`โต๊ะละ ${e.groupMin} ถึง ${e.groupMax} คน`, `Tables of ${e.groupMin} to ${e.groupMax}.`)}
          </small>
        </p>
        {swaps !== undefined ? (
          <Notice kind={blockedQ && blockedQ !== "0" ? "warn" : "info"}>
            {t("ผลการจัดโต๊ะ: ", "Suggestion quality: ")}
            {t(`คู่ที่ยังอยากสลับโต๊ะ ${swaps}`, `${swaps} blocking swaps`)} · {t(`คนที่ไม่มีภาษาร่วม ${isolated ?? 0}`, `${isolated ?? 0} without a shared language`)}
            {blockedQ && blockedQ !== "0" ? ` · ${t(`คู่ที่บล็อกกันแต่อยู่โต๊ะเดียวกัน ${blockedQ} คู่ ย้ายออกด้วย`, `${blockedQ} blocked pairs share a group. Please move them`)}` : null}
          </Notice>
        ) : null}
        {e.groupsPublishedAt ? (
          <Notice kind="ok">
            {t("เผยแพร่โต๊ะแล้วเมื่อ ", "Groups published ")}
            {fmtDate(e.groupsPublishedAt, lang)} · {t("คนที่มาสายจะได้นั่งโต๊ะที่คนน้อยที่สุดโดยอัตโนมัติ", "late arrivals join the smallest group automatically")}
          </Notice>
        ) : null}
        <div class="grid2">
          {groupNos.map((g) => (
            <Card>
              <h3>
                {t("โต๊ะ", "Table")} {g} <small>({groups.get(g)!.length})</small>
              </h3>
              <ul>
                {groups.get(g)!.map((r) => (
                  <li>{nick.get(r.accountId)}</li>
                ))}
              </ul>
            </Card>
          ))}
          {ungrouped.length ? (
            <Card>
              <h3>{t("ยังไม่มีโต๊ะ", "Not in a group")}</h3>
              <ul>
                {ungrouped.map((r) => (
                  <li>{nick.get(r.accountId)}</li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
        <div class="row">
          <form method="post" action={`${BASE}/${e.id}/groups/suggest`}>
            <Button kind={groupNos.length ? "ghost" : "primary"}>{t("แนะนำโต๊ะ", "Suggest groups")}</Button>
          </form>
          {groupNos.length ? (
            <form method="post" action={`${BASE}/${e.id}/groups/publish`}>
              <Button>{e.groupsPublishedAt ? t("เผยแพร่อีกครั้ง", "Publish again") : t("เผยแพร่โต๊ะ", "Publish groups")}</Button>
            </form>
          ) : null}
        </div>
        {checked.length ? (
          <details>
            <summary>{t("ย้ายคนไปโต๊ะอื่น", "Move someone to another group")}</summary>
            <form method="post" action={`${BASE}/${e.id}/groups/move`}>
              <Select
                label={t("ผู้เข้าร่วม", "Attendee")}
                name="registrationId"
                lang={lang}
                options={checked.map((r) => ({ value: r.id, th: nick.get(r.accountId)!, en: nick.get(r.accountId)! }))}
              />
              <Field label={t("เลขโต๊ะ (เว้นว่าง = ไม่มีโต๊ะ)", "Table number (blank = none)")} name="groupNo" type="number" min={1} max={99} />
              <Button kind="ghost">{t("ย้าย", "Move")}</Button>
            </form>
          </details>
        ) : null}

        {e.status === "published" && !ended ? (
          <>
            <h2 id="day-of">{t("สถานะวันงาน", "On the day")}</h2>
            <DayStatusForm v={v} action={`${BASE}/${e.id}/day-status`} shown={shownDayStatus(e, now)} open={dayOpen} opensAt={fmtDate(dayOfOpensAt(e.startsAt), lang)} />
            {dayOpen ? <EtaSummary t={t} late={etaNames("running_late")} onWay={etaNames("on_my_way")} /> : null}
          </>
        ) : null}

        {announcer && announceOpen(e, now) ? (
          <section class="ann-compose" aria-labelledby="announce">
            <h2 id="announce">{t("ประกาศถึงคนที่มา", "Announce to people going")}</h2>
            <AnnounceForm t={t} e={e} action={`${BASE}/${e.id}/announce`} back={`${BASE}/${e.id}`} />
          </section>
        ) : null}
        <AnnouncementList t={t} lang={lang} items={anns} />

        <h2>{t("คำถามละลายพฤติกรรม", "Icebreaker prompt")}</h2>
        {e.activePrompt ? (
          <Notice kind="info">
            {t("กำลังแสดง: ", "Showing now: ")}
            {e.activePrompt}
          </Notice>
        ) : (
          <p class="muted">{t("ยังไม่มีคำถามที่แสดงอยู่", "No prompt is showing")}</p>
        )}
        <form method="post" action={`${BASE}/${e.id}/prompt`}>
          <fieldset class="choices">
            <legend>{t("เลือกคำถาม", "Choose a prompt")}</legend>
            {PROMPTS.map((p) => (
              <label class="toggle">
                <input type="radio" name="preset" value={p.key} />
                <span>
                  {p.th}
                  <small>{p.en}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <Field label={t("หรือพิมพ์เอง (ไม่เกิน 200 ตัวอักษร)", "Or write your own (max 200)")} name="custom" maxlength={200} />
          <div class="row">
            <Button>{t("แสดงคำถาม", "Show prompt")}</Button>
            {e.activePrompt ? (
              <Button kind="ghost" name="clear" value="1">
                {t("ซ่อนคำถาม", "Clear prompt")}
              </Button>
            ) : null}
          </div>
        </form>

        {e.buddyEnabled ? (
          <>
            <h2>{t("Event Buddy", "Event Buddy")}</h2>
            {pairs.length ? (
              <ul>
                {pairs.map((p) => (
                  <li>{p.members.map((m) => nick.get(m) ?? "-").join(" · ")}</li>
                ))}
              </ul>
            ) : (
              <p class="muted">{e.buddyRoundAt ? t("รอบนี้ไม่มีคู่", "No pairs this round") : t("ยังไม่ได้จับคู่ (ระบบจับคู่เอง 48 ชม. ก่อนงาน)", "Not run yet (runs automatically 48h before)")}</p>
            )}
            {!e.buddyRoundAt && e.status === "published" ? (
              <form method="post" action={`${BASE}/${e.id}/buddies`}>
                <Button kind="ghost">{t("จับคู่บัดดี้ตอนนี้", "Run buddy round now")}</Button>
              </form>
            ) : null}
          </>
        ) : null}

        {e.plusOneAllowed || anyPlusOne ? (
          <details>
            <summary>{t("จับคู่ +1 ด้วยตนเอง", "Link a +1 pair manually")}</summary>
            <form method="post" action={`${BASE}/${e.id}/plusone`}>
              {(["a", "b"] as const).map((k) => (
                <Select
                  label={k === "a" ? t("คนที่ 1", "First person") : t("คนที่ 2", "Second person")}
                  name={k}
                  lang={lang}
                  options={confirmedHere.map((r) => ({ value: r.id, th: nick.get(r.accountId)!, en: nick.get(r.accountId)! }))}
                />
              ))}
              {attendingCount > ATTENDEE_PAGE ? (
                <p>
                  <small>{t("เลือกได้จากคนที่ยืนยันแล้วในหน้านี้ของรายชื่อผู้เข้าร่วม", "Choose from the confirmed people on this page of the attendee list.")}</small>
                </p>
              ) : null}
              <Button kind="ghost">{t("จับคู่", "Link")}</Button>
            </form>
          </details>
        ) : null}

        <h2>{t("คนที่ไม่มาตามนัด", "No-shows")}</h2>
        {ended ? (
          <form
            method="post"
            action={`${BASE}/${e.id}/noshows`}
            data-confirm={
              ((n) =>
                t(
                  `บันทึก ${n} คนเป็นผู้ไม่มาตามนัด? แต่ละคนจะได้ใบเตือน 1 ใบ และได้รับแจ้ง (ยกเว้นให้ได้ภายหลัง)`,
                  `Record ${n} ${n === 1 ? "person" : "people"} as no-shows? Each gets 1 strike and a private notice (you can waive one later).`,
                ))(noShowPending)
            }
          >
            <p>
              <small>
                {t(
                  "คนที่ยืนยันแล้วแต่ไม่ได้เช็กอินจะได้ใบเตือน 1 ใบ (หมดอายุใน 90 วัน) และได้รับแจ้งเป็นการส่วนตัว ยกเว้นให้ได้ในตารางด้านบน",
                  "Confirmed attendees who never checked in get 1 strike (expires in 90 days) and a private notice. You can waive one in the table above.",
                )}
              </small>
            </p>
            <Button kind="danger">{t("บันทึกคนที่ไม่มาตามนัด", "Record no-shows")}</Button>
          </form>
        ) : (
          <p class="muted">{t("บันทึกได้หลังกิจกรรมจบ", "Available after the event ends")}</p>
        )}
      </>
    ));
  }),
);

