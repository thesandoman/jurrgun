/**
 * Hosting: only admins, verified partners (partner admins and verified
 * partner hosts) and approved circle heads can host (domain/hosting.ts
 * canHost). Everyone else is pointed to /circles/lead to ask to lead a circle.
 *
 *   GET  /host                          my hosted events, with status and private links
 *   GET  /host/new   POST /host/new     propose an event
 *   GET  /host/:id/edit  POST …/edit    change a proposal (draft, waiting or sent back)
 *   POST /host/:id/withdraw             take a proposal back (it becomes a draft)
 *   POST /host/:id/private-link/reset   new private link; the old one stops working
 *   POST /host/:id/table                send a hangout to my regular table (again: only new members get it)
 *   POST /host/:id/circle               send a private hangout to my people (connections) instead
 *   GET  /host/inbox                    outside events waiting for a go-together group (D45)
 *   POST /host/import                   paste an outside event link: into the inbox, then the form
 *   POST /host/inbox/:id/dismiss        "Not for us" (admins, and partners for their own items)
 *
 * Going together (D45): an outside event becomes a Jurrgun event only when a
 * host adds a meeting point, a time to meet and a table. The form is the
 * usual one, opened with ?inbox=<id>; the event keeps its source, its own
 * ticket link (payment stays there) and credit.
 *
 * A Table Host's hangout is for their regular table by default (src/routes/tables.tsx):
 * it is private, and goes to the table's members when it's published.
 *
 * A circle head's public event waits for review (src/routes/admin/review.tsx)
 * unless they're trusted; their private circle hangouts, admins and verified
 * partners publish directly. Rules live
 * in src/domain/hosting.ts. Money never passes through Jurrgun: the host says
 * whether it's free or paid at the venue, and may link their own payment page.
 */
import { lateOrLong, partnerEventTags } from "../domain/rules";
import { partnerKindOf } from "../services/events";
import { Hono, type Context } from "hono";
import { and, asc, desc, eq, gte, inArray, isNull, or, type SQL } from "drizzle-orm";
import { batch, getDb } from "../db";
import { canHost, checkProposal, memberCanEdit, ownsEvent, publishesDirectly, toBangkokInput, type ProposalInput } from "../domain/hosting";
import { DISTRICTS, EVENT_TAGS, INTENSITY, LANGUAGES, label, values, districtsAZ } from "../lib/constants";
import { newId, randomToken } from "../lib/crypto";
import type { AppEnv } from "../lib/env";
import { fmtDate } from "../lib/i18n";
import { audit, notify } from "../lib/records";
import { requireUser } from "../lib/session";
import { accounts, blocks, circleShares, connections, eventInbox, events, partnerOrgs, type Event, type InboxItem, type RegularTable } from "../schema";
import { importLink } from "../services/outside-events";
import { hostTable, sendToTable } from "../services/regular-tables";
import { Button, Card, Choices, Empty, FactIcon, Field, LinkButton, list, Notice, page, Select, str, Tag, TextArea, Toggle, view, type View } from "../ui/kit";
import { VenueFields } from "../ui/day-of";
import { AnnounceForm } from "../ui/announcements";
import { announceOpen } from "../services/announcements";
import { canAnnounce } from "../domain/announcements";
import { STATIONS } from "../content/stations";

export const hostRoutes = new Hono<AppEnv>();
// Hosts only (see the top). Partners and admins don't need a member profile.
const requireHost = async (c: Context<AppEnv>, next: () => Promise<void>) => {
  const u = c.var.user!;
  if (!canHost(u.account, !!u.profile?.onboardedAt)) return c.redirect(u.profile?.onboardedAt || u.account.role !== "user" ? "/circles/lead" : "/onboarding");
  await next();
};
hostRoutes.use("/host", requireUser, requireHost);
hostRoutes.use("/host/*", requireUser, requireHost);

type C = Context<AppEnv>;
/** Proposals waiting at once, per member: keeps the review queue fair. */
export const MAX_PENDING = 3;

const ALLOWED = () => ({ districts: values(DISTRICTS), languages: values(LANGUAGES), intensity: values(INTENSITY), tags: values(EVENT_TAGS).filter((x) => x !== "city_quest"), stations: STATION_KEYS });
const STATION_KEYS = STATIONS.map((s) => s.key);

function emptyInput(lang: string): ProposalInput {
  return {
    title: "",
    titleEn: "",
    description: "",
    startsAt: "",
    endsAt: "",
    venueName: "",
    venueAddress: "",
    mapUrl: "",
    district: "",
    capacity: "8",
    ageMin: "18",
    ageMax: "99",
    languages: [lang === "en" ? "en" : "th"],
    costThb: "0",
    paymentNote: "",
    paymentUrl: "",
    freeSeats: "0",
    intensity: "social",
    groupMin: "4",
    groupMax: "6",
    plusOneAllowed: false,
    tags: [],
    visibility: "public",
    accessibility: "",
    safetyInfo: "",
    venueNotes: "",
    venueNotesEn: "",
    nearestStation: "",
    walkMinutes: "",
    warmupUrl: "",
    goTogether: false,
    sourceUrl: "",
  };
}

function inputFromEvent(e: Event): ProposalInput {
  return {
    title: e.title,
    titleEn: e.titleEn ?? "",
    description: e.description,
    startsAt: toBangkokInput(e.startsAt),
    endsAt: toBangkokInput(e.endsAt),
    venueName: e.venueName,
    venueAddress: e.venueAddress,
    mapUrl: e.mapUrl ?? "",
    district: e.district,
    capacity: String(e.capacity),
    ageMin: String(e.ageMin),
    ageMax: String(e.ageMax),
    languages: e.languages,
    costThb: String(e.costThb),
    paymentNote: e.paymentNote ?? "",
    paymentUrl: e.paymentUrl ?? "",
    freeSeats: String(e.freeSeats ?? 0),
    intensity: e.intensity,
    groupMin: String(e.groupMin),
    groupMax: String(e.groupMax),
    plusOneAllowed: e.plusOneAllowed,
    tags: e.tags,
    visibility: e.visibility,
    accessibility: e.accessibility,
    safetyInfo: e.safetyInfo,
    venueNotes: e.venueNotes ?? "",
    venueNotesEn: e.venueNotesEn ?? "",
    nearestStation: e.nearestStation ?? "",
    walkMinutes: e.walkMinutes == null ? "" : String(e.walkMinutes),
    warmupUrl: e.warmupUrl ?? "",
    goTogether: !!e.sourceName,
    sourceUrl: e.sourceUrl ?? "",
  };
}

