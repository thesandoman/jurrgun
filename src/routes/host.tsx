/**
 * Community hosting (Phase 1): any onboarded member can propose an event.
 *
 *   GET  /host                          my hosted events, with status and private links
 *   GET  /host/new   POST /host/new     propose an event
 *   GET  /host/:id/edit  POST …/edit    change a proposal (draft, waiting or sent back)
 *   POST /host/:id/withdraw             take a proposal back (it becomes a draft)
 *   POST /host/:id/private-link/reset   new private link; the old one stops working
 *
 * A proposal waits for review (src/routes/admin/review.tsx) unless its host
 * publishes directly (trusted host, partner admin, Jurrgun team). Rules live
 * in src/domain/hosting.ts. Money never passes through Jurrgun: the host says
 * whether it's free or paid at the venue, and may link their own payment page.
 */
import { Hono, type Context } from "hono";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { batch, getDb } from "../db";
import { checkProposal, memberCanEdit, ownsEvent, publishesDirectly, toBangkokInput, type ProposalInput } from "../domain/hosting";
import { DISTRICTS, EVENT_TAGS, INTENSITY, LANGUAGES, label, values } from "../lib/constants";
import { newId, randomToken } from "../lib/crypto";
import type { AppEnv } from "../lib/env";
import { fmtDate } from "../lib/i18n";
import { audit } from "../lib/records";
import { requireMember } from "../lib/session";
import { events, type Event } from "../schema";
import { Button, Card, Choices, Empty, Field, LinkButton, list, Notice, page, Select, str, Tag, TextArea, Toggle, view, type View } from "../ui/kit";

export const hostRoutes = new Hono<AppEnv>();
hostRoutes.use("/host", requireMember);
hostRoutes.use("/host/*", requireMember);

type C = Context<AppEnv>;
/** Proposals waiting at once, per member: keeps the review queue fair. */
export const MAX_PENDING = 3;

const ALLOWED = () => ({ districts: values(DISTRICTS), languages: values(LANGUAGES), intensity: values(INTENSITY), tags: values(EVENT_TAGS).filter((x) => x !== "city_quest") });

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
    intensity: "social",
    groupMin: "4",
    groupMax: "6",
    plusOneAllowed: false,
    tags: [],
    visibility: "public",
    accessibility: "",
    safetyInfo: "",
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
    intensity: e.intensity,
    groupMin: String(e.groupMin),
    groupMax: String(e.groupMax),
    plusOneAllowed: e.plusOneAllowed,
    tags: e.tags,
    visibility: e.visibility,
    accessibility: e.accessibility,
    safetyInfo: e.safetyInfo,
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
    intensity: s("intensity"),
    groupMin: s("groupMin"),
    groupMax: s("groupMax"),
    plusOneAllowed: s("plusOneAllowed") === "1",
    tags: list(body.tags),
    visibility: s("visibility"),
    accessibility: s("accessibility"),
    safetyInfo: s("safetyInfo"),
  };
}

const viewerOf = (c: C) => {
  const a = c.var.user!.account;
  return { id: a.id, role: a.role, partnerOrgId: a.partnerOrgId };
};

/** The full private link for an event (shown to its host only). */
const privateLink = (c: C, e: Event) => `${new URL(c.req.url).origin}/events/${e.id}?t=${encodeURIComponent(e.privateToken ?? "")}`;

