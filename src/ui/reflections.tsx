/**
 * The four "My Bangkok" reflection steps at the end of the quiz (content and
 * rules in src/content/reflections.ts), and the lines they add to the profile
 * card. Plain form fields: checkboxes, radios, selects and short text, all
 * optional, nothing scored.
 */
import { L, type Lang } from "../lib/i18n";
import { DISTRICTS, districtsAZ, label } from "../lib/constants";
import { CHANGES, LIKE_MAX, LIKES, NOT_YET_MAX, NOTE_MAX, PLACE_MAX, PLACE_SUGGESTIONS, type Reflections } from "../content/reflections";
import { FlowStep } from "./flow";
import { Choices, Field, Select, type View } from "./kit";

const PLACES_LIST = "reflect-places";

/** A short text box with landmark suggestions. */
function PlaceField(props: { label: string; name: string; value?: string; hint?: string }) {
  const id = `f-${props.name}`;
  return (
    <div class="field">
      <label for={id}>{props.label}</label>
      <input id={id} name={props.name} type="text" value={props.value ?? ""} maxlength={PLACE_MAX} list={PLACES_LIST} autocomplete="off" aria-describedby={props.hint ? `${id}-hint` : undefined} />
      {props.hint ? (
        <small id={`${id}-hint`} class="muted">
          {props.hint}
        </small>
      ) : null}
    </div>
  );
}

/** The four optional steps. `value` prefills a retake with the member's last answers. */
export function ReflectionSteps(props: { v: View; value?: Reflections | null }) {
  const { t, lang } = props.v;
  const r = props.value ?? {};
  const districts = districtsAZ(lang);
  const optional = t("ไม่บังคับ และไม่มีผลกับไทป์ของคุณ", "Optional, and it doesn't change your type");
  return (
    <>
      <datalist id={PLACES_LIST}>
        {PLACE_SUGGESTIONS.map((p) => (
          <option value={p} />
        ))}
      </datalist>
      <FlowStep emoji="🛺" title={t("คุณชอบอะไรในกรุงเทพฯ", "What do you like about Bangkok?")} hint={optional} class="reflect">
        <Choices legend={t(`เลือกได้สูงสุด ${LIKE_MAX} ข้อ`, `Pick up to ${LIKE_MAX}`)} name="r_like" options={LIKES} values={r.like} lang={lang} />
        <Field label={t("หรือเล่าด้วยคำของคุณเอง", "Or say it in your own words")} name="r_like_note" value={r.likeNote} maxlength={NOTE_MAX} />
      </FlowStep>
      <FlowStep emoji="🔧" title={t("ถ้าเปลี่ยนได้ 1 อย่าง อยากเปลี่ยนอะไร", "If you could change one thing, what would it be?")} hint={t("ไม่บังคับ เห็นแค่คุณคนเดียว", "Optional, and only you see it")} class="reflect">
        <Choices legend={t("เลือก 1 ข้อ", "Pick one")} name="r_change" options={CHANGES} values={r.change ? [r.change] : []} lang={lang} type="radio" />
        <Field label={t("หรือเล่าด้วยคำของคุณเอง", "Or say it in your own words")} name="r_change_note" value={r.changeNote} maxlength={NOTE_MAX} />
        <p class="muted reflect-note">
          {t(
            "ถ้าคุณยินยอมให้ใช้ข้อมูลเพื่อการวิจัย ตัวเลือกนี้ (ไม่รวมข้อความ) จะนับรวมใน City Pulse แบบไม่ระบุตัวตน",
            "If you've agreed to research, the option you pick (never your words) is counted in City Pulse, without your name",
          )}
        </p>
      </FlowStep>
      <FlowStep emoji="⭐" title={t("ย่านหรือที่ไหนที่คุณชอบที่สุด", "Your favourite area or place?")} hint={optional} class="reflect">
        <Select label={t("ย่าน", "Area")} name="r_fav_district" options={districts} value={r.favourite?.district} lang={lang} blank={t("เลือกย่าน", "Choose an area")} />
        <PlaceField label={t("หรือที่ที่เจาะจง", "Or a specific place")} name="r_fav_place" value={r.favourite?.place} hint={t("ร้าน ตลาด สวน หรืออะไรก็ได้", "A shop, a market, a park, anything")} />
      </FlowStep>
      <FlowStep emoji="🗺️" title={t("ที่ไหนที่คุณยังไม่เคยไป", "Where haven't you been yet?")} hint={t("ไม่บังคับ ช่วยให้เราแนะนำโต๊ะแรกและพาสปอร์ตได้ตรงขึ้น", "Optional. It helps us suggest first tables and Passport stamps")} class="reflect">
        {Array.from({ length: NOT_YET_MAX }, (_, k) => (
          <Select label={t(`ย่านที่ ${k + 1}`, `Area ${k + 1}`)} name={`r_notyet_${k + 1}`} options={districts} value={r.notYet?.districts?.[k]} lang={lang} blank={t("เลือกย่าน", "Choose an area")} />
        ))}
        <PlaceField label={t("หรือที่ที่เจาะจง", "Or a specific place")} name="r_notyet_place" value={r.notYet?.place} />
      </FlowStep>
    </>
  );
}

/** "My Bangkok" lines for the profile card: what they like, their favourite spot, where they'd go next. Never what they'd change. */
export function reflectionFacts(r: Reflections | undefined, lang: Lang, t: (th: string, en: string) => string): [string, string, string][] {
  if (!r) return [];
  const out: [string, string, string][] = [];
  const likes = (r.like ?? []).map((v) => LIKES.find((o) => o.value === v)).filter((o) => !!o).map((o) => L(lang, o!));
  const loves = [...likes, ...(r.likeNote ? [r.likeNote] : [])].join(" · ");
  if (loves) out.push(["❤️", t("ชอบในกรุงเทพฯ", "Loves in Bangkok"), loves]);
  const fav = [r.favourite?.place, r.favourite?.district ? label(DISTRICTS, r.favourite.district, lang) : ""].filter(Boolean).join(", ");
  if (fav) out.push(["⭐", t("ที่โปรด", "Favourite spot"), fav]);
  const next = [...(r.notYet?.districts ?? []).map((d) => label(DISTRICTS, d, lang)), ...(r.notYet?.place ? [r.notYet.place] : [])].join(" · ");
  if (next) out.push(["🗺️", t("อยากไปสำรวจ", "Next to explore"), next]);
  return out;
}

export const REFLECTION_CSS = `
.reflect .reflect-note{margin-top:10px;font-size:.84rem}
.reflect .field{margin-top:12px}
`;