function inputFromBody(body: Record<string, unknown>): ProposalInput {
  const s = (k: string) => str(body[k]);
  return {
    title: s("title"),
    titleEn: s("titleEn"),
    description: s("description"),
    startsAt: s("startsAt"),
    endsAt: s("endsAt"),
    venueName: s("venueName"),
    venueAddress: s("venueAddress"),
    mapUrl: s("mapUrl"),
    district: s("district"),
    capacity: s("capacity"),
    ageMin: s("ageMin"),
    ageMax: s("ageMax"),
    languages: list(body.languages),
    costThb: s("costThb") || "0",
    paymentNote: s("paymentNote"),
    paymentUrl: s("paymentUrl"),
    freeSeats: s("freeSeats") || "0",
    intensity: s("intensity"),
    groupMin: s("groupMin"),
    groupMax: s("groupMax"),
    plusOneAllowed: s("plusOneAllowed") === "1",
    tags: list(body.tags),
    visibility: s("visibility"),
    accessibility: s("accessibility"),
    safetyInfo: s("safetyInfo"),
    venueNotes: s("venueNotes"),
    venueNotesEn: s("venueNotesEn"),
    nearestStation: s("nearestStation"),
    walkMinutes: s("walkMinutes"),
    warmupUrl: s("warmupUrl"),
    goTogether: s("goTogether") === "1",
    sourceUrl: s("sourceUrl"),
  };
}

const viewerOf = (c: C) => {
  const a = c.var.user!.account;
  return { id: a.id, role: a.role, partnerOrgId: a.partnerOrgId };
};

// ------------------------------------------------------------- inbox --

/** Which inbox items a host sees: Jurrgun's shared ones, plus their own partner's. Admins see all. */
function inboxScope(a: { role: string; partnerOrgId: string | null }): SQL | undefined {
  if (a.role === "bma_admin") return undefined;
  return a.partnerOrgId ? or(isNull(eventInbox.partnerOrgId), eq(eventInbox.partnerOrgId, a.partnerOrgId)) : isNull(eventInbox.partnerOrgId);
}

async function inboxItem(c: C, id: string): Promise<InboxItem | null> {
  if (!id || id.length > 64) return null;
  const [item] = await getDb(c.env)
    .select()
    .from(eventInbox)
    .where(and(eq(eventInbox.id, id), inboxScope(c.var.user!.account)))
    .limit(1);
  return item ?? null;
}

/** A pasted page we couldn't read keeps its paste time as a placeholder start. */
export const inboxDateKnown = (i: { startsAt: Date; createdAt: Date }) => i.startsAt.getTime() > i.createdAt.getTime() + 3_600_000;

const canDismiss = (a: { role: string; partnerOrgId: string | null }, i: InboxItem) =>
  a.role === "bma_admin" || (a.role === "partner_admin" && !!a.partnerOrgId && i.partnerOrgId === a.partnerOrgId);

/** A verified partner whose organisation a moderator sent back to review publishes nothing directly (D47). */
async function partnerInReview(c: C): Promise<boolean> {
  const org = c.var.user!.account.partnerOrgId;
  if (!org) return false;
  const [row] = await getDb(c.env).select({ status: partnerOrgs.status }).from(partnerOrgs).where(eq(partnerOrgs.id, org)).limit(1);
  return row?.status === "review";
}

/** The form for a go-together event from an inbox item: meet an hour before, a public place to fill in. */
function prefillFrom(item: InboxItem, d: ProposalInput): ProposalInput {
  const known = inboxDateKnown(item);
  const meet = known ? new Date(item.startsAt.getTime() - 3_600_000) : null;
  const end = known ? (item.endsAt && item.endsAt > item.startsAt ? item.endsAt : new Date(item.startsAt.getTime() + 3 * 3_600_000)) : null;
  return {
    ...d,
    title: item.title.slice(0, 120),
    description: item.description,
    startsAt: meet ? toBangkokInput(meet) : "",
    endsAt: meet && end ? toBangkokInput(new Date(Math.min(end.getTime(), meet.getTime() + 12 * 3_600_000))) : "",
    goTogether: true,
    sourceUrl: item.sourceUrl ?? "",
  };
}

const goTogetherOf = (v: View, d: ProposalInput, item: InboxItem | null, e?: Event | null) =>
  d.goTogether
    ? {
        v,
        d,
        inbox: item,
        sourceName: item?.sourceName ?? e?.sourceName ?? null,
        credit: item?.credit ?? e?.sourceCredit ?? null,
        venue: item?.venueName ?? e?.sourceVenue ?? null,
        startsAt: item ? (inboxDateKnown(item) ? item.startsAt : null) : (e?.sourceStartsAt ?? null),
      }
    : null;

/** The full private link for an event (shown to its host only). */
const privateLink = (c: C, e: Event) => `${new URL(c.req.url).origin}/events/${e.id}?t=${encodeURIComponent(e.privateToken ?? "")}`;

function statusTag(t: View["t"], s: string) {
  switch (s) {
    case "pending":
      return <Tag tone="warn">{t("รอทีมงานตรวจ", "Waiting for review")}</Tag>;
    case "rejected":
      return <Tag tone="warn">{t("ส่งกลับให้แก้", "Sent back")}</Tag>;
    case "published":
      return <Tag tone="ok">{t("เผยแพร่แล้ว", "Live")}</Tag>;
    case "cancelled":
      return <Tag tone="muted">{t("ยกเลิกแล้ว", "Cancelled")}</Tag>;
    default:
      return <Tag tone="muted">{t("ร่าง", "Draft")}</Tag>;
  }
}

// -------------------------------------------------------------- my list --

