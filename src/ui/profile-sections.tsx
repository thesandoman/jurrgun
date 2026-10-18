/**
 * Profile editing, one section at a time (owner, 2026-10-18).
 *
 * The same section renderers serve the long form at /settings/profile and the
 * edit sheets on my own card at /me/profile, so the fields, their limits and
 * their error wiring (aria-invalid, aria-describedby) exist once. Each section
 * is its own form posting to /settings/profile/section/:name, which validates
 * and saves only that section's fields.
 *
 * Sections: photo, basics, languages, interests, here, comm, bangkok, work,
 * meet, prompts, dating-prompts, links, and prompt-<id> for one prompt (the
 * card's sheets edit prompts one at a time).
 */
import type { Child } from "hono/jsx";
import { INTENTS, LANGUAGES, SOCIAL_STYLES, districtsAZ } from "../lib/constants";
import {
  ACCESS_NEEDS,
  ACTIVITIES,
  BILL_STYLE,
  BUDGETS,
  DIET,
  ENERGY,
  GETTING_AROUND,
  GROUP_SIZES,
  LEARNING_MAX,
  MAX_COMM,
  MAX_INTERESTS,
  MAX_PAY,
  MAX_TRAVEL,
  MEALS,
  PAY_METHODS,
  PETS,
  PUNCTUAL,
  SIZE_STYLES,
  SPICE,
  TIME_WINDOWS,
  WEEKEND_RHYTHM,
  groupSizeOrLegacy,
  promptById,
  timesOrLegacy,
  type Bio,
} from "../content/profile";
import { NETWORKS } from "../content/social-links";
import { Choices, Field, Select, Toggle, type View } from "./kit";
import { BangkokStory, CommPicker, EducationPicker, InterestPicker, OccupationPicker, OptChecks, OptRadios, PhotoUndo, photoPickData, PromptInput } from "./profile-form";
import { ReflectionFields } from "./reflections";
import { SubLabel } from "./section-head";
import { PronounField } from "../routes/onboarding";

/** Everything the edit form shows: the stored profile, or what was typed when a save is refused. */
export type ProfileVals = {
  nickname: string;
  district: string;
  pronouns: string | null;
  showPronouns: boolean;
  languages: string[];
  interests: string[];
  socialStyles: string[];
  eventStyle: string | null;
  intents: string[];
  newcomer: boolean;
  locale: string;
  bio: Bio;
  /** Social links as typed (network key to text) and the "show my links to my people" switch. Loaded when missing. */
  links?: Record<string, string>;
  linksOn?: boolean;
};

/** The sections, in the order the long form shows them. */
export const SECTIONS = ["photo", "basics", "languages", "interests", "here", "comm", "bangkok", "work", "meet", "prompts", "dating-prompts", "links"] as const;
export type SectionName = (typeof SECTIONS)[number] | `prompt-${string}`;

/** Basics first: these stay open on the long form; the rest sit under "More (optional)". Languages are required, so they stay open too. */
export const OPEN_SECTIONS: SectionName[] = ["photo", "basics", "languages", "interests"];

export function isSectionName(x: string): x is SectionName {
  return (SECTIONS as readonly string[]).includes(x) || /^prompt-[a-z0-9_]{1,60}$/.test(x);
}

