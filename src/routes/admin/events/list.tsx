/**
 * Staff events, list part (split from routes/admin/events.tsx, Core Platform C3: a pure move).
 * See ./index.ts for the route list.
 */
import { and, asc, desc, eq, gte, inArray, lt, ne, sql, type SQL } from "drizzle-orm";
import { getDb } from "../../../db";
import { DISTRICTS, label } from "../../../lib/constants";
import { fmtDate } from "../../../lib/i18n";
import { events, registrations } from "../../../schema";
import { countPolicy, rosterAccess, shownCount } from "../../../domain/roster";
import { frozenCounts } from "../../../services/roster";
import { Empty, LinkButton, page, view, TableFilter } from "../../../ui/kit";
import { adminEvents } from "./app";
import { BASE, StatusTag, canCreate, me, scopeWhere } from "./shared";

// ---------------------------------------------------------------- list --

type ListView = "upcoming" | "drafts" | "past";

adminEvents.get("/", async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const a = me(c);
  const db = getDb(c.env);
  const raw = c.req.query("view");
  const which: ListView = raw === "drafts" || raw === "past" ? raw : "upcoming";
  const now = new Date();

  const byView: Record<ListView, SQL | undefined> = {
    upcoming: and(ne(events.status, "draft"), gte(events.endsAt, now)),
    drafts: eq(events.status, "draft"),
    past: and(ne(events.status, "draft"), lt(events.endsAt, now)),
  };
  const rows = await db
    .select()
    .from(events)
    .where(and(byView[which], scopeWhere(a)))
    .orderBy(which === "past" ? desc(events.startsAt) : asc(events.startsAt))
    .limit(100);

  // One grouped query for every event's counts (no N+1).
  const ids = rows.map((r) => r.id);
  const counts = ids.length
    ? await db
        .select({
          eventId: registrations.eventId,
          status: registrations.status,
          n: sql<number>`count(*)`,
          checkedIn: sql<number>`count(${registrations.checkedInAt})`,
        })
        .from(registrations)
        .where(inArray(registrations.eventId, ids))
        .groupBy(registrations.eventId, registrations.status)
        .limit(1000)
    : [];
  const countOf = (id: string, status: string) =>
    counts.filter((x) => x.eventId === id && x.status === status).reduce((s, x) => s + Number(x.n), 0);
  const checkedOf = (id: string) =>
    counts.filter((x) => x.eventId === id && x.status === "confirmed").reduce((s, x) => s + Number(x.checkedIn), 0);
  // Who sees what (src/domain/roster.ts): 💘 events show frozen counts to everyone but their host.
  const policyOf = new Map(rows.map((e) => [e.id, countPolicy(rosterAccess(a, e), e)]));
  const frozen = await frozenCounts(db, rows.filter((e) => policyOf.get(e.id) === "frozen5").map((e) => e.id), now);
  const under10 = t("ไม่ถึง 10", "under 10");
  const shownOf = (id: string, live: number, kind: "booked" | "checkedIn" | "other"): string | number => {
    const policy = policyOf.get(id) ?? "exact";
    if (policy === "frozen5") {
      if (kind === "other") return "-";
      return shownCount(policy, frozen.get(id)?.[kind] ?? 0) ?? under10;
    }
    return shownCount(policy, live) ?? under10;
  };

  const tabs: [ListView, string][] = [
    ["upcoming", t("กำลังจะมาถึง", "Upcoming")],
    ["drafts", t("ฉบับร่าง", "Drafts")],
    ["past", t("ที่ผ่านมา", "Past")],
  ];

  return page(c, { title: t("กิจกรรม", "Events"), admin: true }, (
    <>
      <div class="spread">
        <h1>{t("กิจกรรม", "Events")}</h1>
        {canCreate(a) ? <LinkButton href={`${BASE}/new`}>{t("+ สร้างกิจกรรม", "+ New event")}</LinkButton> : null}
      </div>
      <nav class="row" aria-label={t("มุมมอง", "View")}>
        {tabs.map(([key, text]) => (
          <a href={`${BASE}?view=${key}`} class="chip" aria-current={which === key ? "page" : undefined} style={which === key ? "font-weight:700" : undefined}>
            {text}
          </a>
        ))}
      </nav>
      {rows.length === 0 ? (
        <Empty>{t("ยังไม่มีกิจกรรมในมุมมองนี้", "No events in this view yet")}</Empty>
      ) : (
        <>
        <TableFilter t={t} target="admin-events" label={t("ค้นหาในรายการนี้ (ชื่อ เขต สถานะ)", "Search this list (name, district, status)")} />
        <div class="table-wrap scroll">
          <table id="admin-events">
            <caption class="sr-only">{t("รายการกิจกรรม", "Events")}</caption>
            <thead>
              <tr>
                <th>{t("กิจกรรม", "Event")}</th>
                <th>{t("วันเวลา", "When")}</th>
                <th>{t("เขต", "District")}</th>
                <th>{t("ยืนยัน / ที่นั่ง", "Confirmed / capacity")}</th>
                <th>{t("คิวสำรอง", "Waitlist")}</th>
                <th>{t("เช็กอิน", "Checked in")}</th>
                <th>{t("สถานะ", "Status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr>
                  <td>
                    <a href={`${BASE}/${e.id}`}>{lang === "en" && e.titleEn ? e.titleEn : e.title}</a>
                  </td>
                  <td>{fmtDate(e.startsAt, lang)}</td>
                  <td>{label(DISTRICTS, e.district, lang)}</td>
                  <td>
                    {shownOf(e.id, countOf(e.id, "confirmed"), "booked")} / {e.capacity}
                    {policyOf.get(e.id) === "exact" && countOf(e.id, "offered") ? <small> (+{countOf(e.id, "offered")} {t("เสนอแล้ว", "offered")})</small> : null}
                  </td>
                  <td>{shownOf(e.id, countOf(e.id, "waitlisted"), "other")}</td>
                  <td>{shownOf(e.id, checkedOf(e.id), "checkedIn")}</td>
                  <td>
                    <StatusTag v={v} status={e.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </>
  ));
});