hostRoutes.get("/host", async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const me = c.var.user!.account;
  const mine = await getDb(c.env)
    .select()
    .from(events)
    .where(or(eq(events.hostAccountId, me.id), eq(events.createdBy, me.id)))
    .orderBy(desc(events.startsAt))
    .limit(50);
  const direct = publishesDirectly(me, "public");
  const table = await hostTable(getDb(c.env), me.id);
  const privateIds = mine.filter((e) => e.visibility === "private").map((e) => e.id);
  const shared = privateIds.length
    ? await getDb(c.env).select({ eventId: circleShares.eventId }).from(circleShares).where(inArray(circleShares.eventId, privateIds)).limit(5000)
    : [];
  const sharedCount = (id: string) => shared.filter((x) => x.eventId === id).length;
  const now = new Date();
  return page(
    c,
    { title: t("จัดกิจกรรม", "Host an event"), tab: "me" },
    <>
      <p>
        <a href="/settings">← {t("ฉัน", "Me")}</a>
      </p>
      <h1>{t("จัดกิจกรรมของคุณเอง", "Host your own event")}</h1>
      <p class="chips2">
        <a class="btn ghost" href="/host/insights">📈 {t("ผลลัพธ์กิจกรรม", "How my events went")}</a>
        <a class="btn ghost" href="/host/ideas">💡 {t("ไอเดียจัดกิจกรรม", "Ideas")}</a>
      </p>
      <p class="muted">
        {direct
          ? t("กิจกรรมของคุณเผยแพร่ได้ทันที", "Your events go live straight away.")
          : t("เสนอกิจกรรม แล้วทีมงานจะตรวจก่อนเผยแพร่ (ปกติภายใน 1 ถึง 2 วัน)", "Propose an event and the team checks it before it goes live (usually within a day or two).")}{" "}
        {t("จัดฟรีหรือให้จ่ายที่สถานที่ก็ได้ Jurrgun ไม่รับเงินแทนผู้จัด", "It can be free or paid at the venue. Jurrgun never takes payment.")}
      </p>
      {c.req.query("notice") === "submitted" ? <Notice kind="ok">{t("ส่งให้ทีมงานตรวจแล้ว เราจะแจ้งเมื่อเผยแพร่", "Sent for review. We'll let you know when it's live.")}</Notice> : null}
      {c.req.query("notice") === "published" ? <Notice kind="ok">{t("เผยแพร่แล้ว!", "It's live!")}</Notice> : null}
      {c.req.query("notice") === "link_reset" ? <Notice kind="ok">{t("สร้างลิงก์ใหม่แล้ว ลิงก์เดิมใช้ไม่ได้อีก", "New private link made. The old one no longer works.")}</Notice> : null}
      {c.req.query("notice") === "circle_sent" ? <Notice kind="ok">{t("ส่งให้คนรู้จักของคุณแล้ว", "Sent to your people.")}</Notice> : null}
      {c.req.query("notice") === "table_sent" ? <Notice kind="ok">{t("ส่งให้คนในโต๊ะประจำแล้ว", "Sent to your Regular Table.")}</Notice> : null}
      {table ? (
        <p>
          <a href={`/tables/${table.id}`}>👥 {t(`โต๊ะประจำของคุณ: ${table.name}`, `Your Regular Table: ${table.name}`)}</a>
        </p>
      ) : null}
      <p>
        <LinkButton href="/host/new">＋ {t("เสนอกิจกรรม", "Propose an event")}</LinkButton>
      </p>
      <Card>
        <h2>{t("ไปงานข้างนอกด้วยกัน", "Go together to an outside event")}</h2>
        <form method="post" action="/host/import">
          <Field
            label={t("วางลิงก์กิจกรรม", "Paste an event link")}
            name="url"
            type="url"
            required
            maxlength={1000}
            placeholder="https://…"
            inputmode="url"
            autocapitalize="none"
            autocorrect="off"
            spellcheck={false}
            enterkeyhint="go"
            hint={t("คอนเสิร์ต เทศกาล งานจาก Ticketmelon, Megatix, Luma หรือเว็บไหนก็ได้ แล้วเพิ่มจุดนัดพบกับโต๊ะของคุณ", "A concert, a festival, a Ticketmelon, Megatix or Luma page, any site. Then add your meeting point and table.")}
          />
          <div class="row">
            <Button>{t("ต่อไป", "Next")}</Button>
            <LinkButton href="/host/inbox" kind="ghost">
              {t("กิจกรรมที่รอโต๊ะ", "Events waiting for a table")}
            </LinkButton>
          </div>
        </form>
      </Card>
      {me.role !== "partner_admin" ? (
        <p class="muted">
          <a href="/partner/apply">{t("จัดงานในนามองค์กร? สมัครเป็นพาร์ตเนอร์", "Run events as an organisation? Become a partner")}</a>
        </p>
      ) : null}
      {c.req.query("notice") === "bad_link" ? <Notice kind="error">{t("ลิงก์นี้ใช้ไม่ได้ ใส่ลิงก์ที่ขึ้นต้นด้วย https:// ของหน้ากิจกรรม", "That link can't be used. Paste the event page's link, starting with https://")}</Notice> : null}
      {/* Said once, above the list, instead of under every live event (Phase 3). */}
      {mine.some((e) => e.status === "published") ? (
        <p class="muted">{t("ถ้าอยากแก้ไขหรือยกเลิกกิจกรรมที่เผยแพร่แล้ว ติดต่อทีมงานได้เลย", "To change or cancel a live event, contact the team.")}</p>
      ) : null}
      {mine.length === 0 ? (
        <Empty>{t("ยังไม่มีกิจกรรมที่คุณจัด", "You haven't hosted anything yet.")}</Empty>
      ) : (
        mine.map((e) => (
          <Card>
            <div class="spread">
              <a class="host-ev-title" href={`/events/${e.id}`}>{lang === "en" && e.titleEn ? e.titleEn : e.title}</a>
              {statusTag(t, e.status)}
            </div>
            <p class="muted" style="margin:4px 0">
              {fmtDate(e.startsAt, lang)} · {e.venueName} · {label(DISTRICTS, e.district, lang)}
              {e.visibility === "private" ? ` · 🔒 ${t("ส่วนตัว", "Private")}` : ""}
              {e.regularTableId ? ` · 👥 ${t("โต๊ะประจำ", "Regular Table")}` : ""}
            </p>
            {e.status === "rejected" && e.reviewNote ? (
              <Notice kind="warn">
                {t("ทีมงานขอให้แก้: ", "The team asks: ")}
                {e.reviewNote}
              </Notice>
            ) : null}
            {e.visibility === "private" && e.privateToken && e.status === "published" ? (
              <div class="field">
                <label for={`pl-${e.id}`}>{t("ลิงก์ส่วนตัว (ส่งให้คนที่อยากชวนเท่านั้น)", "Private link (send it only to people you invite)")}</label>
                <input id={`pl-${e.id}`} type="text" readonly value={privateLink(c, e)} onfocus="this.select()" />
              </div>
            ) : null}
            <div class="row">
              <LinkButton href={`/events/${e.id}`} kind="ghost">
                {t("ดูหน้ากิจกรรม", "View event page")}
              </LinkButton>
              {memberCanEdit(e) ? (
                <LinkButton href={`/host/${e.id}/edit`} kind="ghost">
                  {t("แก้ไข", "Edit")}
                </LinkButton>
              ) : null}
              {e.status === "pending" || e.status === "rejected" ? (
                <form method="post" action={`/host/${e.id}/withdraw`}>
                  <Button kind="ghost">{t("ถอนออก", "Withdraw")}</Button>
                </form>
              ) : null}
              {table && e.regularTableId === table.id && e.status === "published" ? (
                <form method="post" action={`/host/${e.id}/table`}>
                  <Button kind="ghost">👥 {t("ส่งให้โต๊ะประจำ", "Send to my Regular Table")}</Button>
                </form>
              ) : null}
              {e.visibility === "private" && e.status === "published" ? (
                <form method="post" action={`/host/${e.id}/circle`}>
                  <Button kind="ghost">
                    👥 {t("ส่งให้คนรู้จัก", "Send to my people")}
                    {sharedCount(e.id) ? ` (${sharedCount(e.id)})` : ""}
                  </Button>
                </form>
              ) : null}
              {e.visibility === "private" && e.status === "published" ? (
                <form method="post" action={`/host/${e.id}/private-link/reset`}>
                  <Button kind="ghost">{t("สร้างลิงก์ใหม่", "New link")}</Button>
                </form>
              ) : null}
            </div>
            {announceOpen(e, now) && canAnnounce(e, me) ? (
              <details class="ann-host">
                <summary>
                  <FactIcon name="note" /> {t("ประกาศถึงคนที่มา", "Announce to people going")}
                </summary>
                <AnnounceForm t={t} e={e} action={`/admin/events/${e.id}/announce`} back="/host" />
              </details>
            ) : null}
          </Card>
        ))
      )}
    </>,
  );
});