type Meta = { emoji: string; th: string; en: string; hint?: [string, string] };
export const SECTION_META: Record<(typeof SECTIONS)[number], Meta> = {
  photo: { emoji: "📸", th: "รูปโปรไฟล์", en: "Profile photo", hint: ["ไม่บังคับ รูปที่เห็นหน้าชัด ๆ ช่วยให้จำกันได้ในงาน", "Optional. A clear, friendly photo helps people find you at events."] },
  basics: { emoji: "👋", th: "ข้อมูลพื้นฐาน", en: "The basics" },
  languages: { emoji: "🗣️", th: "ภาษา", en: "Languages" },
  interests: { emoji: "🍜", th: "ความสนใจ", en: "Interests", hint: [`เลือก 1 ถึง ${MAX_INTERESTS} อย่าง ใช้จัดโต๊ะให้เจอคนที่ชอบคล้ายกัน`, `Pick 1 to ${MAX_INTERESTS}. We use them to seat you with people who share them.`] },
  here: { emoji: "🎯", th: "มาที่นี่เพื่อ", en: "Here for" },
  comm: { emoji: "💬", th: "สไตล์การติดต่อ", en: "How you keep in touch", hint: [`เลือกได้สูงสุด ${MAX_COMM} แบบ`, `Pick up to ${MAX_COMM}`] },
  bangkok: { emoji: "🛺", th: "กรุงเทพฯ ของฉัน", en: "My Bangkok" },
  work: { emoji: "💼", th: "งานและการเรียน", en: "Work and study" },
  meet: { emoji: "🧾", th: "เวลานัดเจอ", en: "Meeting up", hint: ["ใช้เลือกแผนประจำสัปดาห์ และช่วยให้นัดแรกง่ายขึ้น", "Used to pick your weekly plan, and makes a first meet smoother."] },
  prompts: { emoji: "🃏", th: "คำถามของฉัน", en: "My prompts", hint: ["ตอบข้อไหนก็ได้ ไม่ชอบข้อไหน กด ↻ เพื่อเปลี่ยน", "Answer any you like. Tap ↻ to swap one you don't."] },
  "dating-prompts": {
    emoji: "💘",
    th: "คำถามเรื่องเดต",
    en: "Dating prompts",
    hint: [
      "เห็นได้เฉพาะสมาชิกที่เปิดใจมากกว่าเพื่อนเหมือนกันและเข้ากับคุณ คนในโหมดเพื่อนจะไม่เห็นเลย และคำตอบจะถูกลบเมื่อคุณกลับไปโหมดเพื่อน",
      "Only members who are also open to something more, and a fit for you, can see these. Friends-only members never do, and they're deleted if you switch it off.",
    ],
  },
  links: { emoji: "🔗", th: "ลิงก์โซเชียล", en: "Social links", hint: ["เห็นได้เฉพาะคนที่เลือกกันทั้งสองฝ่าย", "Only people you both chose can see these"] },
};

/** The prompt a prompt-<id> section edits, or null. */
export const promptOf = (name: string): string | null => (name.startsWith("prompt-") ? name.slice("prompt-".length) : null);

/** The section's title in the page's language ("My prompts", or the prompt itself). */
export function sectionTitle(t: View["t"], name: SectionName): string {
  const id = promptOf(name);
  if (id) {
    const p = promptById(id);
    return p ? t(p.th, p.en) : t("คำถาม", "Prompt");
  }
  const m = SECTION_META[name as (typeof SECTIONS)[number]];
  return t(m.th, m.en);
}

/** Where a section lives on the long form (its anchor). A prompt anchors on its own card. */
export const sectionAnchor = (name: SectionName) => name;

/** The long-form section a section belongs to (prompt-<id> lives inside My prompts or Dating prompts). */
export function hostSection(name: SectionName, datingDeck: string[]): SectionName {
  const id = promptOf(name);
  if (!id) return name;
  return datingDeck.includes(id) ? "dating-prompts" : "prompts";
}

/** What a section renderer needs. */
export type SectionData = {
  v: View;
  vals: ProfileVals;
  deck: string[];
  datingDeck: string[];
  /** Current photo URL and whether one is stored. */
  photo: string | null;
  hasPhoto: boolean;
  promptPhoto: (id: string) => string | null;
  /** The refused save's message, when it belongs to this field. */
  errFor: (field: string) => string | undefined;
};

