/**
 * Entry rules on events (owner decisions D52 and D56 to D61), shared by the
 * host form, the member proposal form and the event page.
 *
 *   EntryRuleFields  the form fields (hosts and partners)
 *   EntryRulesLine   what members see under the event's facts
 *   BookingChecks    inside the RSVP form: the join code, and the disclaimer
 *                    to tick (alcohol, an age limit, activity, requirements)
 */
import type { Event } from "../schema";
import { DRINKING_AGE, GROUP_LABEL_MAX, needsDisclaimer, REQUIREMENT_MAX_CHARS, REQUIREMENTS_MAX } from "../domain/event-rules";
import { Field, TextArea, Toggle } from "./kit";

type T = (th: string, en: string) => string;

export type EntryRuleDraft = {
  alcoholServed: boolean;
  smokingArea: boolean;
  openEntry: boolean;
  talkMode: boolean;
  approvalRequired: boolean;
  requirements: string;
  groupLabel: string;
  groupJoinCode: string;
};

export const emptyEntryRules = (): EntryRuleDraft => ({
  alcoholServed: false,
  smokingArea: false,
  openEntry: false,
  talkMode: false,
  approvalRequired: false,
  requirements: "",
  groupLabel: "",
  groupJoinCode: "",
});

export const entryRulesFromEvent = (e: Event): EntryRuleDraft => ({
  alcoholServed: e.alcoholServed,
  smokingArea: e.smokingArea,
  openEntry: e.openEntry,
  talkMode: e.talkMode,
  approvalRequired: e.approvalRequired,
  requirements: e.requirements.join("\n"),
  groupLabel: e.groupLabel ?? "",
  groupJoinCode: e.groupJoinCode ?? "",
});

export const entryRulesFromBody = (body: Record<string, unknown>): EntryRuleDraft => {
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const b = (k: string) => s(k) === "1";
  return {
    alcoholServed: b("alcoholServed"),
    smokingArea: b("smokingArea"),
    openEntry: b("openEntry"),
    talkMode: b("talkMode"),
    approvalRequired: b("approvalRequired"),
    requirements: s("requirements"),
    groupLabel: s("groupLabel"),
    groupJoinCode: s("groupJoinCode"),
  };
};

/** The form fields. `talk` shows private talk mode (health partners and admins only). */
export function EntryRuleFields(props: { t: T; d: EntryRuleDraft; talk: boolean }) {
  const { t, d } = props;
  return (
    <fieldset class="choices">
      <legend>{t("กติกาการเข้าร่วม", "Entry rules")}</legend>
      <Toggle
        name="alcoholServed"
        label={t("มีเครื่องดื่มแอลกอฮอล์", "Alcohol served")}
        hint={t(`กิจกรรมจะเป็น ${DRINKING_AGE} ปีขึ้นไปโดยอัตโนมัติ ถ้าไม่เลือก จะแสดงว่าไม่มีแอลกอฮอล์`, `The event becomes ${DRINKING_AGE}+ automatically. Unticked, it shows as alcohol-free.`)}
        checked={d.alcoholServed}
      />
      <Toggle
        name="smokingArea"
        label={t("มีที่สูบบุหรี่ในสถานที่", "Smoking area at the venue")}
        hint={t("ถ้าไม่เลือก จะแสดงว่าปลอดบุหรี่ ห้ามบุหรี่ไฟฟ้าทุกงาน", "Unticked, it shows as smoke-free. Vaping is never allowed.")}
        checked={d.smokingArea}
      />
      <Toggle
        name="openEntry"
        label={t("เข้างานได้เลย ไม่ต้องจอง", "Open entry, no booking needed")}
        hint={t("ตัวงานเปิดให้ทุกคน ที่นั่งในแอปคือกลุ่มไปด้วยกันเท่านั้น", "Anyone can walk in. The seats here are only for the go-together groups.")}
        checked={d.openEntry}
      />
      <Toggle
        name="approvalRequired"
        label={t("ผู้จัดอนุมัติที่นั่ง", "Organiser approves places")}
        hint={t("สมาชิกขอที่นั่ง แล้วคุณกดอนุมัติหรือปฏิเสธ", "Members request a place, and you approve or decline.")}
        checked={d.approvalRequired}
      />
      {props.talk ? (
        <Toggle
          name="talkMode"
          label={t("วงพูดคุยส่วนตัว (ด้านสุขภาพ)", "Private talk (health)")}
          hint={t(
            "ไม่มีรายชื่อผู้เข้าร่วม ไม่มีการเลือกเจอกันอีก ไม่ขึ้นในโปรไฟล์ มีกล่องถามแบบไม่ระบุชื่อ",
            "No attendee list, no choosing who to see again, never on a profile, and an anonymous question box.",
          )}
          checked={d.talkMode}
        />
      ) : null}
      <TextArea
        label={t("สิ่งที่ต้องรู้หรือเตรียมก่อนจอง (ไม่บังคับ)", "Bring or know before booking (optional)")}
        name="requirements"
        value={d.requirements}
        rows={3}
        maxlength={REQUIREMENTS_MAX * (REQUIREMENT_MAX_CHARS + 1)}
        hint={t(`บรรทัดละข้อ ไม่เกิน ${REQUIREMENTS_MAX} ข้อ เช่น พกน้ำ ซื้อบัตรงานก่อน`, `One per line, up to ${REQUIREMENTS_MAX}. For example: bring water, buy the show ticket first.`)}
      />
      <div class="grid2">
        <Field
          label={t("เฉพาะกลุ่ม (ไม่บังคับ)", "Only for a group (optional)")}
          name="groupLabel"
          value={d.groupLabel}
          maxlength={GROUP_LABEL_MAX}
          placeholder={t("เช่น นิสิตและบุคลากร จุฬาฯ", "e.g. Chula students and staff")}
        />
        <Field
          label={t("รหัสเข้าร่วมของกลุ่ม", "The group's join code")}
          name="groupJoinCode"
          value={d.groupJoinCode}
          maxlength={24}
          hint={t("คุณแจ้งรหัสนี้ให้กลุ่มเอง สมาชิกพิมพ์ตอนจอง", "You share it with the group; members type it to book.")}
        />
      </div>
    </fieldset>
  );
}

