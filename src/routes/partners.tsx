/**
 * Partners and vendors (D47).
 *
 *   GET  /partners                        the public explainer (owner U2), one Apply button
 *   GET  /partner/apply   POST …          a signed-in member applies for their organisation
 *   GET  /partner                         the partner area (partner admins)
 *   POST /partner/feeds                   add the partner's own calendar feed (terms note required)
 *   POST /partner/feeds/:id/pause|resume
 *   POST /partner/keys                    make a key (shown once)
 *   POST /partner/keys/:id/revoke
 *   POST /partner/events/:id/cohosts                 invite a co-host (D53)
 *   POST /partner/events/:id/cohosts/:invite/remove  withdraw or remove a co-host
 *   POST /partner/invites/:invite/accept|decline     answer an invitation
 *
 * Only an admin (bma_admin) verifies applications, since that grants
 * partner_admin (owner card A; src/routes/admin/outside.tsx). A partner sees its own events with
 * booking counts and a referral code per event: never names, never who.
 */
import { Hono, type Context } from "hono";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { batch, getDb } from "../db";
import { newId } from "../lib/crypto";
import type { AppEnv } from "../lib/env";
import { fmtDate } from "../lib/i18n";
import { audit } from "../lib/records";
import { requireRole, requireUser } from "../lib/session";
import { accounts, eventFeeds, partnerApplications, partnerKeys, partnerOrgs, PARTNER_KINDS, type PartnerKind } from "../schema";
import { checkOutsideUrl } from "../services/outside-fetch";
import { isAdminOnlyKind } from "../domain/event-rules";
import { createPartnerKey, KEYS_PER_ORG, revokePartnerKey } from "../services/partner-keys";
import { partnerCounts, partnerEvents } from "./partner-api";
import { cohostsFor, invitablePartners, invitationsFor, inviteCohost, removeCohost, respondToInvite } from "../services/collabs";
import { MAX_COHOSTS } from "../domain/event-rules";
import { Button, Card, Empty, Field, LinkButton, Notice, page, str, Tag, TextArea, view, type View } from "../ui/kit";
import { Bento, Pill, Tile } from "../ui/visual";

export const partnerRoutes = new Hono<AppEnv>();
type C = Context<AppEnv>;

export const KIND_TEXT: Record<PartnerKind, [string, string]> = {
  events: ["ผู้จัดงานหรือแพลตฟอร์มขายบัตร", "Event organiser or ticketing platform"],
  venue: ["สถานที่ (คาเฟ่ ร้าน แกลเลอรี)", "Venue (café, bar, gallery)"],
  community: ["ชุมชน ชมรม หรือมหาวิทยาลัย", "Community, club or university"],
  dating: ["แอปเดตหรือแอปหาเพื่อน 💘", "Dating or friend app 💘"],
  health: ["สุขภาพ (รัฐหรือไม่แสวงกำไร)", "Health (public or non-profit)"],
  public_sector: ["หน่วยงานรัฐ", "Public sector"],
};
const isKind = (k: string): k is PartnerKind => (PARTNER_KINDS as readonly string[]).includes(k);
/** Types a member can apply for. Health and public sector are set up by an admin only (D51, D55). */
const APPLY_KINDS = PARTNER_KINDS.filter((k) => !isAdminOnlyKind(k));

/** The apply form's two intro paragraphs; /partners opens with the first. */
export const APPLY_INTRO: [[string, string], [string, string]] = [
  [
    "ผู้จัดงาน สถานที่ ชุมชน และแพลตฟอร์มขายบัตร จัดโต๊ะไปงานด้วยกันบน Jurrgun ได้ ทีมงานตรวจและยืนยันก่อน แล้วคุณจะได้พื้นที่พาร์ตเนอร์ของตัวเอง",
    "Organisers, venues, communities and ticketing platforms can run go-together tables on Jurrgun. The team checks and verifies you first, then you get your own partner area.",
  ],
  [
    "พาร์ตเนอร์ไม่เคยได้ข้อมูลสมาชิก เห็นแค่จำนวนคนจองและเช็กอินของแต่ละงาน ทุกงานต้องมีเจ้าภาพที่ระบุชื่อและจุดนัดพบที่เป็นที่สาธารณะ",
    "Partners never get member data: only how many booked and checked in at each event. Every event needs a named host and a public meeting point.",
  ],
];

/** Who can't apply but is set up by the team (D51, D55): the same sentence on the form and on /partners. */
export const ADMIN_SET_LINE: [string, string] = [
  "หน่วยงานรัฐ ศูนย์บริการสาธารณสุข และคลินิกไม่แสวงกำไร ทีมงานตั้งให้โดยตรง ติดต่อทีม Jurrgun",
  "Government bodies, public health centres and non-profit clinics are set up by the team directly. Contact the Jurrgun team.",
];

// ---------------------------------------------------------- explainer --

type Two = [string, string];