/** The fields of one section, without its heading or form. */
export function SectionFields(props: { d: SectionData; name: SectionName; sheet?: boolean }) {
  const { d, name } = props;
  const { t, lang } = d.v;
  const vals = d.vals;
  const bio = vals.bio;
  const errFor = d.errFor;
  const one = promptOf(name);
  if (one) {
    const p = promptById(one);
    return p ? <PromptInput v={d.v} p={p} answer={bio.answers?.[one]} photoSrc={d.datingDeck.includes(one) ? null : d.promptPhoto(one)} shuffle={false} error={errFor(`prompt-${one}`)} /> : null;
  }
  switch (name) {
    case "photo":
      return (
        <>
          {/* data-photo-pick: the picked photo shows in place at once, with one tap to undo (PROFILE_EDIT_JS). */}
          <div class="pf-photo-main" {...photoPickData(d.v, !!d.photo)}>
            <div class="pf-preview" data-preview="">
              {d.photo ? (
                <img src={d.photo} alt={t("รูปโปรไฟล์ปัจจุบัน", "Current profile photo")} />
              ) : (
                <div class="pf-initial" aria-hidden="true">
                  {[...(vals.nickname || "?")][0].toUpperCase()}
                </div>
              )}
            </div>
            <div class="field" style="margin:0;flex:1;min-width:200px">
              {/* The browser's own picker speaks the browser's language; this button speaks the page's. */}
              <span class="field-label" id="f-photo-h">{t("อัปโหลดรูปใหม่", "Upload a new photo")}</span>
              <label class="btn ghost file-btn" for="f-photo">
                📷 {t("เลือกรูป", "Choose a photo")}
              </label>
              <input
                id="f-photo"
                name="photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                class="sr-only"
                aria-labelledby="f-photo-h"
                aria-describedby={errFor("photo") ? "f-photo-name f-photo-err" : "f-photo-name"}
                aria-invalid={errFor("photo") ? "true" : undefined}
              />
              <span class="file-name muted" id="f-photo-name" aria-live="polite">
                {t("ยังไม่ได้เลือกรูป", "No photo chosen")}
              </span>
              <PhotoUndo v={d.v} had={!!d.photo} />
              <small id="f-photo-err" class="field-err pf-photo-err" hidden={!errFor("photo")}>
                {errFor("photo") ? `⚠ ${errFor("photo")}` : ""}
              </small>
              <small>{t("JPG, PNG หรือ WebP ไม่เกิน 5 MB ช่วงทดลองไม่ต้องใช้รูปจริง", "JPG, PNG or WebP, up to 5 MB. No real photos needed in the prototype.")}</small>
            </div>
          </div>
          {d.hasPhoto ? <Toggle name="removePhoto" label={t("ลบรูปโปรไฟล์", "Remove my photo")} /> : null}
        </>
      );
    case "basics":
      return (
        <>
          <Field label={t("ชื่อเล่น", "Nickname")} name="nickname" value={vals.nickname} required maxlength={30} autocomplete="nickname" enterkeyhint="next" error={errFor("nickname")} />
          <Select label={t("เขตที่ใช้ชีวิตเป็นหลัก", "Main district")} name="district" options={districtsAZ(lang)} value={vals.district} lang={lang} required error={errFor("district")} />
          <PronounField v={d.v} value={vals.pronouns} />
          <Toggle name="showPronouns" label={t("แสดงสรรพนามในโปรไฟล์", "Show my pronouns on my profile")} checked={vals.showPronouns} />
          <Toggle name="newcomer" label={t("ฉันเพิ่งย้ายมากรุงเทพฯ", "I'm new to Bangkok")} checked={vals.newcomer} />
          <Select
            label={t("ภาษาที่ใช้ในแอป", "App language")}
            name="locale"
            options={[
              { value: "th", th: "ไทย", en: "Thai" },
              { value: "en", th: "อังกฤษ", en: "English" },
            ]}
            value={vals.locale}
            lang={lang}
          />
        </>
      );
    case "languages":
      return (
        <>
          <Choices legend={t("ภาษาที่พูดได้", "Languages you're comfortable in")} name="languages" options={LANGUAGES} values={vals.languages} lang={lang} hint={t("เลือกอย่างน้อย 1", "Pick at least one")} error={errFor("languages")} />
          <Choices legend={t("ภาษาที่กำลังหัด", "Languages I'm learning")} name="learningLangs" options={LANGUAGES} values={bio.learningLangs ?? []} lang={lang} />
        </>
      );
    case "interests":
      return <InterestPicker v={d.v} values={vals.interests} folded error={errFor("interests")} />;
    case "here":
      return (
        <>
          <Choices legend={t("มาที่นี่เพื่อ…", "I'm here for…")} name="intents" options={INTENTS} values={vals.intents} lang={lang} />
          {/* Group size and free times are asked once, under Meeting up. */}
          <Choices legend={t("ชอบเจอคนแบบไหน", "How do you like to meet people?")} name="socialStyles" options={SOCIAL_STYLES.filter((o) => !SIZE_STYLES.includes(o.value))} values={vals.socialStyles} lang={lang} />
        </>
      );
    case "comm":
      return <CommPicker v={d.v} values={bio.comm} error={errFor("comm")} />;
    case "bangkok":
      return (
        <>
          <BangkokStory v={d.v} story={bio.story} time={bio.bkkTime} hometown={bio.hometown} guide={bio.guide} residency={bio.residency} />
          <ReflectionFields v={d.v} value={bio.reflections} />
        </>
      );
    case "work":
      return (
        <>
          <OccupationPicker v={d.v} value={bio.occupation} other={bio.occupationOther} />
          <EducationPicker v={d.v} bio={bio} />
          <Field
            label={t("กำลังเรียนรู้", "Currently learning")}
            name="learning"
            value={bio.learning ?? ""}
            error={errFor("learning")}
            enterkeyhint="done"
            maxlength={LEARNING_MAX}
            placeholder={t("เช่น ทำขนมปัง ว่ายน้ำท่าผีเสื้อ", "e.g. Sourdough, butterfly stroke")}
            hint={t(`ไม่เกิน ${LEARNING_MAX} ตัวอักษร`, `Up to ${LEARNING_MAX} characters`)}
          />
        </>
      );
    case "meet":
      return (
        <>
          <Radios v={d.v} legend={t("ตอนเจอกันครั้งแรก ฉันมักจะ…", "My first-meet energy")} name="energy" options={ENERGY} value={bio.energy} />
          <Radios v={d.v} legend={t("วันหยุดสไตล์ฉัน", "My weekend rhythm")} name="weekendRhythm" options={WEEKEND_RHYTHM} value={bio.weekend} />
          <Radios v={d.v} legend={t("ขนาดกลุ่มที่สบายใจ", "Group size I'm comfortable with")} name="groupSize" options={GROUP_SIZES} value={groupSizeOrLegacy(bio.groupSize, vals.socialStyles)} />
          <Checks v={d.v} legend={t("ช่วงเวลาที่มักว่าง", "When I'm usually free")} name="times" options={TIME_WINDOWS} values={timesOrLegacy(bio.times, vals.eventStyle)} />
          <Radios v={d.v} legend={t("งบต่อหนึ่งนัด", "Budget per meetup")} name="budget" options={BUDGETS} value={bio.budget} />
          <Checks v={d.v} legend={t("ชอบทำอะไร", "Favourite kinds of meetup")} name="activities" options={ACTIVITIES} values={bio.activities} />
          <Checks v={d.v} legend={t("มื้อที่ชอบนัด", "Meals I like to meet over")} name="meals" options={MEALS} values={bio.meals} />
          <Checks v={d.v} legend={t("ความต้องการด้านการเข้าถึง", "Access needs")} name="access" options={ACCESS_NEEDS} values={bio.access} />
          <SubLabel>{t("เวลาออกไปเจอกัน", "Out and about")}</SubLabel>
          <Checks v={d.v} legend={t(`จ่ายเงินแบบไหนสะดวก (ไม่เกิน ${MAX_PAY} แบบ)`, `How I like to pay (up to ${MAX_PAY})`)} name="pay" options={PAY_METHODS} values={bio.pay} />
          <Radios v={d.v} legend={t("เวลาเช็กบิล", "When the bill comes")} name="bill" options={BILL_STYLE} value={bio.bill} />
          <Checks v={d.v} legend={t(`เดินทางยังไง (ไม่เกิน ${MAX_TRAVEL} แบบ)`, `How I get around (up to ${MAX_TRAVEL})`)} name="travel" options={GETTING_AROUND} values={bio.travel} />
          <Checks v={d.v} legend={t("เรื่องอาหารที่ควรรู้", "Food needs")} name="diet" options={DIET} values={bio.diet} />
          <Radios v={d.v} legend={t("กินเผ็ดได้แค่ไหน", "Spice level")} name="spice" options={SPICE} value={bio.spice} />
          <Radios v={d.v} legend={t("สัตว์เลี้ยง", "Pets")} name="pets" options={PETS} value={bio.pets} />
          <Radios v={d.v} legend={t("เรื่องเวลานัด", "Punctuality")} name="punctual" options={PUNCTUAL} value={bio.punctual} />
        </>
      );
    case "prompts":
    case "dating-prompts": {
      const ids = name === "prompts" ? d.deck : d.datingDeck;
      return (
        <>
          {ids.map((id) => {
            const p = promptById(id);
            return p ? <PromptInput v={d.v} p={p} answer={bio.answers?.[id]} photoSrc={name === "prompts" ? d.promptPhoto(id) : null} error={errFor(`prompt-${id}`)} /> : null;
          })}
        </>
      );
    }
    case "links":
      return <LinksFields v={d.v} links={vals.links ?? {}} on={!!vals.linksOn} errFor={errFor} />;
  }
  return null;
}