function statusTag(t: View["t"], s: string) {
  switch (s) {
    case "pending":
      return <Tag tone="warn">{t("รอตรวจ", "Waiting for review")}</Tag>;
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
  const direct = publishesDirectly(me);
  return page(
    c,
    { title: t("จัดกิจกรรม", "Host an event"), tab: "me" },
    <>
      <p>
        <a href="/settings">← {t("ฉัน", "Me")}</a>
      </p>
      <h1>{t("จัดกิจกรรมของคุณเอง", "Host your own event")}</h1>
      <p class="muted">
        {direct
          ? t("กิจกรรมของคุณเผยแพร่ได้ทันที", "Your events go live straight away.")
          : t("เสนอกิจกรรม แล้วทีมงานจะตรวจก่อนเผยแพร่ (ปกติภายใน 1–2 วัน)", "Propose an event and the team checks it before it goes live (usually within a day or two).")}{" "}
        {t("จะฟรี หรือจ่ายที่สถานที่ก็ได้ Jurrgun ไม่รับชำระเงินแทน", "It can be free or paid at the venue. Jurrgun never takes payment.")}
      </p>
      {c.req.query("notice") === "submitted" ? <Notice kind="ok">{t("ส่งให้ทีมงานตรวจแล้ว เราจะแจ้งเมื่อเผยแพร่", "Sent for review. We'll let you know when it's live.")}</Notice> : null}
      {c.req.query("notice") === "published" ? <Notice kind="ok">{t("เผยแพร่แล้ว!", "It's live!")}</Notice> : null}
      {c.req.query("notice") === "link_reset" ? <Notice kind="ok">{t("สร้างลิงก์ใหม่แล้ว ลิงก์เดิมใช้ไม่ได้อีก", "New private link made. The old one no longer works.")}</Notice> : null}
      <p>
        <LinkButton href="/host/new">＋ {t("เสนอกิจกรรม", "Propose an event")}</LinkButton>
      </p>
      {mine.length === 0 ? (
        <Empty>{t("ยังไม่มีกิจกรรมที่คุณจัด", "You haven't hosted anything yet.")}</Empty>
      ) : (
        mine.map((e) => (
          <Card>
            <div class="spread">
              <strong>{lang === "en" && e.titleEn ? e.titleEn : e.title}</strong>
              {statusTag(t, e.status)}
            </div>
            <p class="muted" style="margin:4px 0">
              {fmtDate(e.startsAt, lang)} · {e.venueName} · {label(DISTRICTS, e.district, lang)}
              {e.visibility === "private" ? ` · 🔒 ${t("ส่วนตัว", "Private")}` : ""}
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
                {t("ดู", "View")}
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
              {e.visibility === "private" && e.status === "published" ? (
                <form method="post" action={`/host/${e.id}/private-link/reset`}>
                  <Button kind="ghost">{t("สร้างลิงก์ใหม่", "New link")}</Button>
                </form>
              ) : null}
            </div>
            {e.status === "published" ? (
              <p class="muted" style="margin:6px 0 0">
                {t("ต้องการแก้ไขหรือยกเลิกกิจกรรมที่เผยแพร่แล้ว ติดต่อทีมงาน", "To change or cancel a live event, contact the team.")}
              </p>
            ) : null}
          </Card>
        ))
      )}
    </>,
  );
});

// ------------------------------------------------------------------ form --