/**
 * /partners, the public explainer (owner U2, 2026-10-30). Written only from the
 * facts Partners gave for main today: no real partners, counts or quotes, no
 * fee promise past "no fee today", the BMA never as maker or endorser, and the
 * dating kind left to the apply form, which already lists it.
 */
export const PARTNERS_COPY = {
  title: ["เป็นพาร์ตเนอร์กับ Jurrgun", "Partner with Jurrgun"] as Two,
  pill: ["สำหรับองค์กร", "For organisations"] as Two,
  hero: ["เป็นพาร์ตเนอร์|กับ Jurrgun", "Partner with Jurrgun"] as Two,
  sub: APPLY_INTRO[0],
  whoTitle: ["ใครสมัครได้", "Who can apply"] as Two,
  who: [
    ["ผู้จัดงานและแพลตฟอร์มขายบัตร", "Event organisers and ticketing platforms"],
    ["สถานที่ เช่น คาเฟ่ บาร์ และแกลเลอรี", "Venues such as cafés, bars and galleries"],
    ["ชุมชน ชมรม และมหาวิทยาลัย", "Communities, clubs and universities"],
  ] as Two[],
  canTitle: ["สิ่งที่พาร์ตเนอร์ทำได้", "What you can do"] as Two,
  can: [
    ["จัดโต๊ะไปงานด้วยกัน ทุกงานมีเจ้าภาพที่ระบุชื่อและจุดนัดพบที่เป็นที่สาธารณะ", "Run go-together tables. Every event has a named host and a public meeting point."],
    ["ลงงานจากระบบของคุณเองด้วยคีย์ที่ Jurrgun ให้ และยกเลิกคีย์ได้", "Post events from your own system with a key Jurrgun gives you. The key can be revoked."],
    ["เพิ่มฟีดปฏิทินของคุณ พร้อมหมายเหตุว่าข้อกำหนดของแหล่งที่มาอนุญาตอะไรบ้าง", "Add your calendar feed, with a note on what the source's terms allow."],
    [
      "ชวนพาร์ตเนอร์ที่ยืนยันแล้วอีกไม่เกิน 2 รายมาร่วมจัด คำเชิญเปิดไว้ 3 วัน และปิดก่อนวันงาน 1 วัน ถ้าพาร์ตเนอร์ไม่ตอบ งานจะเดินหน้าต่อโดยไม่มีพาร์ตเนอร์รายนั้น ทุกพาร์ตเนอร์มีชื่อบนงาน และเห็นตัวเลขเดียวกัน",
      "Invite up to 2 other verified partners to co-host. Invitations stay open for 3 days and close a day before the event; if a partner doesn't answer, the event goes ahead without them. Every partner is named and all see the same counts.",
    ],
    ["มีรหัสแนะนำของแต่ละงาน", "Get a referral code for each event."],
    [
      "ตั้งเงื่อนไขเข้างาน: ผู้จัดอนุมัติก่อน กลุ่มที่เข้าด้วยรหัส (เช่น นักศึกษามหาวิทยาลัยพาร์ตเนอร์) สิ่งที่ต้องเตรียมหรือควรรู้ มีแอลกอฮอล์ (งานจะเป็น 20+) ปลอดบุหรี่หรือมีที่สูบ หรือเข้างานได้ทุกคนพร้อมกลุ่มไปด้วยกัน",
      "Set entry rules: organiser approval, a join-code group (for example, students of a partner university), things to bring or know, alcohol served (the event becomes 20+), smoke-free or a smoking area, or open entry with go-together groups.",
    ],
  ] as Two[],
  privacyTitle: ["ความเป็นส่วนตัวของสมาชิก หมายถึงอะไรสำหรับคุณ", "What members' privacy means for you"] as Two,
  privacy: [
    ["ไม่มีข้อมูลสมาชิก: ไม่มีชื่อ รายชื่อ หรือช่องทางติดต่อ", "No member data: no names, lists or contacts."],
    ["เห็นแค่จำนวนคนที่จองและเช็กอิน และแสดงเมื่อมีตั้งแต่ 10 คนขึ้นไปเท่านั้น", "Only counts of how many booked and checked in, and only from 10 people up."],
    ["งานให้ความรู้ด้านสุขภาพไม่มีรายชื่อผู้เข้าร่วม และรับคำถามแบบไม่ระบุชื่อ", "Health talks have no attendee list and take anonymous questions."],
  ] as Two[],
  howTitle: ["ขั้นตอน", "How it works"] as Two,
  how: [
    ["สมัคร: ลงชื่อเข้าใช้ แล้วกรอกแบบฟอร์มสั้น ๆ เกี่ยวกับองค์กรของคุณ", "Apply: sign in and fill in a short form about your organisation."],
    [
      "ตรวจสอบ: ผู้ดูแลของ Jurrgun ตรวจองค์กร แล้วยืนยัน หรือปฏิเสธพร้อมหมายเหตุ คุณจะรู้ผลในการแจ้งเตือน",
      "Review: a Jurrgun admin checks the organisation, then verifies it or declines with a note. You hear in your notifications.",
    ],
    ["ยืนยันแล้ว: คุณเป็นผู้ดูแลพาร์ตเนอร์ขององค์กร และได้พื้นที่พาร์ตเนอร์ของตัวเอง", "Verified: you become the organisation's partner admin, with your own partner area."],
  ] as Two[],
  fee: ["ตอนนี้ไม่มีค่าธรรมเนียม", "There's no fee today."] as Two,
  oversight: [
    "หลังมีการรายงาน ทีมงานส่งพาร์ตเนอร์กลับไปตรวจใหม่ได้ และหยุดชั่วคราวหรือถอดงานใดก็ได้",
    "After reports, the team can send a partner back to review, and can pause or take down any event.",
  ] as Two,
  rulesTitle: ["กติกาที่ผู้จัดยอมรับ", "The rules organisers accept"] as Two,
  rules: [
    [
      "ที่สาธารณะ มีเจ้าภาพที่ระบุชื่อ และทำตามหลักปฏิบัติ (ห้ามบุหรี่ไฟฟ้า กัญชา และยาเสพติดอื่น)",
      "Public places, a named host, and the code of conduct (no vaping, cannabis or other drugs).",
    ],
    ["ไม่มีงาน พาร์ตเนอร์ หรือการโปรโมตเกี่ยวกับกัญชา", "No cannabis events, partners or promotion."],
    [
      "งานที่มีแอลกอฮอล์ จำกัดอายุเกิน 18 ปี หรือมีกิจกรรมที่ใช้แรง สมาชิกต้องติ๊กยอมรับข้อความสั้น ๆ ก่อนจอง",
      "Alcohol, an age limit over 18 or physical activity means members tick a short disclaimer before booking.",
    ],
    ["งานสุขภาพให้ข้อมูลเท่านั้น: ฟรี ไม่มีลิงก์ขายบัตรหรือชำระเงิน และไม่ขายอะไร", "Health events are information only: free, with no ticket or payment link, and nothing sold."],
    ["งานสำหรับผู้หญิงและนอนไบนารีเท่านั้น ต้องมีเจ้าภาพเป็นผู้หญิงหรือนอนไบนารี", "Women and non-binary only events need a woman or non-binary host."],
  ] as Two[],
  conduct: ["อ่านหลักปฏิบัติ", "Read the code of conduct"] as Two,
  cta: ["สมัครเป็นพาร์ตเนอร์", "Apply"] as Two,
  ctaNote: ["ระบบจะให้ลงชื่อเข้าใช้ก่อนสมัคร", "You'll be asked to sign in first."] as Two,
  contact: ADMIN_SET_LINE,
};