function Radios(props: { v: View; legend: string; name: string; options: Parameters<typeof OptRadios>[0]["options"]; value?: string }) {
  return (
    <fieldset class="choices">
      <legend>{props.legend}</legend>
      <OptRadios v={props.v} name={props.name} options={props.options} value={props.value} />
    </fieldset>
  );
}

function Checks(props: { v: View; legend: string; name: string; options: Parameters<typeof OptChecks>[0]["options"]; values?: string[] }) {
  return (
    <fieldset class="choices">
      <legend>{props.legend}</legend>
      <OptChecks v={props.v} name={props.name} options={props.options} values={props.values} />
    </fieldset>
  );
}

/**
 * Social links (owner, 2026-10-16): one optional field per network and the switch, which is off
 * until the member turns it on. Only mutual connections ever see them (services/profile-links.ts).
 */
function LinksFields(props: { v: View; links: Record<string, string>; on: boolean; errFor: (f: string) => string | undefined }) {
  const { t } = props.v;
  return (
    <>
      <input type="hidden" name="links_present" value="1" />
      <Toggle name="linksOn" label={t("ให้คนรู้จักของฉันเห็นลิงก์", "Show my links to my people")} checked={props.on} />
      <div class="pf-links">
        {NETWORKS.map((n, i) => (
          <Field
            label={`${n.icon} ${t(n.th, n.en)}`}
            name={`link_${n.key}`}
            value={props.links[n.key] ?? ""}
            maxlength={200}
            autocomplete="off"
            // Handles and links: no capitals, autocorrect or spellcheck. Links get the URL keyboard; type=url
            // would make the browser refuse a bare "example.com", which the server accepts.
            inputmode={n.kind === "url" ? "url" : undefined}
            autocapitalize="none"
            autocorrect="off"
            spellcheck={false}
            enterkeyhint={i === NETWORKS.length - 1 ? "done" : "next"}
            placeholder={n.kind === "url" ? "https://" : n.at ? t("@ชื่อผู้ใช้ หรือวางลิงก์", "@name or profile link") : t("ชื่อในลิงก์ หรือวางลิงก์", "Name or profile link")}
            error={props.errFor(n.key)}
          />
        ))}
      </div>
    </>
  );
}