// ------------------------------------------------------------------ form --

/** The outside event a go-together event is for (D45): its source, credit and own link. */
function GoTogetherCard(props: { v: View; d: ProposalInput; inbox: InboxItem | null; sourceName: string | null; credit: string | null; venue: string | null; startsAt: Date | null }) {
  const { t, lang } = props.v;
  return (
    <Card>
      <h2>{t("ไปงานนี้ด้วยกัน", "Going together")}</h2>
      <input type="hidden" name="goTogether" value="1" />
      {props.inbox ? <input type="hidden" name="inbox" value={props.inbox.id} /> : null}
      <p class="muted">
        {props.inbox ? <strong>{props.inbox.title}</strong> : null}
        {props.sourceName ? ` · ${t("ผ่าน", "Via")} ${props.sourceName}` : ""}
        {props.credit ? ` · ${props.credit}` : ""}
        {props.startsAt ? ` · ${fmtDate(props.startsAt, lang)}` : ""}
        {props.venue ? ` · ${props.venue}` : ""}
      </p>
      <Field
        label={t("ลิงก์ซื้อบัตรหรือหน้ากิจกรรม", "Ticket or event link")}
        name="sourceUrl"
        type="url"
        value={props.d.sourceUrl}
        placeholder="https://…"
        maxlength={500}
        hint={t("ทุกคนซื้อบัตรเองที่นั่น Jurrgun ไม่รับเงิน", "Everyone buys their own ticket there. Jurrgun never takes payment.")}
      />
      <p class="muted">
        {t(
          "ข้างล่างคือจุดนัดพบของโต๊ะคุณ: ที่สาธารณะใกล้งาน พร้อมที่อยู่ และเวลาที่นัดเจอกันก่อนเข้างาน",
          "Below is your table's meeting point: a public place near the event, with its address, and the time you meet before going in.",
        )}
      </p>
    </Card>
  );
}