/** The search snippet, only from the page's own words: the hero's first sentence, then the fee line. */
export const PARTNERS_DESCRIPTION: Two = [
  `ผู้จัดงาน สถานที่ ชุมชน และแพลตฟอร์มขายบัตร จัดโต๊ะไปงานด้วยกันบน Jurrgun ได้ ${PARTNERS_COPY.fee[0]}`,
  `Organisers, venues, communities and ticketing platforms can run go-together tables on Jurrgun. ${PARTNERS_COPY.fee[1]}`,
];

const PARTNERS_CSS = `
.pt-list{display:grid;gap:8px;padding-left:1.3em;margin:0 0 16px}
.pt-list li::marker{color:var(--brand);font-weight:700}
.pt-cta{margin:24px 0 8px}
`;

function PtList(props: { v: View; items: Two[]; ordered?: boolean }) {
  const items = props.items.map((x) => <li>{props.v.t(x[0], x[1])}</li>);
  return props.ordered ? <ol class="pt-list">{items}</ol> : <ul class="pt-list">{items}</ul>;
}

partnerRoutes.get("/partners", (c) => {
  const v = view(c);
  const { t, lang } = v;
  const k = PARTNERS_COPY;
  const T = (x: Two) => t(x[0], x[1]);
  return page(
    c,
    { title: T(k.title), description: T(PARTNERS_DESCRIPTION) },
    <>
      <style dangerouslySetInnerHTML={{ __html: PARTNERS_CSS }} />
      <Bento>
        <Tile size="hero" tone="brand" art={{ tone: "evening", icons: [], seed: 31 }} lang={lang}>
          <Pill dot>{T(k.pill)}</Pill>
          {/* Phrases stay whole, so Thai never breaks mid-word-group. */}
          <h1>
            {T(k.hero)
              .split("|")
              .map((w, i) => (
                <>
                  {i ? " " : ""}
                  <span style="white-space:nowrap">{w}</span>
                </>
              ))}
          </h1>
          <small>{T(k.sub)}</small>
        </Tile>
      </Bento>

      <h2>{T(k.whoTitle)}</h2>
      <PtList v={v} items={k.who} />

      <h2>{T(k.canTitle)}</h2>
      <PtList v={v} items={k.can} />

      <h2>{T(k.privacyTitle)}</h2>
      <PtList v={v} items={k.privacy} />

      <h2>{T(k.howTitle)}</h2>
      <PtList v={v} items={k.how} ordered />
      <p>
        <strong>{T(k.fee)}</strong> {T(k.oversight)}
      </p>

      <h2>{T(k.rulesTitle)}</h2>
      <PtList v={v} items={k.rules} />
      <p>
        <a href="/code-of-conduct">{T(k.conduct)}</a>
      </p>

      <div class="row pt-cta">
        <a href="/partner/apply" class="btn primary start-cta">
          <span>{T(k.cta)}</span>
          <span class="start-arrow" aria-hidden="true">→</span>
        </a>
      </div>
      <p class="muted">{T(k.ctaNote)}</p>
      <p class="muted">{T(k.contact)}</p>
    </>,
  );
});

