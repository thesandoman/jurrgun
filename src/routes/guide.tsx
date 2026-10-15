/**
 * The first-time guide: how Jurrgun works, then safety, communication,
 * responsibility and accountability, one screen each. New members land here
 * once, straight after onboarding; agreeing is saved as a "guide" consent row
 * so it never shows again. Anyone can reopen it from Learn.
 *
 *   GET  /guide   the guide (a card flow)
 *   POST /guide   "I'm in": records the commitment, then on to Discover
 */
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { newId } from "../lib/crypto";
import type { AppEnv } from "../lib/env";
import { requireMember } from "../lib/session";
import { consents } from "../schema";
import { Flow, FlowStep } from "../ui/flow";
import { page, view } from "../ui/kit";

export const guideRoutes = new Hono<AppEnv>();
export const GUIDE_VERSION = "2026-10";

type Tip = [emoji: string, th: string, en: string];

const HOW: Tip[] = [
  ["🧭", "หากิจกรรมกลุ่มเล็กใกล้คุณ", "Find small-group events near you"],
  ["🎟️", "ลงทะเบียนแล้วไป นั่งโต๊ะละ 4–6 คน มีโฮสต์ดูแล", "RSVP and go: tables of 4–6, with a host"],
  ["🫂", "หลังกิจกรรม เลือกกันและกัน ต้องเลือกทั้งคู่ถึงจะเชื่อมกัน", "Afterwards, choose each other. It only connects if you both do"],
  ["🤝", "บัดดี้กรุงเทพฯ: บัดดี้หนึ่งคน เควสต์ทุกสัปดาห์ สะสมแสตมป์ 50 เขต", "Bangkok Buddy: one buddy, weekly quests, 50 district stamps"],
];
const SAFETY: Tip[] = [
  ["📍", "เจอกันครั้งแรกในที่สาธารณะที่มีโฮสต์", "Meet first in public places with a host"],
  ["📲", "บอกแผนให้เพื่อนรู้ ใช้หน้า Safety net ได้", "Tell a friend your plan. The Safety net page helps"],
  ["🚪", "รู้สึกไม่ปลอดภัย บล็อก รายงาน แล้วออกได้ทันที", "Feel unsafe? Block, report and leave. Any time"],
  ["🆘", "ฉุกเฉิน: ตำรวจ 191 · รถพยาบาล 1669", "Emergency: police 191 · ambulance 1669"],
];
const TALK: Tip[] = [
  ["👋", "ทักก่อน ถามคำถามปลายเปิด แล้วฟังให้มาก", "Say hi first, ask open questions, listen a lot"],
  ["✋", "'ไม่' คือ 'ไม่' ฟังครั้งเดียวพอ", "No means no. Hearing it once is enough"],
  ["⏰", "ไปไม่ได้ บอกล่วงหน้า อย่าหายเงียบ", "Can't make it? Say so early. Don't go quiet"],
  ["🔐", "แชร์ช่องทางติดต่อเมื่อทั้งคู่อยากแชร์เท่านั้น", "Share contacts only when you both want to"],
];
const RESPONSIBLE: Tip[] = [
  ["🗓️", "มาตามนัด หรือยกเลิกก่อน 24 ชม. ที่นั่งจะได้ไปถึงคนอื่น", "Show up, or cancel 24h ahead so someone else gets the seat"],
  ["🌈", "เคารพทุกคน ทุกเพศ ทุกอัตลักษณ์ ทุกเชื้อชาติ", "Respect everyone: every gender, identity and background"],
  ["💬", "บอกสถานะความสัมพันธ์ตามจริงถ้าใช้ฟีเจอร์เดต", "Be truthful about your relationship status if you date here"],
  ["🤫", "ไม่เปิดเผยข้อมูลหรือตัวตนของใครโดยไม่ได้รับอนุญาต", "Never share anyone's details or identity without consent"],
];
const ACCOUNTABLE: Tip[] = [
  ["🧑‍⚖️", "ทุกรายงานมีคนในทีมตรวจ รายงานอย่างเดียวไม่ทำให้ใครถูกนำออก", "A person reviews every report. A report alone never removes anyone"],
  ["🚩", "คำเตือนที่ยืนยันแล้วนับเป็น 1 ธง นับอยู่ 1 ปี", "An upheld warning is a flag. Flags count for a year"],
  ["⚖️", "ถูกนำออกเฉพาะเมื่อละเมิดกฎชัดเจน หรือมีครบ 3 ธง", "Removal only for a clear rule break, or 3 flags"],
  ["🎟️", "ไม่มาตามนัดนับเป็น strike พักการลงทะเบียน แต่ไม่ปิดบัญชี", "No-shows are strikes: they pause RSVPs, never close your account"],
];