/** "✓ บันทึกแล้ว / Saved": a status line that says the section just saved. Empty until then. */
export function SavedTick(props: { t: View["t"]; on: boolean }) {
  return (
    <span class="pe-tick" role="status" data-saved-text={props.t("✓ บันทึกแล้ว", "✓ Saved")}>
      {props.on ? props.t("✓ บันทึกแล้ว", "✓ Saved") : ""}
    </span>
  );
}

/**
 * One section as its own form: its fields and its own Save. `back` says where a plain (no JS) save
 * returns: "card" to my profile, "edit" to this form. With JS the save happens in place (PE_JS).
 */
export function SectionForm(props: {
  d: SectionData;
  name: SectionName;
  back: "card" | "edit";
  saved?: boolean;
  /** The refused save's message, shown here when it isn't about one field (an upload that failed). */
  formError?: string;
  /** The refused post carried a photo; browsers never refill a file field, so say so. */
  filesLost?: boolean;
  /** This form holds a refused save, so leaving warns from the start. */
  dirty?: boolean;
  sheet?: boolean;
}) {
  const { t } = props.d.v;
  const shuffles = props.name === "prompts" || props.name === "dating-prompts";
  return (
    <form
      method="post"
      action={`/settings/profile/section/${props.name}`}
      enctype="multipart/form-data"
      class="pe-form"
      data-pe={props.name}
      data-guard={props.dirty ? "dirty" : ""}
    >
      {/* Enter / "Go" submits with the FIRST submit button. Without this one that would be a
          prompt's "↻ Different question", which swaps the prompt and deletes its answer. */}
      {shuffles ? (
        <button type="submit" class="sr-only" tabindex={-1} aria-hidden="true">
          {t("บันทึก", "Save")}
        </button>
      ) : null}
      <input type="hidden" name="back" value={props.back} />
      {props.formError || props.filesLost ? (
        <p class="field-err pe-form-err" role="alert">
          <span aria-hidden="true">⚠ </span>
          {props.formError}
          {props.filesLost ? <span class="pf-files-lost">{t(" รูปที่เลือกไว้ยังไม่ได้บันทึก เลือกอีกครั้งได้เลย", " The photo you picked wasn't saved yet. Please choose it again.")}</span> : null}
        </p>
      ) : null}
      <SectionFields d={props.d} name={props.name} sheet={props.sheet} />
      <div class="pe-save">
        <button type="submit" class="btn primary">
          {t("บันทึก", "Save")}
        </button>
        <SavedTick t={t} on={!!props.saved} />
      </div>
    </form>
  );
}