// ------------------------------------------------------------- apply --

partnerRoutes.use("/partner/apply", requireUser);

async function applyPage(c: C, errors: string[] = [], d: Record<string, string> = {}, status?: 400) {
  const v = view(c);
  const { t, lang } = v;
  const me = c.var.user!.account;
  const [mine] = await getDb(c.env)
    .select()
    .from(partnerApplications)
    .where(eq(partnerApplications.accountId, me.id))
    .orderBy(desc(partnerApplications.createdAt))
    .limit(1);
  const pending = mine?.status === "pending";
  return page(
    c,
    { title: t("สมัครเป็นพาร์ตเนอร์", "Become a partner"), tab: "me", status },
    <>
      <h1>{t("สมัครเป็นพาร์ตเนอร์", "Become a partner")}</h1>
      <p class="muted">{t(...APPLY_INTRO[0])}</p>
      <p class="muted">{t(...APPLY_INTRO[1])}</p>
      {me.role === "partner_admin" ? (
        <p>
          <LinkButton href="/partner">{t("ไปที่พื้นที่พาร์ตเนอร์", "Go to your partner area")}</LinkButton>
        </p>
      ) : pending ? (
        <Notice kind="ok">{t(`ได้รับใบสมัครของ ${mine.orgName} แล้ว ทีมงานจะแจ้งผลในการแจ้งเตือน`, `We have ${mine.orgName}'s application. The team will tell you in your notifications.`)}</Notice>
      ) : (
        <form method="post" action="/partner/apply">
          {mine?.status === "declined" && mine.reviewNote ? <Notice kind="warn">{t(`ใบสมัครก่อนหน้า: ${mine.reviewNote}`, `Your last application: ${mine.reviewNote}`)}</Notice> : null}
          {errors.length ? (
            <Notice kind="error">
              <ul>
                {errors.map((e) => (
                  <li>{e}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
          <Card>
            <Field label={t("ชื่อองค์กร", "Organisation name")} name="orgName" value={d.orgName} required maxlength={100} autocomplete="organization" />
            <div class="field">
              <label for="f-kind">{t("ประเภท", "Type")}</label>
              <select id="f-kind" name="kind" required>
                {APPLY_KINDS.map((k) => (
                  <option value={k} selected={(d.kind || "events") === k}>
                    {lang === "en" ? KIND_TEXT[k][1] : KIND_TEXT[k][0]}
                  </option>
                ))}
              </select>
              <small>{t("แอปเดต: กิจกรรมจะเห็นได้เฉพาะสมาชิกที่เปิดรับเรื่องเดต 💘 เท่านั้น", "Dating apps: your events are seen only by members who opted into 💘.")}</small>
              <small>{t(...ADMIN_SET_LINE)}</small>
            </div>
            <Field label={t("เว็บไซต์ (ไม่บังคับ)", "Website (optional)")} name="website" type="url" value={d.website} placeholder="https://…" maxlength={300} inputmode="url" autocapitalize="none" />
            <Field
              label={t("ช่องทางติดต่อของงาน", "Work contact")}
              name="contact"
              value={d.contact}
              required
              maxlength={200}
              hint={t("อีเมลหรือเบอร์โทรขององค์กร ทีมงานใช้ติดต่อเพื่อยืนยันเท่านั้น", "The organisation's email or phone. The team uses it only to verify you.")}
            />
            <TextArea label={t("เล่าสั้น ๆ ว่าจัดงานแบบไหน (ไม่บังคับ)", "What kind of events you run (optional)")} name="about" value={d.about} rows={3} maxlength={1000} />
          </Card>
          <div class="row end">
            <Button>{t("ส่งใบสมัคร", "Send application")}</Button>
          </div>
        </form>
      )}
    </>,
  );
}

partnerRoutes.get("/partner/apply", (c) => applyPage(c));

partnerRoutes.post("/partner/apply", async (c) => {
  const { t } = view(c);
  const me = c.var.user!.account;
  const body = await c.req.parseBody();
  const d = { orgName: str(body.orgName), kind: str(body.kind) || "events", website: str(body.website), contact: str(body.contact), about: str(body.about) };
  const errors: string[] = [];
  if (d.orgName.length < 2 || d.orgName.length > 100) errors.push(t("ใส่ชื่อองค์กร (2 ถึง 100 ตัวอักษร)", "Add the organisation's name (2 to 100 characters)."));
  if (!isKind(d.kind) || isAdminOnlyKind(d.kind)) errors.push(t("เลือกประเภท", "Choose a type."));
  const website = d.website ? checkOutsideUrl(d.website) : null;
  if (d.website && !website) errors.push(t("เว็บไซต์ต้องขึ้นต้นด้วย https://", "The website must start with https://"));
  if (d.contact.length < 5 || d.contact.length > 200) errors.push(t("ใส่ช่องทางติดต่อของงาน", "Add a work contact."));
  if (d.about.length > 1000) errors.push(t("เล่าได้ไม่เกิน 1,000 ตัวอักษร", "At most 1,000 characters."));
  const db = getDb(c.env);
  const [open] = await db
    .select({ id: partnerApplications.id })
    .from(partnerApplications)
    .where(and(eq(partnerApplications.accountId, me.id), eq(partnerApplications.status, "pending")))
    .limit(1);
  if (open) return c.redirect("/partner/apply");
  if (errors.length) return applyPage(c, errors, d, 400);
  const id = newId();
  await batch(c.env, [
    db.insert(partnerApplications).values({ id, accountId: me.id, orgName: d.orgName, kind: d.kind as PartnerKind, website: website?.toString() ?? null, contact: d.contact, about: d.about }),
    audit(db, me.id, "partner.apply", { type: "partner_application", id }),
  ]);
  return c.redirect("/partner/apply?notice=done");
});

// ------------------------------------------------------- partner area --

partnerRoutes.use("/partner", requireRole("partner_admin"));
partnerRoutes.use("/partner/feeds/*", requireRole("partner_admin"));
partnerRoutes.use("/partner/feeds", requireRole("partner_admin"));
partnerRoutes.use("/partner/keys/*", requireRole("partner_admin"));
partnerRoutes.use("/partner/keys", requireRole("partner_admin"));
partnerRoutes.use("/partner/events/*", requireRole("partner_admin"));
partnerRoutes.use("/partner/invites/*", requireRole("partner_admin"));

const orgIdOf = (c: C) => c.var.user!.account.partnerOrgId;

async function area(c: C, opts: { newKey?: string; error?: string; status?: 400 } = {}) {
  const v: View = view(c);
  const { t, lang } = v;
  const orgId = orgIdOf(c);
  if (!orgId) return page(c, { title: t("พื้นที่พาร์ตเนอร์", "Partner area"), admin: true }, <Empty>{t("บัญชีนี้ยังไม่ได้ผูกกับองค์กร", "This account isn't linked to an organisation yet.")}</Empty>);
  const db = getDb(c.env);
  const now = new Date();
  const [[org], feeds, keys, evs, hosts, invites, invitable] = await Promise.all([
    db.select().from(partnerOrgs).where(eq(partnerOrgs.id, orgId)).limit(1),
    db.select().from(eventFeeds).where(eq(eventFeeds.partnerOrgId, orgId)).orderBy(asc(eventFeeds.createdAt)).limit(20),
    db.select().from(partnerKeys).where(eq(partnerKeys.partnerOrgId, orgId)).orderBy(desc(partnerKeys.createdAt)).limit(20),
    partnerEvents(c.env, orgId, 50),
    db.select({ username: accounts.username, role: accounts.role }).from(accounts).where(and(eq(accounts.partnerOrgId, orgId), inArray(accounts.role, ["host", "partner_admin"]))).limit(50),
    invitationsFor(c.env, orgId),
    invitablePartners(c.env, orgId),
  ]);
  const [counts, cohosts] = await Promise.all([partnerCounts(c.env, evs), cohostsFor(c.env, evs.map((e) => e.id))]);
  const shown = (n: number | null | undefined) => (n === null ? t("ไม่ถึง 10", "under 10") : (n ?? 0));
  const live = keys.filter((k) => !k.revokedAt);
  const origin = new URL(c.req.url).origin;
  return page(
    c,
    { title: t("พื้นที่พาร์ตเนอร์", "Partner area"), admin: true, status: opts.status },
    <>
      <h1>{org?.name ?? t("พื้นที่พาร์ตเนอร์", "Partner area")}</h1>
      <p>
        {org?.status === "review" ? (
          <Tag tone="warn">{t("ทีมงานกำลังตรวจ: กิจกรรมใหม่รอตรวจก่อนขึ้น", "Under review: new events wait for the team")}</Tag>
        ) : (
          <Tag tone="ok">{t("ยืนยันแล้ว: กิจกรรมขึ้นหน้าค้นหาทันที", "Verified: events go live on Discover")}</Tag>
        )}
      </p>
      {opts.error ? <Notice kind="error">{opts.error}</Notice> : null}
      {opts.newKey ? (
        <Notice kind="ok">
          {t("คีย์ใหม่ คัดลอกเก็บไว้ตอนนี้ จะไม่แสดงอีก:", "Your new key. Copy it now; it won't be shown again:")}
          <input type="text" readonly value={opts.newKey} data-select-all="" aria-label={t("คีย์ใหม่", "New key")} />
        </Notice>
      ) : null}

      {invites.length ? (
        <>
          <h2>{t("คำเชิญร่วมจัด", "Invitations to co-host")}</h2>
          {invites.map((i) => (
            <Card>
              <strong>{lang === "en" && i.titleEn ? i.titleEn : i.title}</strong> <small class="muted">{fmtDate(i.startsAt, lang)}</small>
              <p class="muted" style="margin:4px 0">{t(`${i.leadName} ชวนคุณร่วมจัด ชื่อคุณจะขึ้นในกิจกรรม และเห็นยอดเดียวกัน`, `${i.leadName} invites you to co-host. Your name shows on the event and you see the same counts.`)}</p>
              <div class="row">
                <form method="post" action={`/partner/invites/${i.inviteId}/accept`}>
                  <Button>{t("ร่วมจัด", "Accept")}</Button>
                </form>
                <form method="post" action={`/partner/invites/${i.inviteId}/decline`}>
                  <Button kind="ghost">{t("ไม่ร่วม", "Decline")}</Button>
                </form>
              </div>
            </Card>
          ))}
        </>
      ) : null}

      <h2>{t("กิจกรรมและยอดจอง", "Events and bookings")}</h2>
      <p class="muted">{t("เห็นแค่จำนวน ไม่เห็นว่าใครจอง วงพูดคุยส่วนตัวแสดงตัวเลขเมื่อมี 10 คนขึ้นไป", "Counts only, never who booked. Private talks show numbers from 10 people up.")}</p>
      {evs.length === 0 ? (
        <Empty>{t("ยังไม่มีกิจกรรม", "No events yet.")}</Empty>
      ) : (
        <div class="table-wrap">
          <table>
            <caption class="sr-only">{t("กิจกรรมและยอดจอง", "Events and bookings")}</caption>
            <thead>
              <tr>
                <th>{t("กิจกรรม", "Event")}</th>
                <th>{t("สถานะ", "Status")}</th>
                <th>{t("จอง", "Booked")}</th>
                <th>{t("เช็กอิน", "Checked in")}</th>
                <th>{t("รหัสอ้างอิง", "Referral code")}</th>
              </tr>
            </thead>
            <tbody>
              {evs.map((e) => (
                <tr>
                  <td>
                    <a href={`/events/${e.id}`}>{lang === "en" && e.titleEn ? e.titleEn : e.title}</a>
                    <br />
                    <small>{fmtDate(e.startsAt, lang)}</small>
                    {e.partnerOrgId !== orgId ? (
                      <>
                        {" "}
                        <Tag tone="muted">{t("ร่วมจัด", "Co-host")}</Tag>
                      </>
                    ) : null}
                    <CohostCell
                      v={v}
                      eventId={e.id}
                      lead={e.partnerOrgId === orgId && e.startsAt.getTime() > now.getTime()}
                      list={cohosts.get(e.id) ?? []}
                      invitable={invitable}
                    />
                  </td>
                  <td>{e.status}</td>
                  <td>{shown(counts.get(e.id)?.booked)}</td>
                  <td>{shown(counts.get(e.id)?.checked_in)}</td>
                  <td>
                    <code>{e.referralCode ?? "-"}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>{t("คีย์สำหรับระบบของคุณ", "Keys for your system")}</h2>
      <p class="muted">
        {t("ระบบของคุณส่งกิจกรรมเข้ามาได้ที่", "Your system posts events to")} <code>POST {origin}/api/partner/events</code> {t("พร้อม", "with")} <code>Authorization: Bearer jgk_…</code>
      </p>
      {keys.length ? (
        <ul class="plain">
          {keys.map((k) => (
            <li>
              <code>{k.prefix}…</code> {k.label ? ` ${k.label}` : ""}{" "}
              {k.revokedAt ? (
                <Tag tone="muted">{t("ยกเลิกแล้ว", "Revoked")}</Tag>
              ) : (
                <form method="post" action={`/partner/keys/${k.id}/revoke`} style="display:inline">
                  <Button kind="ghost">{t("ยกเลิกคีย์", "Revoke")}</Button>
                </form>
              )}
              {k.lastUsedAt ? <small class="muted"> {t(`ใช้ล่าสุด ${fmtDate(k.lastUsedAt, lang)}`, `last used ${fmtDate(k.lastUsedAt, lang)}`)}</small> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {live.length < KEYS_PER_ORG ? (
        <form method="post" action="/partner/keys" class="row">
          <Field label={t("ชื่อคีย์ (ไม่บังคับ)", "Key name (optional)")} name="label" maxlength={60} placeholder={t("เช่น ระบบขายบัตร", "e.g. ticketing system")} />
          <Button>{t("สร้างคีย์", "Make a key")}</Button>
        </form>
      ) : null}

      <h2>{t("ปฏิทินของคุณ", "Your calendar feed")}</h2>
      <p class="muted">
        {t(
          "ใส่ลิงก์ iCal ของงานคุณ ทุกวันจะอ่านเข้ากล่องรอโต๊ะ เจ้าภาพของคุณเลือกงานไปเพิ่มจุดนัดพบกับโต๊ะได้",
          "Add your events' iCal link. It's read into the waiting list once a day; your hosts pick events and add a meeting point and a table.",
        )}
      </p>
      {feeds.map((f) => (
        <Card>
          <strong>{f.sourceName}</strong> <small class="muted">{f.url}</small>
          <p class="muted" style="margin:4px 0">
            {f.status === "paused" ? t("หยุดไว้", "Paused") : f.lastReadAt ? t(`อ่านล่าสุด ${fmtDate(f.lastReadAt, lang)}: ${f.lastResult} (${f.lastCount ?? 0})`, `Last read ${fmtDate(f.lastReadAt, lang)}: ${f.lastResult} (${f.lastCount ?? 0})`) : t("ยังไม่ได้อ่าน", "Not read yet")}
          </p>
          <form method="post" action={`/partner/feeds/${f.id}/${f.status === "paused" ? "resume" : "pause"}`}>
            <Button kind="ghost">{f.status === "paused" ? t("อ่านต่อ", "Resume") : t("หยุด", "Pause")}</Button>
          </form>
        </Card>
      ))}
      {feeds.length < 5 ? (
        <form method="post" action="/partner/feeds">
          <Card>
            <Field label={t("ลิงก์ iCal (https)", "iCal link (https)")} name="url" type="url" required maxlength={1000} inputmode="url" autocapitalize="none" />
            <TextArea
              label={t("ข้อตกลงการใช้งาน", "Terms")}
              name="termsNote"
              rows={2}
              required
              maxlength={500}
              hint={t("ยืนยันว่าปฏิทินนี้เป็นของคุณ หรือคุณมีสิทธิ์ให้ Jurrgun อ่าน", "Confirm the calendar is yours, or that you may let Jurrgun read it.")}
            />
            <Button>{t("เพิ่มปฏิทิน", "Add the feed")}</Button>
          </Card>
        </form>
      ) : null}

      <h2>{t("เจ้าภาพของคุณ", "Your hosts")}</h2>
      <p class="muted">{t("ทุกกิจกรรมต้องมีเจ้าภาพ ทีมงาน Jurrgun เพิ่มเจ้าภาพให้องค์กรของคุณ", "Every event needs a named host. The Jurrgun team adds hosts to your organisation.")}</p>
      <ul class="plain">
        {hosts.map((h) => (
          <li>@{h.username}</li>
        ))}
      </ul>
    </>,
  );
}

/** Co-hosts of one event: names and status, and for the lead an invite form (D53). */
function CohostCell(props: { v: View; eventId: string; lead: boolean; list: { inviteId: string; orgId: string; name: string; status: string }[]; invitable: { id: string; name: string }[] }) {
  const { t } = props.v;
  const live = props.list.filter((x) => x.status === "invited" || x.status === "accepted");
  const taken = new Set(live.map((x) => x.orgId));
  const options = props.invitable.filter((o) => !taken.has(o.id));
  if (!props.lead && !live.length) return null;
  return (
    <div style="margin-top:4px">
      {live.map((x) => (
        <div>
          <small>
            + {x.name} {x.status === "invited" ? <Tag tone="warn">{t("รอตอบ: ยังไม่ขึ้นหน้าค้นหา", "Waiting: not on Discover yet")}</Tag> : null}
          </small>
          {props.lead ? (
            <form method="post" action={`/partner/events/${props.eventId}/cohosts/${x.inviteId}/remove`} style="display:inline">
              <Button kind="ghost">{t("เอาออก", "Remove")}</Button>
            </form>
          ) : null}
        </div>
      ))}
      {props.lead && live.length < MAX_COHOSTS && options.length ? (
        <form method="post" action={`/partner/events/${props.eventId}/cohosts`} class="row">
          <label class="sr-only" for={`co-${props.eventId}`}>
            {t("เชิญผู้ร่วมจัด", "Invite a co-host")}
          </label>
          <select id={`co-${props.eventId}`} name="orgId" required>
            <option value="">{t("เชิญผู้ร่วมจัด…", "Invite a co-host…")}</option>
            {options.map((o) => (
              <option value={o.id}>{o.name}</option>
            ))}
          </select>
          <Button kind="ghost">{t("เชิญ", "Invite")}</Button>
        </form>
      ) : null}
    </div>
  );
}

partnerRoutes.get("/partner", (c) => area(c));

const byOf = (c: C) => ({ accountId: c.var.user!.account.id, orgId: orgIdOf(c)! });

partnerRoutes.post("/partner/events/:id/cohosts", async (c) => {
  const v = view(c);
  if (!orgIdOf(c)) return c.redirect("/partner");
  const refusal = await inviteCohost(c.env, byOf(c), c.req.param("id"), str((await c.req.parseBody()).orgId));
  if (refusal) return area(c, { error: v.t(refusal.th, refusal.en), status: 400 });
  return c.redirect("/partner?notice=saved");
});

partnerRoutes.post("/partner/events/:id/cohosts/:invite/remove", async (c) => {
  if (orgIdOf(c)) await removeCohost(c.env, byOf(c), c.req.param("id"), c.req.param("invite"));
  return c.redirect("/partner?notice=saved");
});

for (const answer of ["accept", "decline"] as const) {
  partnerRoutes.post(`/partner/invites/:invite/${answer}`, async (c) => {
    const v = view(c);
    if (!orgIdOf(c)) return c.redirect("/partner");
    const refusal = await respondToInvite(c.env, byOf(c), c.req.param("invite"), answer === "accept");
    if (refusal) return area(c, { error: v.t(refusal.th, refusal.en), status: 400 });
    return c.redirect("/partner?notice=saved");
  });
}

partnerRoutes.post("/partner/keys", async (c) => {
  const orgId = orgIdOf(c);
  if (!orgId) return c.redirect("/partner");
  const db = getDb(c.env);
  const live = await db
    .select({ id: partnerKeys.id })
    .from(partnerKeys)
    .where(and(eq(partnerKeys.partnerOrgId, orgId), isNull(partnerKeys.revokedAt)))
    .limit(KEYS_PER_ORG + 1);
  if (live.length >= KEYS_PER_ORG) return area(c, { error: view(c).t(`มีคีย์ได้ไม่เกิน ${KEYS_PER_ORG} อัน`, `At most ${KEYS_PER_ORG} keys.`), status: 400 });
  const me = c.var.user!.account.id;
  const { id, key } = await createPartnerKey(c.env, orgId, str((await c.req.parseBody()).label), me);
  // The audit records that a key was made, never the key.
  await audit(db, me, "partner.key_create", { type: "partner_key", id });
  return area(c, { newKey: key });
});

partnerRoutes.post("/partner/keys/:id/revoke", async (c) => {
  const orgId = orgIdOf(c);
  if (orgId && (await revokePartnerKey(c.env, orgId, c.req.param("id")))) {
    await audit(getDb(c.env), c.var.user!.account.id, "partner.key_revoke", { type: "partner_key", id: c.req.param("id") });
  }
  return c.redirect("/partner?notice=saved");
});

partnerRoutes.post("/partner/feeds", async (c) => {
  const { t } = view(c);
  const orgId = orgIdOf(c);
  if (!orgId) return c.redirect("/partner");
  const body = await c.req.parseBody();
  const url = checkOutsideUrl(str(body.url));
  const termsNote = str(body.termsNote);
  if (!url) return area(c, { error: t("ลิงก์ปฏิทินต้องเป็น https ของเว็บสาธารณะ", "The feed link must be a public https link."), status: 400 });
  if (termsNote.length < 5 || termsNote.length > 500) return area(c, { error: t("บอกเรื่องสิทธิ์การใช้ปฏิทินนี้ด้วย", "Say why Jurrgun may read this feed."), status: 400 });
  const db = getDb(c.env);
  const [org] = await db.select({ name: partnerOrgs.name }).from(partnerOrgs).where(eq(partnerOrgs.id, orgId)).limit(1);
  const id = newId();
  const added = await db
    .insert(eventFeeds)
    .values({ id, url: url.toString(), sourceName: org?.name ?? url.hostname, credit: org?.name ?? null, termsNote, partnerOrgId: orgId, addedBy: c.var.user!.account.id })
    .onConflictDoNothing({ target: eventFeeds.url })
    .returning({ id: eventFeeds.id });
  if (!added.length) return area(c, { error: t("มีปฏิทินนี้อยู่แล้ว", "That feed is already added."), status: 400 });
  await audit(db, c.var.user!.account.id, "feed.add", { type: "feed", id });
  return c.redirect("/partner?notice=saved");
});

for (const [action, status] of [
  ["pause", "paused"],
  ["resume", "active"],
] as const) {
  partnerRoutes.post(`/partner/feeds/:id/${action}`, async (c) => {
    const orgId = orgIdOf(c);
    if (orgId) {
      await getDb(c.env)
        .update(eventFeeds)
        .set({ status })
        .where(and(eq(eventFeeds.id, c.req.param("id")), eq(eventFeeds.partnerOrgId, orgId)));
    }
    return c.redirect("/partner?notice=saved");
  });
}