function ProposalForm(props: {
  v: View;
  d: ProposalInput;
  action: string;
  errors?: string[];
  editing: boolean;
  direct: boolean;
  table?: RegularTable | null;
  audience?: string;
  goTogether?: Parameters<typeof GoTogetherCard>[0] | null;
  /** Things to know, not errors (for example: we couldn't read that page). */
  notes?: string[];
}) {
  const { v, d } = props;
  const { t, lang } = v;
  const tags = EVENT_TAGS.filter((x) => x.value !== "city_quest");
  const visOpts = [
    { value: "public", th: "สาธารณะ: แสดงบนหน้าค้นหา", en: "Public: listed on Discover" },
    { value: "private", th: "ส่วนตัว: เฉพาะคนที่มีลิงก์", en: "Private: only people with the link" },
  ];
  return (
    <form method="post" action={props.action}>
      {props.errors?.length ? (
        <Notice kind="error">
          <ul>
            {props.errors.map((e) => (
              <li>{e}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {props.notes?.map((n) => (
        <Notice kind="warn">{n}</Notice>
      ))}
      {props.goTogether ? <GoTogetherCard {...props.goTogether} /> : null}
      <Card>
        <h2>{t("จะทำอะไรกัน", "What's the plan?")}</h2>
        <Field label={t("ชื่อกิจกรรม", "Title")} name="title" value={d.title} required maxlength={120} />
        <Field label={t("ชื่อภาษาอังกฤษ (ไม่บังคับ)", "English title (optional)")} name="titleEn" value={d.titleEn} maxlength={120} />
        <TextArea label={t("รายละเอียด", "What will you do?")} name="description" value={d.description} rows={5} maxlength={4000} required hint={t("จะทำอะไร เหมาะกับใคร ต้องเตรียมอะไรมา", "What happens, who it suits, what to bring")} />
        <Choices legend={t("หมวด (ไม่เกิน 6)", "Categories (up to 6)")} name="tags" options={tags} values={d.tags} lang={lang} />
      </Card>
      <Card>
        <h2>{t("เมื่อไหร่ ที่ไหน", "When and where")}</h2>
        <div class="grid2">
          <Field label={t("เริ่ม (เวลากรุงเทพฯ)", "Starts (Bangkok time)")} name="startsAt" type="datetime-local" value={d.startsAt} required />
          <Field label={t("จบ (เวลากรุงเทพฯ)", "Ends (Bangkok time)")} name="endsAt" type="datetime-local" value={d.endsAt} required />
        </div>
        {d.goTogether ? (
          <>
            <Field label={t("จุดนัดพบ (ที่สาธารณะ)", "Meeting point (a public place)")} name="venueName" value={d.venueName} required maxlength={200} />
            <Field label={t("ที่อยู่จุดนัดพบ", "Meeting point address")} name="venueAddress" value={d.venueAddress} required maxlength={400} />
          </>
        ) : (
          <>
            <Field label={t("สถานที่", "Venue")} name="venueName" value={d.venueName} required maxlength={200} />
            <Field label={t("ที่อยู่", "Address")} name="venueAddress" value={d.venueAddress} maxlength={400} />
          </>
        )}
        <Field label={t("ลิงก์แผนที่ (ไม่บังคับ)", "Map link (optional)")} name="mapUrl" type="url" value={d.mapUrl} placeholder="https://maps.google.com/…" maxlength={500} />
        <Select label={t("เขต", "District")} name="district" options={districtsAZ(lang)} value={d.district} lang={lang} required blank={t("เลือกเขต", "Choose a district")} />
        <VenueFields v={v} d={d} />
        <Field
          label={t("ลิงก์ทักทายออนไลน์ก่อนวันงาน (ไม่บังคับ)", "Online hello before the day (optional)")}
          name="warmupUrl"
          type="url"
          value={d.warmupUrl}
          placeholder="https://…"
          maxlength={500}
          hint={t("คุยสั้น ๆ ให้คนมาครั้งแรกรู้จักโต๊ะก่อน งานจริงยังเจอกันตัวจริงเสมอ ลิงก์นี้เห็นเฉพาะคนที่ได้ที่นั่ง", "A short call so first-timers meet their table first. The event itself is always in person. Only people with a seat see this link.")}
        />
      </Card>
      <Card>
        <h2>{t("ใครมาได้", "Who it's for")}</h2>
        <div class="grid2">
          <Field label={t("จำนวนคน", "How many people")} name="capacity" type="number" min={2} max={60} value={d.capacity} required />
          <Select label={t("ความคึกคัก", "Social intensity")} name="intensity" options={INTENSITY} value={d.intensity} lang={lang} />
          <Field label={t("อายุต่ำสุด", "Minimum age")} name="ageMin" type="number" min={18} max={99} value={d.ageMin} required />
          <Field label={t("อายุสูงสุด", "Maximum age")} name="ageMax" type="number" min={18} max={99} value={d.ageMax} required />
          <Field label={t("คนต่อโต๊ะ (น้อยสุด)", "Smallest table")} name="groupMin" type="number" min={2} max={12} value={d.groupMin} required />
          <Field label={t("คนต่อโต๊ะ (มากสุด)", "Largest table")} name="groupMax" type="number" min={2} max={12} value={d.groupMax} required />
        </div>
        <Choices legend={t("ภาษา", "Languages")} name="languages" options={LANGUAGES} values={d.languages} lang={lang} />
        <Toggle name="plusOneAllowed" label={t("ชวนเพื่อนมาได้ 1 คน", "Guests can bring a friend (+1)")} checked={d.plusOneAllowed} />
        <Select label={t("ใครเห็นกิจกรรมนี้", "Who can see it")} name="visibility" options={visOpts} value={d.visibility} lang={lang} />
        {props.table ? (
          <Select
            label={t("ชวนใคร", "Who's it for")}
            name="audience"
            options={[
              { value: "table", th: `โต๊ะประจำ "${props.table.name}": ส่งให้ทุกคนในโต๊ะ (เป็นกิจกรรมส่วนตัว)`, en: `Your Regular Table "${props.table.name}": everyone at the table gets it (private)` },
              { value: "none", th: "ไม่ใช่ของโต๊ะ: ใครเห็นตามที่ตั้งไว้ข้างบน", en: "Not for the table: as set above" },
            ]}
            value={props.audience ?? "none"}
            lang={lang}
          />
        ) : null}
      </Card>
      <Card>
        <h2>{t("ค่าใช้จ่ายและความปลอดภัย", "Cost and safety")}</h2>
        <Field label={t("ค่าใช้จ่ายต่อคน (บาท, 0 = ฟรี)", "Cost per person (baht, 0 = free)")} name="costThb" type="number" min={0} max={20000} value={d.costThb} />
        <Field
          label={t("ที่นั่งส่งต่อน้ำใจ (ฟรี 0 ถึง 5 ที่)", "Pay-it-forward seats (free, 0-5)")}
          name="freeSeats"
          type="number"
          min={0}
          max={5}
          value={d.freeSeats ?? "0"}
          hint={t("สำหรับกิจกรรมที่มีค่าใช้จ่าย ใครก็ขอได้เงียบ ๆ ไม่ต้องให้เหตุผล", "Anyone can quietly claim one, no questions asked. For paid events.")}
        />
        <Field label={t("วิธีจ่ายเงิน (เช่น จ่ายที่ร้าน หรือพร้อมเพย์)", "How to pay (e.g. at the venue, PromptPay)")} name="paymentNote" value={d.paymentNote} maxlength={500} />
        <Field
          label={t("ลิงก์รับเงินของคุณ (ไม่บังคับ)", "Your payment link (optional)")}
          name="paymentUrl"
          type="url"
          value={d.paymentUrl}
          placeholder="https://…"
          maxlength={500}
          hint={t("Jurrgun ไม่รับเงินแทน ผู้เข้าร่วมจ่ายให้คุณโดยตรง", "Jurrgun never takes payment; people pay you directly.")}
        />
        <TextArea label={t("การเข้าถึง (ไม่บังคับ)", "Accessibility (optional)")} name="accessibility" value={d.accessibility} maxlength={1000} />
        <TextArea label={t("จุดนัดพบและความปลอดภัย", "Meeting point and safety")} name="safetyInfo" value={d.safetyInfo} maxlength={1000} />
      </Card>
      <p class="muted">
        {t("เมื่อกดส่ง ถือว่าคุณยืนยันว่าจะดูแลผู้เข้าร่วมตาม", "By sending this you agree to look after your guests in line with the")} <a href="/code-of-conduct">{t("หลักปฏิบัติของชุมชน", "code of conduct")}</a>.
      </p>
      <div class="row end">
        <LinkButton href="/host" kind="ghost">
          {t("ยกเลิก", "Cancel")}
        </LinkButton>
        <Button>{props.direct ? t("เผยแพร่", "Publish") : props.editing ? t("ส่งให้ตรวจอีกครั้ง", "Send for review again") : t("ส่งให้ทีมงานตรวจ", "Send for review")}</Button>
      </div>
    </form>
  );
}

const formPage = (c: C, props: Parameters<typeof ProposalForm>[0], status?: 400) =>
  page(
    c,
    { title: props.v.t("เสนอกิจกรรม", "Propose an event"), tab: "me", status },
    <>
      <p>
        <a href="/host">← {props.v.t("กิจกรรมที่ฉันจัด", "My hosted events")}</a>
      </p>
      <h1>{props.editing ? props.v.t("แก้ไขกิจกรรม", "Edit your event") : props.v.t("เสนอกิจกรรม", "Propose an event")}</h1>
      <ProposalForm {...props} />
    </>,
  );

async function pendingCount(c: C, accountId: string): Promise<number> {
  const rows = await getDb(c.env)
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.createdBy, accountId), inArray(events.status, ["pending"])))
    .limit(MAX_PENDING + 1);
  return rows.length;
}

/** "table" puts the hangout on the host's regular table: private, and it goes to the members. */
const audienceOf = (body: Record<string, unknown>) => (str(body.audience) === "table" ? "table" : "none");

hostRoutes.get("/host/new", async (c) => {
  const v = view(c);
  const me = c.var.user!.account;
  const table = await hostTable(getDb(c.env), me.id);
  // Prefill from a Bangkok Buddy quest ("Make it a table"): a suggestion only, the form validates as usual.
  const d = emptyInput(v.lang);
  const title = (c.req.query("title") ?? "").slice(0, 120);
  const district = c.req.query("district") ?? "";
  if (title) d[v.lang === "en" ? "titleEn" : "title"] = title;
  if (DISTRICTS.some((x) => x.value === district)) d.district = district;
  // "Host a hangout for your circle": private, link-only by default.
  if (c.req.query("visibility") === "private") d.visibility = "private";
  // A Table Host's hangout goes to their regular table by default.
  const audience = table && (d.visibility === "private" || c.req.query("table") === "1") ? "table" : "none";
  if (audience === "table") d.visibility = "private";
  const item = await inboxItem(c, c.req.query("inbox") ?? "");
  const form = item ? prefillFrom(item, d) : d;
  const notes = item ? importNotes(v, c.req.query("read"), c.req.query("online")) : [];
  return formPage(c, {
    v,
    d: form,
    action: "/host/new",
    editing: false,
    direct: publishesDirectly(me, form.visibility),
    table,
    audience: item ? "none" : audience,
    goTogether: goTogetherOf(v, form, item),
    notes,
  });
});

/** What the host should know after pasting a link (shown at the top of the form). */
function importNotes(v: View, read: string | undefined, online: string | undefined): string[] {
  const out: string[] = [];
  if (read === "0") out.push(v.t("เราอ่านรายละเอียดจากหน้านี้ไม่ได้ ใส่ชื่อ เวลา และจุดนัดพบเองได้เลย", "We couldn't read the details from that page. Type the name, time and meeting point yourself."));
  if (online === "1") out.push(v.t("หน้านี้บอกว่าเป็นงานออนไลน์ กิจกรรมบน Jurrgun ต้องเจอกันตัวจริงเสมอ", "That page says the event is online. Jurrgun events always meet in person."));
  return out;
}

hostRoutes.post("/host/import", async (c) => {
  const body = await c.req.parseBody();
  const me = c.var.user!.account;
  const res = await importLink(c.env, str(body.url), { accountId: me.id, partnerOrgId: me.role === "partner_admin" || me.role === "host" ? me.partnerOrgId : null });
  if (!res.ok) return c.redirect("/host?notice=bad_link");
  const db = getDb(c.env);
  await audit(db, me.id, "inbox.paste", { type: "inbox", id: res.inboxId }, { read: res.read });
  return c.redirect(`/host/new?inbox=${encodeURIComponent(res.inboxId)}&read=${res.read || !res.reason ? "1" : "0"}${res.online ? "&online=1" : ""}`);
});

hostRoutes.get("/host/inbox", async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const me = c.var.user!.account;
  const now = new Date();
  const items = await getDb(c.env)
    .select()
    .from(eventInbox)
    .where(and(eq(eventInbox.status, "new"), gte(eventInbox.startsAt, new Date(now.getTime() - 3_600_000)), inboxScope(me)))
    .orderBy(asc(eventInbox.startsAt))
    .limit(60);
  return page(
    c,
    { title: t("กิจกรรมที่รอโต๊ะ", "Events waiting for a table"), tab: "me" },
    <>
      <p>
        <a href="/host">← {t("จัดกิจกรรม", "Host an event")}</a>
      </p>
      <h1>{t("กิจกรรมที่รอโต๊ะ", "Events waiting for a table")}</h1>
      <p class="muted">
        {t(
          "งานจากปฏิทินและลิงก์ที่วางไว้ จะขึ้นหน้าค้นหาเมื่อมีเจ้าภาพเพิ่มจุดนัดพบกับโต๊ะ",
          "Events from calendars and pasted links. One shows on Discover only once a host adds a meeting point and a table.",
        )}
      </p>
      {c.req.query("notice") === "dismissed" ? <Notice kind="ok">{t("เอาออกแล้ว", "Removed.")}</Notice> : null}
      {items.length === 0 ? (
        <Empty>{t("ยังไม่มีกิจกรรมรอ วางลิงก์ได้ที่หน้าจัดกิจกรรม", "Nothing waiting. Paste a link on the hosting page.")}</Empty>
      ) : (
        items.map((i) => (
          <Card>
            <strong>{i.title}</strong>
            <p class="muted" style="margin:4px 0">
              {inboxDateKnown(i) ? fmtDate(i.startsAt, lang) : t("ยังไม่รู้เวลา", "Time not known yet")}
              {i.venueName ? ` · ${i.venueName}` : ""}
              {" · "}
              {i.sourceUrl ? (
                <a class="nowrap" href={i.sourceUrl} rel="noopener noreferrer nofollow" target="_blank">
                  {t("ผ่าน", "Via")} {i.sourceName} ↗
                </a>
              ) : (
                `${t("ผ่าน", "Via")} ${i.sourceName}`
              )}
              {i.credit ? ` · ${i.credit}` : ""}
            </p>
            <div class="row">
              <LinkButton href={`/host/new?inbox=${encodeURIComponent(i.id)}`}>{t("เพิ่มโต๊ะไปด้วยกัน", "Add a go-together table")}</LinkButton>
              {canDismiss(me, i) ? (
                <form method="post" action={`/host/inbox/${i.id}/dismiss`}>
                  <Button kind="ghost">{t("ไม่ใช่สำหรับเรา", "Not for us")}</Button>
                </form>
              ) : null}
            </div>
          </Card>
        ))
      )}
    </>,
  );
});

hostRoutes.post("/host/inbox/:id/dismiss", async (c) => {
  const me = c.var.user!.account;
  const item = await inboxItem(c, c.req.param("id"));
  if (item && canDismiss(me, item) && item.status === "new") {
    const db = getDb(c.env);
    await batch(c.env, [
      db.update(eventInbox).set({ status: "dismissed", updatedAt: new Date() }).where(and(eq(eventInbox.id, item.id), eq(eventInbox.status, "new"))),
      audit(db, me.id, "inbox.dismiss", { type: "inbox", id: item.id }),
    ]);
  }
  return c.redirect("/host/inbox?notice=dismissed");
});

hostRoutes.post("/host/new", async (c) => {
  const v = view(c);
  const me = c.var.user!.account;
  const body = await c.req.parseBody({ all: true });
  const d = inputFromBody(body);
  const table = await hostTable(getDb(c.env), me.id);
  const item = await inboxItem(c, str(body.inbox));
  // A go-together event comes from an inbox item still waiting; without one it's an ordinary event.
  if (!item || item.status !== "new") d.goTogether = false;
  const audience = table && !item ? audienceOf(body) : "none";
  if (audience === "table") d.visibility = "private";
  let direct = publishesDirectly(me, d.visibility) && !(await partnerInReview(c));
  const { values: vals, errors } = checkProposal(d, ALLOWED());
  const msgs = errors.map((e) => v.t(e.th, e.en));
  if (!direct && (await pendingCount(c, me.id)) >= MAX_PENDING) {
    msgs.push(v.t(`มีกิจกรรมรอตรวจพร้อมกันได้ไม่เกิน ${MAX_PENDING} งาน`, `You can have up to ${MAX_PENDING} events waiting for review at once.`));
  }
  if (!vals || msgs.length)
    return formPage(c, { v, d, action: "/host/new", errors: msgs, editing: false, direct, table, audience, goTogether: goTogetherOf(v, d, d.goTogether ? item : null) }, 400);
  // Late-night and very long events always get a second pair of eyes.
  if (direct && lateOrLong(vals.startsAt, vals.endsAt)) direct = false;

  const db = getDb(c.env);
  const id = newId();
  const now = new Date();
  const partnerOrgId = me.role === "partner_admin" ? me.partnerOrgId : null;
  // A dating partner's events always carry open_to_more (rules.ts partnerEventTags).
  const tags = partnerEventTags(vals.tags, await partnerKindOf(db, partnerOrgId));
  await batch(c.env, [
    db.insert(events).values({
      id,
      ...vals,
      tags,
      descriptionEn: null,
      emergencyContact: "191 / 1669",
      hostAccountId: me.id,
      partnerOrgId,
      privateToken: vals.visibility === "private" ? randomToken(32) : null,
      status: direct ? "published" : "pending",
      submittedAt: now,
      regularTableId: audience === "table" && table ? table.id : null,
      ...(d.goTogether && item
        ? {
            sourceName: item.sourceName,
            sourceUrl: vals.sourceUrl ?? item.sourceUrl,
            sourceCredit: item.credit,
            sourceVenue: item.venueName,
            sourceStartsAt: inboxDateKnown(item) ? item.startsAt : null,
            inboxId: item.id,
            referralCode: partnerOrgId ? randomToken(6) : null,
          }
        : {}),
      createdBy: me.id,
    }),
    ...(d.goTogether && item
      ? [db.update(eventInbox).set({ status: "attached", attachedEventId: id, updatedAt: now }).where(and(eq(eventInbox.id, item.id), eq(eventInbox.status, "new")))]
      : []),
    audit(db, me.id, direct ? "event.host_publish" : "event.host_submit", { type: "event", id }),
  ]);
  if (direct && audience === "table" && table) await sendPublished(c, id, table);
  return c.redirect(`/host?notice=${direct ? "published" : "submitted"}`);
});

/** Sends a just-published table hangout to the table's members. */
async function sendPublished(c: C, eventId: string, table: RegularTable) {
  const [e] = await getDb(c.env).select().from(events).where(eq(events.id, eventId)).limit(1);
  if (e) await sendToTable(c.env, e, table, c.var.user!.profile?.nickname ?? "");
}

/** The member's own event, if they may still change it; null otherwise. */
async function ownEditable(c: C): Promise<Event | null> {
  const [e] = await getDb(c.env).select().from(events).where(eq(events.id, c.req.param("id") ?? "")).limit(1);
  return e && ownsEvent(e, viewerOf(c)) && memberCanEdit(e) ? e : null;
}

hostRoutes.get("/host/:id/edit", async (c) => {
  const v = view(c);
  const e = await ownEditable(c);
  if (!e) return c.redirect("/host");
  const table = await hostTable(getDb(c.env), c.var.user!.account.id);
  const audience = table && e.regularTableId === table.id ? "table" : "none";
  const d = inputFromEvent(e);
  return formPage(c, { v, d, action: `/host/${e.id}/edit`, editing: true, direct: publishesDirectly(c.var.user!.account, e.visibility), table, audience, goTogether: goTogetherOf(v, d, null, e) });
});

hostRoutes.post("/host/:id/edit", async (c) => {
  const v = view(c);
  const me = c.var.user!.account;
  const e = await ownEditable(c);
  if (!e) return c.redirect("/host");
  const body = await c.req.parseBody({ all: true });
  const d = inputFromBody(body);
  // The form can't turn an ordinary event into a go-together one, or drop an outside event's source.
  d.goTogether = !!e.sourceName;
  const table = await hostTable(getDb(c.env), me.id);
  const audience = table && !e.sourceName ? audienceOf(body) : "none";
  if (audience === "table") d.visibility = "private";
  let direct = publishesDirectly(me, d.visibility) && !(await partnerInReview(c));
  const { values: vals, errors } = checkProposal(d, ALLOWED());
  if (!vals)
    return formPage(c, { v, d, action: `/host/${e.id}/edit`, errors: errors.map((x) => v.t(x.th, x.en)), editing: true, direct, table, audience, goTogether: goTogetherOf(v, d, null, e) }, 400);
  if (direct && lateOrLong(vals.startsAt, vals.endsAt)) direct = false;
  const db = getDb(c.env);
  const tags = partnerEventTags(vals.tags, await partnerKindOf(db, e.partnerOrgId));
  await batch(c.env, [
    db
      .update(events)
      .set({
        ...vals,
        tags,
        privateToken: vals.visibility === "private" ? (e.privateToken ?? randomToken(32)) : e.privateToken,
        status: direct ? "published" : "pending",
        reviewNote: null,
        submittedAt: new Date(),
        regularTableId: audience === "table" && table ? table.id : null,
      })
      .where(and(eq(events.id, e.id), inArray(events.status, ["draft", "pending", "rejected"]))),
    audit(db, me.id, direct ? "event.host_publish" : "event.host_resubmit", { type: "event", id: e.id }),
  ]);
  if (direct && audience === "table" && table) await sendPublished(c, e.id, table);
  return c.redirect(`/host?notice=${direct ? "published" : "submitted"}`);
});

hostRoutes.post("/host/:id/withdraw", async (c) => {
  const e = await ownEditable(c);
  if (e && (e.status === "pending" || e.status === "rejected")) {
    const db = getDb(c.env);
    await batch(c.env, [
      db.update(events).set({ status: "draft" }).where(and(eq(events.id, e.id), inArray(events.status, ["pending", "rejected"]))),
      audit(db, c.var.user!.account.id, "event.host_withdraw", { type: "event", id: e.id }),
    ]);
  }
  return c.redirect("/host");
});

/** (Re)sends a published table hangout to the table: only members who haven't had it yet. */
hostRoutes.post("/host/:id/table", async (c) => {
  const db = getDb(c.env);
  const [e] = await db.select().from(events).where(eq(events.id, c.req.param("id"))).limit(1);
  const table = await hostTable(db, c.var.user!.account.id);
  if (!e || !table || !ownsEvent(e, viewerOf(c)) || e.status !== "published" || e.regularTableId !== table.id) return c.redirect("/host");
  await sendToTable(c.env, e, table, c.var.user!.profile?.nickname ?? "");
  return c.redirect("/host?notice=table_sent");
});

const CIRCLE_SEND_MAX = 100;

/**
 * Sends a private hangout to the host's circle (mutual connections, including
 * a Bangkok Buddy): each gets a notification with the link, and it shows on
 * their circle page. Safe to repeat: people already sent to are skipped.
 */
hostRoutes.post("/host/:id/circle", async (c) => {
  const db = getDb(c.env);
  const [e] = await db.select().from(events).where(eq(events.id, c.req.param("id"))).limit(1);
  if (!e || !ownsEvent(e, viewerOf(c)) || e.visibility !== "private" || e.status !== "published" || !e.privateToken) return c.redirect("/host");
  const me = c.var.user!.account.id;
  const [conns, blocked, already] = await Promise.all([
    db
      .select({ a: connections.aAccount, b: connections.bAccount })
      .from(connections)
      .where(and(isNull(connections.removedAt), or(eq(connections.aAccount, me), eq(connections.bAccount, me))))
      .limit(1000),
    db
      .select({ blocker: blocks.blocker, blocked: blocks.blocked })
      .from(blocks)
      .where(or(eq(blocks.blocker, me), eq(blocks.blocked, me)))
      .limit(1000),
    db.select({ to: circleShares.toAccount }).from(circleShares).where(eq(circleShares.eventId, e.id)).limit(1000),
  ]);
  const skip = new Set([...blocked.flatMap((b) => [b.blocker, b.blocked]), ...already.map((x) => x.to), me]);
  const ids = [...new Set(conns.map((x) => (x.a === me ? x.b : x.a)))].filter((id) => !skip.has(id));
  const active = ids.length
    ? (await db.select({ id: accounts.id, status: accounts.status }).from(accounts).where(inArray(accounts.id, ids)).limit(ids.length)).filter((a) => a.status === "active").map((a) => a.id)
    : [];
  const to = active.slice(0, CIRCLE_SEND_MAX);
  if (to.length) {
    const nick = c.var.user!.profile?.nickname ?? "";
    const title = e.titleEn ?? e.title;
    await batch(c.env, [
      db
        .insert(circleShares)
        .values(to.map((id) => ({ id: newId(), eventId: e.id, fromAccount: me, toAccount: id, createdAt: new Date() })))
        .onConflictDoNothing({ target: [circleShares.eventId, circleShares.toAccount] }),
      ...to.map((id) =>
        notify(db, id, "circle_hangout", `${nick} ชวนคุณไปนัดส่วนตัว: ${e.title}`, `${nick} invited you to a private plan: ${title}`, `/events/${e.id}?t=${encodeURIComponent(e.privateToken!)}`),
      ),
      audit(db, me, "event.circle_share", { type: "event", id: e.id }),
    ]);
  }
  return c.redirect("/host?notice=circle_sent");
});

hostRoutes.post("/host/:id/private-link/reset", async (c) => {
  const [e] = await getDb(c.env).select().from(events).where(eq(events.id, c.req.param("id"))).limit(1);
  if (!e || !ownsEvent(e, viewerOf(c)) || e.visibility !== "private") return c.redirect("/host");
  const db = getDb(c.env);
  await batch(c.env, [
    db.update(events).set({ privateToken: randomToken(32) }).where(eq(events.id, e.id)),
    // The audit records that a reset happened, never the link itself.
    audit(db, c.var.user!.account.id, "event.private_link_reset", { type: "event", id: e.id }),
  ]);
  return c.redirect("/host?notice=link_reset");
});