function ProposalForm(props: { v: View; d: ProposalInput; action: string; errors?: string[]; editing: boolean; direct: boolean }) {
  const { v, d } = props;
  const { t, lang } = v;
  const tags = EVENT_TAGS.filter((x) => x.value !== "city_quest");
  const visOpts = [
    { value: "public", th: "สาธารณะ — แสดงบนหน้าค้นหา", en: "Public — listed on Discover" },
    { value: "private", th: "ส่วนตัว — เฉพาะคนที่มีลิงก์", en: "Private — only people with the link" },
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
      <Card>
        <h2>{t("กิจกรรมอะไร", "What's the plan?")}</h2>
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
        <Field label={t("สถานที่", "Venue")} name="venueName" value={d.venueName} required maxlength={200} />
        <Field label={t("ที่อยู่", "Address")} name="venueAddress" value={d.venueAddress} maxlength={400} />
        <Field label={t("ลิงก์แผนที่ (ไม่บังคับ)", "Map link (optional)")} name="mapUrl" type="url" value={d.mapUrl} placeholder="https://maps.google.com/…" maxlength={500} />
        <Select label={t("เขต", "District")} name="district" options={DISTRICTS} value={d.district} lang={lang} required blank={t("— เลือกเขต —", "— Choose —")} />
      </Card>
      <Card>
        <h2>{t("ใครมาได้", "Who it's for")}</h2>
        <div class="grid2">
          <Field label={t("จำนวนคน", "How many people")} name="capacity" type="number" min={2} max={60} value={d.capacity} required />
          <Select label={t("ความคึกคัก", "Social intensity")} name="intensity" options={INTENSITY} value={d.intensity} lang={lang} />
          <Field label={t("อายุต่ำสุด", "Minimum age")} name="ageMin" type="number" min={18} max={99} value={d.ageMin} required />
          <Field label={t("อายุสูงสุด", "Maximum age")} name="ageMax" type="number" min={18} max={99} value={d.ageMax} required />
          <Field label={t("กลุ่มเล็กสุด", "Smallest table")} name="groupMin" type="number" min={2} max={12} value={d.groupMin} required />
          <Field label={t("กลุ่มใหญ่สุด", "Largest table")} name="groupMax" type="number" min={2} max={12} value={d.groupMax} required />
        </div>
        <Choices legend={t("ภาษา", "Languages")} name="languages" options={LANGUAGES} values={d.languages} lang={lang} />
        <Toggle name="plusOneAllowed" label={t("ชวนเพื่อนมาได้ 1 คน", "Guests can bring a friend (+1)")} checked={d.plusOneAllowed} />
        <Select label={t("ใครเห็นกิจกรรมนี้", "Who can see it")} name="visibility" options={visOpts} value={d.visibility} lang={lang} />
      </Card>
      <Card>
        <h2>{t("ค่าใช้จ่ายและความปลอดภัย", "Cost and safety")}</h2>
        <Field label={t("ค่าใช้จ่ายต่อคน (บาท, 0 = ฟรี)", "Cost per person (baht, 0 = free)")} name="costThb" type="number" min={0} max={20000} value={d.costThb} />
        <Field label={t("วิธีชำระเงิน (เช่น จ่ายที่ร้าน / พร้อมเพย์)", "How to pay (e.g. at the venue, PromptPay)")} name="paymentNote" value={d.paymentNote} maxlength={500} />
        <Field
          label={t("ลิงก์ชำระเงินของคุณ (ไม่บังคับ)", "Your payment link (optional)")}
          name="paymentUrl"
          type="url"
          value={d.paymentUrl}
          placeholder="https://…"
          maxlength={500}
          hint={t("Jurrgun ไม่รับชำระเงินแทน ผู้เข้าร่วมจะจ่ายกับคุณโดยตรง", "Jurrgun never takes payment; people pay you directly.")}
        />
        <TextArea label={t("การเข้าถึง (ไม่บังคับ)", "Accessibility (optional)")} name="accessibility" value={d.accessibility} maxlength={1000} />
        <TextArea label={t("จุดนัดพบและความปลอดภัย", "Meeting point and safety")} name="safetyInfo" value={d.safetyInfo} maxlength={1000} />
      </Card>
      <p class="muted">
        {t("โดยการส่ง คุณยืนยันว่าจะดูแลผู้เข้าร่วมตาม", "By sending this you agree to look after your guests in line with the")} <a href="/code-of-conduct">{t("หลักปฏิบัติของชุมชน", "code of conduct")}</a>.
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

hostRoutes.get("/host/new", (c) => {
  const v = view(c);
  const me = c.var.user!.account;
  return formPage(c, { v, d: emptyInput(v.lang), action: "/host/new", editing: false, direct: publishesDirectly(me) });
});

hostRoutes.post("/host/new", async (c) => {
  const v = view(c);
  const me = c.var.user!.account;
  const direct = publishesDirectly(me);
  const d = inputFromBody(await c.req.parseBody({ all: true }));
  const { values: vals, errors } = checkProposal(d, ALLOWED());
  const msgs = errors.map((e) => v.t(e.th, e.en));
  if (!direct && (await pendingCount(c, me.id)) >= MAX_PENDING) {
    msgs.push(v.t(`มีกิจกรรมรอตรวจได้ครั้งละ ${MAX_PENDING} รายการ`, `You can have up to ${MAX_PENDING} events waiting for review at once.`));
  }
  if (!vals || msgs.length) return formPage(c, { v, d, action: "/host/new", errors: msgs, editing: false, direct }, 400);

  const db = getDb(c.env);
  const id = newId();
  const now = new Date();
  await batch(c.env, [
    db.insert(events).values({
      id,
      ...vals,
      descriptionEn: null,
      emergencyContact: "191 / 1669",
      hostAccountId: me.id,
      partnerOrgId: me.role === "partner_admin" ? me.partnerOrgId : null,
      privateToken: vals.visibility === "private" ? randomToken(32) : null,
      status: direct ? "published" : "pending",
      submittedAt: now,
      createdBy: me.id,
    }),
    audit(db, me.id, direct ? "event.host_publish" : "event.host_submit", { type: "event", id }),
  ]);
  return c.redirect(`/host?notice=${direct ? "published" : "submitted"}`);
});

/** The member's own event, if they may still change it; null otherwise. */
async function ownEditable(c: C): Promise<Event | null> {
  const [e] = await getDb(c.env).select().from(events).where(eq(events.id, c.req.param("id") ?? "")).limit(1);
  return e && ownsEvent(e, viewerOf(c)) && memberCanEdit(e) ? e : null;
}

hostRoutes.get("/host/:id/edit", async (c) => {
  const v = view(c);
  const e = await ownEditable(c);
  if (!e) return c.redirect("/host");
  return formPage(c, { v, d: inputFromEvent(e), action: `/host/${e.id}/edit`, editing: true, direct: publishesDirectly(c.var.user!.account) });
});

hostRoutes.post("/host/:id/edit", async (c) => {
  const v = view(c);
  const me = c.var.user!.account;
  const e = await ownEditable(c);
  if (!e) return c.redirect("/host");
  const direct = publishesDirectly(me);
  const d = inputFromBody(await c.req.parseBody({ all: true }));
  const { values: vals, errors } = checkProposal(d, ALLOWED());
  if (!vals) return formPage(c, { v, d, action: `/host/${e.id}/edit`, errors: errors.map((x) => v.t(x.th, x.en)), editing: true, direct }, 400);
  const db = getDb(c.env);
  await batch(c.env, [
    db
      .update(events)
      .set({
        ...vals,
        privateToken: vals.visibility === "private" ? (e.privateToken ?? randomToken(32)) : e.privateToken,
        status: direct ? "published" : "pending",
        reviewNote: null,
        submittedAt: new Date(),
      })
      .where(and(eq(events.id, e.id), inArray(events.status, ["draft", "pending", "rejected"]))),
    audit(db, me.id, direct ? "event.host_publish" : "event.host_resubmit", { type: "event", id: e.id }),
  ]);
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