function Tips(props: { tips: Tip[]; t: (th: string, en: string) => string }) {
  return (
    <ul class="guide-tips">
      {props.tips.map(([emoji, th, en]) => (
        <li>
          <b aria-hidden="true">{emoji}</b>
          <span>{props.t(th, en)}</span>
        </li>
      ))}
    </ul>
  );
}

guideRoutes.get("/guide", requireMember, (c) => {
  const v = view(c);
  const { t } = v;
  return page(
    c,
    { title: t("เริ่มต้นใช้งาน", "Getting started"), bare: true },
    <Flow v={v} submit={t("พร้อมแล้ว ไปกันเลย", "I'm in, let's go")} action="/guide" close="/events">
      <FlowStep emoji="👋" title={t("Jurrgun ทำงานอย่างไร", "How Jurrgun works")} hint={t("เพื่อนใหม่ก่อน เดตเฉพาะเมื่อทั้งคู่เลือก", "Friends first. Dating only if you both choose it.")}>
        <Tips tips={HOW} t={t} />
      </FlowStep>
      <FlowStep emoji="🛡️" title={t("ความปลอดภัย", "Safety")}>
        <Tips tips={SAFETY} t={t} />
        <p class="muted">
          <a href="/safety">{t("เปิด Safety net", "Open the Safety net")}</a>
        </p>
      </FlowStep>
      <FlowStep emoji="💬" title={t("การสื่อสาร", "Communication")}>
        <Tips tips={TALK} t={t} />
      </FlowStep>
      <FlowStep emoji="🤝" title={t("ความรับผิดชอบ", "Responsibility")}>
        <Tips tips={RESPONSIBLE} t={t} />
      </FlowStep>
      <FlowStep emoji="⚖️" title={t("ยุติธรรมและตรวจสอบได้", "Accountability")}>
        <Tips tips={ACCOUNTABLE} t={t} />
        <p class="muted">
          <a href="/code-of-conduct#fair-process">{t("อ่านหลักปฏิบัติฉบับเต็ม", "Read the full code of conduct")}</a>
        </p>
      </FlowStep>
      <FlowStep emoji="✅" title={t("สัญญากันนะ", "Your promise")} need={1} needText={t("ติ๊กเพื่อไปต่อ", "Tick to continue")}>
        <label class="check guide-promise">
          <input type="checkbox" name="agree" value="1" required />
          <span>
            {t(
              "ฉันจะดูแลความปลอดภัย สื่อสารตรงไปตรงมา มาตามนัด และทำตามหลักปฏิบัติของชุมชน",
              "I'll look out for others, communicate honestly, show up, and follow the code of conduct.",
            )}
          </span>
        </label>
      </FlowStep>
    </Flow>,
  );
});

guideRoutes.post("/guide", requireMember, async (c) => {
  const body = await c.req.parseBody();
  if (body.agree !== "1") return c.redirect("/guide");
  const accountId = c.var.user!.account.id;
  const db = getDb(c.env);
  const [seen] = await db
    .select({ id: consents.id })
    .from(consents)
    .where(and(eq(consents.accountId, accountId), eq(consents.category, "guide")))
    .limit(1);
  if (!seen) await db.insert(consents).values({ id: newId(), accountId, category: "guide", granted: true, version: GUIDE_VERSION });
  return c.redirect("/events?notice=welcome");
});