/** What members see under the facts: open entry, alcohol, smoking, talk, group, approval. */
export function EntryRulesLine(props: { e: Event; t: T }) {
  const { e, t } = props;
  return (
    <>
      {e.openEntry ? (
        <p class="ev-line">
          <span aria-hidden="true">🚪</span> {t("เข้างานได้เลย ไม่ต้องจอง ที่นั่งในแอปคือกลุ่มไปด้วยกัน", "Open entry, no booking needed. The places here are for the go-together groups.")}
        </p>
      ) : null}
      {e.talkMode ? (
        <p class="ev-line">
          <span aria-hidden="true">🔒</span>{" "}
          {t("วงพูดคุยส่วนตัว: ไม่มีรายชื่อผู้เข้าร่วม และไม่ขึ้นในโปรไฟล์ของคุณ ถามแบบไม่ระบุชื่อได้", "Private talk: no attendee list, never on your profile, and you can ask questions anonymously.")}
        </p>
      ) : null}
      {e.groupLabel ? (
        <p class="ev-line">
          <span aria-hidden="true">🎓</span> {t(`สำหรับ ${e.groupLabel} ใช้รหัสเข้าร่วมจากกลุ่ม`, `For ${e.groupLabel}, with the group's join code`)}
        </p>
      ) : null}
      {e.approvalRequired ? (
        <p class="ev-line">
          <span aria-hidden="true">✋</span> {t("ผู้จัดอนุมัติที่นั่ง", "The organiser approves places")}
        </p>
      ) : null}
      <p class="chips2">
        <span>{e.alcoholServed ? `🍺 ${t(`มีแอลกอฮอล์ · ${DRINKING_AGE}+`, `Alcohol served · ${DRINKING_AGE}+`)}` : `🥤 ${t("ไม่มีแอลกอฮอล์", "Alcohol-free")}`}</span>
        <span>{e.smokingArea ? `🚬 ${t("มีที่สูบบุหรี่ · ห้ามบุหรี่ไฟฟ้า", "Smoking area · no vaping")}` : `🚭 ${t("ปลอดบุหรี่ · ห้ามบุหรี่ไฟฟ้า", "Smoke-free · no vaping")}`}</span>
      </p>
    </>
  );
}

/** Inside the RSVP form: the join code and the disclaimer to tick (D57, D61). */
export function BookingChecks(props: { e: Event; t: T }) {
  const { e, t } = props;
  const disclaimer = needsDisclaimer(e);
  if (!e.groupJoinCode && !disclaimer) return null;
  return (
    <div class="booking-checks">
      {e.groupJoinCode ? (
        <Field
          label={t(`รหัสเข้าร่วมของ ${e.groupLabel ?? "กลุ่ม"}`, `Join code for ${e.groupLabel ?? "the group"}`)}
          name="joinCode"
          required
          maxlength={30}
          autocomplete="off"
          hint={t("ขอรหัสได้จากกลุ่มของคุณ", "Your group shares it with you.")}
        />
      ) : null}
      {disclaimer ? (
        <div class="card disclaimer">
          <p>
            <b>{t("ก่อนจอง", "Before you book")}</b>
          </p>
          <ul>
            {e.alcoholServed ? <li>{t(`🍺 มีแอลกอฮอล์ งานนี้สำหรับอายุ ${DRINKING_AGE} ปีขึ้นไป ดื่มอย่างรับผิดชอบ`, `🍺 Alcohol served: ${DRINKING_AGE}+ only. Drink responsibly.`)}</li> : null}
            <li>{e.smokingArea ? t("🚬 มีที่สูบบุหรี่ ห้ามบุหรี่ไฟฟ้า", "🚬 Smoking area at the venue. No vaping.") : t("🚭 ปลอดบุหรี่ ห้ามบุหรี่ไฟฟ้า", "🚭 Smoke-free. No vaping.")}</li>
            {e.ageMin > 18 && !(e.alcoholServed && e.ageMin === DRINKING_AGE) ? <li>{t(`🎂 อายุ ${e.ageMin} ถึง ${e.ageMax} ปี`, `🎂 Ages ${e.ageMin} to ${e.ageMax}`)}</li> : null}
            {e.requirements.map((r) => (
              <li>📝 {r}</li>
            ))}
            <li>
              {t("คุณเข้าร่วมด้วยความรับผิดชอบของตัวเอง ทำตาม", "You take part at your own risk, under the")} <a href="/code-of-conduct">{t("หลักปฏิบัติ", "code of conduct")}</a>
              {t(" ฉุกเฉินโทร 1669", ". Emergency: 1669")}
            </li>
          </ul>
          <label class="check">
            <input type="checkbox" name="disclaimer" value="1" required />{" "}
            {e.alcoholServed || e.ageMin > 18
              ? t(`ฉันอายุ ${Math.max(e.ageMin, 18)} ปีขึ้นไป และเข้าใจกติกาข้างบน`, `I'm ${Math.max(e.ageMin, 18)}+ and I understand the rules above`)
              : t("ฉันเข้าใจกติกาข้างบน", "I understand the rules above")}
          </label>
        </div>
      ) : null}
    </div>
  );
}