/** The heading over a section on the long form. */
export function SectionHead(props: { t: View["t"]; name: (typeof SECTIONS)[number]; hint?: boolean }) {
  const m = SECTION_META[props.name];
  return (
    <>
      <h2>
        <span aria-hidden="true">{m.emoji}</span> {props.t(m.th, m.en)}
      </h2>
      {props.hint !== false && m.hint ? <p class="muted">{props.t(m.hint[0], m.hint[1])}</p> : null}
    </>
  );
}


/** An answer that says something (an empty photo prompt or an empty pick doesn't). */
const answered = (a: { kind: string; value: unknown; photoKey?: string } | undefined) =>
  !!a && (a.kind === "photo" ? !!a.photoKey : Array.isArray(a.value) ? a.value.length > 0 : a.value !== "" && a.value !== null && a.value !== undefined);

/** How much of an optional section is filled in, as [done, of]. Links say on or off instead. */
export function sectionProgress(name: SectionName, d: Pick<SectionData, "vals" | "deck" | "datingDeck">): [number, number] {
  const b = d.vals.bio;
  const n = (...xs: unknown[]) => xs.filter((x) => (Array.isArray(x) ? x.length > 0 : !!x)).length;
  switch (name) {
    case "here":
      return [n(d.vals.intents, d.vals.socialStyles.filter((s) => !SIZE_STYLES.includes(s))), 2];
    case "comm":
      return [(b.comm ?? []).length, MAX_COMM];
    case "bangkok":
      return [n(b.residency, b.story, b.bkkTime, b.hometown, b.reflections && Object.keys(b.reflections).length), 5];
    case "work":
      return [n(b.occupation, b.education, b.university || b.universityName, b.learning), 4];
    case "meet":
      return [n(b.energy, b.weekend, b.groupSize, b.times, b.budget, b.activities, b.meals, b.access, b.pay, b.bill, b.travel, b.diet, b.spice, b.pets, b.punctual), 15];
    case "prompts":
    case "dating-prompts": {
      const ids = name === "prompts" ? d.deck : d.datingDeck;
      return [ids.filter((id) => answered(b.answers?.[id])).length, ids.length];
    }
    case "links":
      return [Object.values(d.vals.links ?? {}).filter((x) => x.trim()).length, NETWORKS.length];
  }
  return [0, 0];
}

/**
 * One optional section on the long form, as a row: its name and how much is filled in. A tap opens
 * it in place (details and summary, no script); a refused or just-saved section opens by itself.
 */
export function MoreRow(props: { d: SectionData; name: (typeof SECTIONS)[number]; open: boolean; children: Child }) {
  const { t } = props.d.v;
  const m = SECTION_META[props.name];
  const [done, of] = sectionProgress(props.name, props.d);
  const progress =
    props.name === "links"
      ? props.d.vals.linksOn
        ? t(`${done} ลิงก์ · เปิดให้เห็น`, `${done} ${done === 1 ? "link" : "links"} · shown`)
        : t(`${done} ลิงก์ · ปิดอยู่`, `${done} ${done === 1 ? "link" : "links"} · hidden`)
      : t(`${done} จาก ${of}`, `${done} of ${of}`);
  return (
    <details class={`pe-row${props.name === "dating-prompts" ? " pe-love" : ""}`} id={props.name} open={props.open}>
      <summary>
        <span class="pe-row-e" aria-hidden="true">
          {m.emoji}
        </span>
        <span class="pe-row-t">{t(m.th, m.en)}</span>
        <small class="pe-prog">{progress}</small>
      </summary>
      <div class="pe-row-body">
        {m.hint ? <p class="muted">{t(m.hint[0], m.hint[1])}</p> : null}
        {props.children}
      </div>
    </details>
  );
}
