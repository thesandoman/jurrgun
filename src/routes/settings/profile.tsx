/**
 * Settings, profile part (split from routes/settings.tsx, Core Platform C3: a pure move).
 * See ./index.ts for the route list.
 */
import { NO_LOOKUP, type UniversityLookup } from "../../content/universities";
import { educationLookup } from "../../services/universities";
import { romanceEligible } from "../../domain/rules";
import { reflectionsFromForm } from "../../content/reflections";
import { syncQuizChange } from "../pulse";
import { setCookie } from "hono/cookie";
import { and, eq, inArray, sql } from "drizzle-orm";
import { batch, getDb } from "../../db";
import { DISTRICTS, INTENTS, LANGUAGES, SOCIAL_STYLES, values } from "../../lib/constants";
import {
  cleanBio,
  COMM_STYLES,
  currentDatingDeck,
  currentDeck,
  ENERGY,
  isDatingPrompt,
  INTEREST_VALUES,
  LEARNING_MAX,
  MAX_COMM,
  MAX_INTERESTS,
  promptById,
  rankFromPositions,
  swapPrompt,
  validateAnswer,
  WEEKEND_RHYTHM,
  PAY_METHODS,
  MAX_PAY,
  BILL_STYLE,
  GETTING_AROUND,
  MAX_TRAVEL,
  DIET,
  SPICE,
  PETS,
  PUNCTUAL,
  BUDGETS,
  ACTIVITIES,
  MEALS,
  GROUP_SIZES,
  TIME_WINDOWS,
  ACCESS_NEEDS,
  type Answer,
  type Bio,
  isResidency,
  parseBangkok,
  parseEducation,
  parseOccupation,
  withGroupStyle,
} from "../../content/profile";
import { ProfileFormScript } from "../../ui/profile-form";
import {
  hostSection,
  isSectionName,
  MoreRow,
  progressText,
  OPEN_SECTIONS,
  promptOf,
  sectionAnchor,
  SectionForm,
  SectionHead,
  SECTIONS,
  type ProfileVals,
  type SectionData,
  type SectionName,
} from "../../ui/profile-sections";
import { newId } from "../../lib/crypto";
import { audit } from "../../lib/records";
import { consents, profileLinks, profiles, type Profile } from "../../schema";
import { deleteObject, getObject, getObjectUrl, putObject } from "../../storage";
import { list, Notice, page, str, view } from "../../ui/kit";
import { linkInputValue, normaliseLink, NETWORKS, PROFILE_LINKS_CONSENT } from "../../content/social-links";
import { linksSwitch, ownLinks } from "../../services/profile-links";
import { previewCard } from "../profile";
import { CONSENT_VERSION } from "../onboarding";
import { type T } from "../../lib/i18n";
import { settingsRoutes } from "./app";
import { PHOTO_MAX_BYTES, PHOTO_TYPES, me, photoSrc } from "./shared";
import type { C } from "./shared";

// -------------------------------------------------------------- profile --
//
// The richer profile: photo, basics, "here for", interests by group,
// communication style, quick facts and the member's own prompt deck
// (src/content/profile.ts). Every field is validated server-side by kind.
//
// Edited one section at a time (owner, 2026-10-18): each section is its own form
// (src/ui/profile-sections.tsx) posting to POST /settings/profile/section/:name,
// which reads, validates and writes only that section's fields. The old
// all-in-one POST /settings/profile still works and runs every section.

/**
 * The long form: basics first (photo, basics, languages and interests open), then each optional
 * section as a row under "More (optional)" that opens in place. Every section has its own Save.
 */
function ProfileForm(props: {
  d: SectionData;
  back: "card" | "edit";
  error?: string;
  /** The section the refused save belongs to; "all" for the old all-in-one post. */
  errorSection?: SectionName | "all";
  filesLost?: boolean;
  saved?: SectionName | null;
  /** A row to show open (a link to it, or the section just saved). */
  open?: string | null;
}) {
  const { t } = props.d.v;
  const errorIn = (n: SectionName) => props.errorSection === "all" || props.errorSection === n;
  const form = (n: SectionName) => <SectionForm d={props.d} name={n} back={props.back} saved={props.saved === n} dirty={errorIn(n)} />;
  const more = SECTIONS.filter((n) => !OPEN_SECTIONS.includes(n) && (n !== "dating-prompts" || props.d.datingDeck.length));
  return (
    <>
      <p class="spread">
        <a href="/settings">← {t("ฉัน", "Me")}</a>
        <a href="/me/profile" class="pe-preview-link">
          👀 {t("ดูโปรไฟล์ของฉัน", "Preview my profile")}
        </a>
      </p>
      <h1>{t("แก้ไขโปรไฟล์", "Edit profile")}</h1>
      {/* With JS: swap the form for my card drawn from what's typed now, and back, losing nothing (PE_JS).
          Without it, "Preview my profile" above shows the saved card. */}
      <div class="pe-seg" role="group" aria-label={t("มุมมอง", "View")} data-preview-err={t("ดูตัวอย่างไม่ได้ตอนนี้ ลองใหม่อีกครั้ง", "The preview didn't load. Please try again.")}>
        <button type="button" aria-pressed="true" data-pe-view="edit">
          {t("แก้ไข", "Edit")}
        </button>
        <button type="button" aria-pressed="false" data-pe-view="preview">
          {t("คนอื่นเห็นแบบนี้", "How others see it")}
        </button>
      </div>
      <div class="pe-preview" id="pe-preview" role="region" hidden tabindex={-1} aria-label={t("คนอื่นเห็นแบบนี้", "How others see it")} />
      {props.error ? (
        <Notice kind="error">
          {props.error}
          {props.filesLost ? <span class="pf-files-lost">{t(" รูปที่เลือกไว้ยังไม่ได้บันทึก เลือกอีกครั้งได้เลย", " The photo you picked wasn't saved yet. Please choose it again.")}</span> : null}
        </Notice>
      ) : null}
      <div class="pe-forms" id="pe-forms">
        {OPEN_SECTIONS.map((n) => (
          <section class="pf-section" id={n}>
            <SectionHead t={t} name={n as (typeof SECTIONS)[number]} />
            {form(n)}
          </section>
        ))}
        <section class="pe-more" aria-labelledby="pe-more-h">
          <h2 id="pe-more-h">{t("เพิ่มเติม (ไม่บังคับ)", "More (optional)")}</h2>
          {more.map((n) => (
            <MoreRow d={props.d} name={n} open={props.open === n || props.saved === n || (errorIn(n) && props.errorSection !== "all")}>
              {form(n)}
            </MoreRow>
          ))}
        </section>
      </div>
      <ProfileFormScript />
    </>
  );
}

function profileVals(p: Profile): ProfileVals {
  return {
    nickname: p.nickname,
    district: p.district,
    pronouns: p.pronouns,
    showPronouns: p.showPronouns,
    languages: p.languages,
    interests: p.interests,
    socialStyles: p.socialStyles,
    eventStyle: p.eventStyle,
    intents: p.intents.filter((i) => i !== "romance"),
    newcomer: p.newcomer,
    locale: p.locale,
    bio: cleanBio(p.bio),
  };
}

/** Everything a section renderer needs, for the stored profile or for what was typed. */
async function sectionData(c: C, vals: ProfileVals, opts: { error?: string; errorField?: string } = {}): Promise<SectionData> {
  const user = me(c);
  const p = user.profile!;
  if (!vals.links) {
    const db = getDb(c.env);
    const [rows, on] = await Promise.all([ownLinks(db, user.account.id), linksSwitch(db, [user.account.id])]);
    vals = { ...vals, links: Object.fromEntries(rows.map((r) => [r.network, linkInputValue(r.network, r.value)])), linksOn: !!on.get(user.account.id) };
  }
  const stored = cleanBio(p.bio);
  // Prompt photos come from the stored bio (the form never holds unsaved files).
  const promptPhoto = (id: string) => (stored.answers?.[id]?.photoKey ? `/people/${user.account.id}/photo/${id}` : null);
  return {
    v: view(c),
    vals,
    deck: currentDeck(user.account.id, stored),
    datingDeck: romanceEligible(p) ? currentDatingDeck(user.account.id, stored) : [],
    photo: await photoSrc(c, p.photoKey),
    hasPhoto: !!p.photoKey,
    promptPhoto,
    // errorField names the field the message belongs to, so the form shows it there and takes the member to it.
    errFor: (field: string) => (opts.errorField === field ? opts.error : undefined),
  };
}

async function renderProfileForm(
  c: C,
  vals: ProfileVals,
  opts: { error?: string; errorField?: string; errorSection?: SectionName | "all"; status?: 400; filesLost?: boolean; back?: "card" | "edit" } = {},
) {
  const d = await sectionData(c, vals, opts);
  // Reached from an ✏️ on my card (no JS): a plain save goes back to the card.
  const back = opts.back ?? (c.req.query("from") === "card" ? "card" : "edit");
  const saved = c.req.query("saved");
  const savedName = saved && isSectionName(saved) ? saved : null;
  // A prompt saved on its own opens the prompts it belongs to.
  const open = c.req.query("open") ?? (savedName ? hostSection(savedName, d.datingDeck) : null);
  return page(
    c,
    { title: view(c).t("แก้ไขโปรไฟล์", "Edit profile"), tab: "me", status: opts.status },
    <ProfileForm d={d} back={back} error={opts.error} errorSection={opts.errorSection} filesLost={opts.filesLost} saved={savedName} open={open} />,
  );
}

settingsRoutes.get("/settings/profile", (c) => renderProfileForm(c, profileVals(me(c).profile!)));

type Body = Record<string, string | File | (string | File)[]>;

/** The profile as the form has it so far, with the files and side effects a save will carry out. */
type Draft = {
  vals: ProfileVals;
  mainFile: File | null;
  removePhoto: boolean;
  pending: { id: string; file: File }[];
  dropKeys: string[];
  /** Normalised social links (null clears one) and the switch, when the post carried the links section. */
  links?: { values: Record<string, string | null>; on: boolean };
  /** The post carried the pronoun field (the all-in-one post from before pronouns lived here may not). */
  pronounsSent?: boolean;
};
type Fail = { error: string; errorField?: string };
/** What every section reads: the stored profile and my prompt decks. */
/** `uni`: the posted university, resolved before the (synchronous) appliers run. */
type EditCtx = { t: T; p: Profile; stored: Bio; deck: string[]; datingDeck: string[]; uni: UniversityLookup };
type Applier = (body: Body, d: Draft, x: EditCtx) => Fail | null;

const fileOf = (raw: unknown): File | null => {
  const f = Array.isArray(raw) ? raw[0] : raw;
  return f instanceof File && f.size > 0 ? f : null;
};

/** The post carried a photo (main or a prompt's): a refused save can't give it back, so the page says so. */
const postedFiles = (body: Body) => Object.entries(body).some(([k, v]) => (k === "photo" || k.startsWith("f_")) && fileOf(v) !== null);

const oneOf = (v: string, list: { value: string }[]) => (list.some((x) => x.value === v) ? v : undefined);
const pickAll = (body: Body, key: string, allowed: string[]) => [...new Set(list(body[key]).filter((x) => allowed.includes(x)))];

function editCtx(c: C, uni: UniversityLookup = NO_LOOKUP): EditCtx {
  const user = me(c);
  const p = user.profile!;
  const stored = cleanBio(p.bio);
  return {
    t: view(c).t,
    p,
    stored,
    deck: currentDeck(user.account.id, stored),
    // Dating prompts exist only while romance mode is on.
    datingDeck: romanceEligible(p) ? currentDatingDeck(user.account.id, stored) : [],
    uni,
  };
}

/** Resolve the posted university for parseEducation (one or two small reads). */
const uniFor = (c: C, body: Body) => educationLookup(c.env, { university: str(body.university), universityName: str(body.universityName) });

const newDraft = (x: EditCtx): Draft => ({ vals: profileVals(x.p), mainFile: null, removePhoto: false, pending: [], dropKeys: [] });

/** Prompt answers for these prompts only; every other answer stays as it is. Returns the first problem. */
function applyPrompts(body: Body, d: Draft, x: EditCtx, ids: string[]): Fail | null {
  const { t } = x;
  const answers: Record<string, Answer> = { ...(d.vals.bio.answers ?? {}) };
  let first: Fail | null = null;
  const fail = (id: string, th: string, en: string) => {
    first ??= { error: t(th, en), errorField: `prompt-${id}` };
  };
  for (const id of ids) {
    const q = promptById(id);
    if (!q) continue;
    const old = x.stored.answers?.[id];
    const inForm = str(body[`m_${id}`]) === "1";
    if (str(body[`clear_${id}`]) === "1") {
      if (old?.photoKey) d.dropKeys.push(old.photoKey);
      delete answers[id];
      continue;
    }
    const title = t(q.th, q.en);
    if (q.kind === "photo") {
      const caption = validateAnswer(q, str(body[`a_${id}`]));
      if (!caption.ok) {
        fail(id, `${title}: ${caption.error.th}`, `${title}: ${caption.error.en}`);
        if (old) answers[id] = { ...old, value: str(body[`a_${id}`]) };
        continue;
      }
      const file = fileOf(body[`f_${id}`]);
      if (file) {
        if (!PHOTO_TYPES.includes(file.type)) {
          fail(id, `${title}: รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP`, `${title}: photos must be JPG, PNG or WebP.`);
          continue;
        }
        if (file.size > PHOTO_MAX_BYTES) {
          fail(id, `${title}: รูปต้องมีขนาดไม่เกิน 5 MB`, `${title}: photos must be 5 MB or smaller.`);
          continue;
        }
        d.pending.push({ id, file });
        if (old?.photoKey) d.dropKeys.push(old.photoKey);
        answers[id] = { kind: "photo", value: (caption.value as string | null) ?? "" };
      } else if (old?.photoKey) {
        answers[id] = { ...old, value: inForm ? ((caption.value as string | null) ?? "") : old.value };
      }
      continue;
    }
    let raw: string | string[] | undefined;
    if (q.kind === "rank") {
      const positions: Record<string, string> = {};
      for (const o of q.options ?? []) positions[o.value] = str(body[`r_${id}_${o.value}`]);
      const order = rankFromPositions(q, positions);
      if (order === "partial") {
        fail(id, `${title}: เรียงอันดับให้ครบทุกข้อ และไม่ซ้ำกัน`, `${title}: give every item a different place.`);
        continue;
      }
      raw = order;
    } else {
      raw = list(body[`a_${id}`]);
    }
    const r = validateAnswer(q, raw);
    if (!r.ok) {
      fail(id, `${title}: ${r.error.th}`, `${title}: ${r.error.en}`);
      // Shown back as typed (text) or as picked, so fixing it is one change, not a retype.
      const typed = Array.isArray(raw) ? raw : raw ? [raw] : [];
      answers[id] = { kind: q.kind, value: q.kind === "text" ? (typed[0] ?? "") : typed };
      continue;
    }
    if (r.value === null) {
      // Not answered. Only an explicit empty field (or a rendered prompt) clears it.
      if (inForm || (q.kind === "text" && `a_${id}` in body)) delete answers[id];
    } else {
      answers[id] = { kind: q.kind, value: r.value };
    }
  }
  d.vals.bio.answers = answers;
  return first;
}

/** Each section reads its own fields off the post into the draft and says what's wrong, if anything. */
const APPLY: Record<(typeof SECTIONS)[number], Applier> = {
  photo(body, d, x) {
    d.mainFile = fileOf(body.photo);
    d.removePhoto = str(body.removePhoto) === "1";
    const f = d.mainFile;
    if (f && !PHOTO_TYPES.includes(f.type)) return { error: x.t("รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP", "Photos must be JPG, PNG or WebP."), errorField: "photo" };
    if (f && f.size > PHOTO_MAX_BYTES) return { error: x.t("รูปต้องมีขนาดไม่เกิน 5 MB", "Photos must be 5 MB or smaller."), errorField: "photo" };
    return null;
  },
  basics(body, d, x) {
    const v = d.vals;
    v.nickname = str(body.nickname);
    v.district = str(body.district);
    v.newcomer = str(body.newcomer) === "1";
    v.locale = str(body.locale) === "en" ? "en" : "th";
    if ("pronouns" in body) {
      d.pronounsSent = true;
      v.pronouns = str(body.pronouns).slice(0, 30) || null;
      v.showPronouns = !!v.pronouns && str(body.showPronouns) === "1";
    }
    if (!v.nickname) return { error: x.t("ใส่ชื่อเล่นก่อน", "Please add a nickname."), errorField: "nickname" };
    if (v.nickname.length > 30) return { error: x.t("ชื่อเล่นยาวได้ไม่เกิน 30 ตัวอักษร", "Nickname can be at most 30 characters."), errorField: "nickname" };
    if (!values(DISTRICTS).includes(v.district)) return { error: x.t("เลือกเขต", "Please choose a district."), errorField: "district" };
    return null;
  },
  languages(body, d, x) {
    d.vals.languages = pickAll(body, "languages", values(LANGUAGES));
    d.vals.bio.learningLangs = pickAll(body, "learningLangs", values(LANGUAGES));
    if (d.vals.languages.length === 0) return { error: x.t("เลือกภาษาที่พูดได้อย่างน้อย 1 ภาษา", "Pick at least one language."), errorField: "languages" };
    return null;
  },
  interests(body, d, x) {
    const v = d.vals;
    v.interests = pickAll(body, "interests", INTEREST_VALUES);
    if (v.interests.length === 0) return { error: x.t("เลือกความสนใจอย่างน้อย 1 อย่าง", "Pick at least one interest."), errorField: "interests" };
    if (v.interests.length > MAX_INTERESTS) return { error: x.t(`เลือกความสนใจได้ไม่เกิน ${MAX_INTERESTS} อย่าง`, `Pick at most ${MAX_INTERESTS} interests.`), errorField: "interests" };
    return null;
  },
  here(body, d) {
    d.vals.intents = pickAll(body, "intents", values(INTENTS));
    // Small / big group follow the group size answer (seating reads them).
    d.vals.socialStyles = withGroupStyle(pickAll(body, "socialStyles", values(SOCIAL_STYLES)), d.vals.bio.groupSize);
    return null;
  },
  comm(body, d, x) {
    const comm = pickAll(body, "comm", COMM_STYLES.map((s) => s.value));
    d.vals.bio.comm = comm;
    if (comm.length > MAX_COMM) return { error: x.t(`เลือกสไตล์การติดต่อได้ไม่เกิน ${MAX_COMM} แบบ`, `Pick at most ${MAX_COMM} communication styles.`), errorField: "comm" };
    return null;
  },
  bangkok(body, d, x) {
    const bio = d.vals.bio;
    Object.assign(bio, parseBangkok(str(body.story), str(body.bkkTime), str(body.hometown), str(body.guide)));
    // Sign-up's answer stays unless they pick another one.
    bio.residency = isResidency(str(body.residency)) ? str(body.residency) : x.stored.residency;
    // "My Bangkok" reflections: the form sends them all, so they replace the stored ones (all blank clears them).
    bio.reflections = str(body.r_present) === "1" ? reflectionsFromForm(body) : x.stored.reflections;
    if (!bio.reflections) delete bio.reflections;
    return null;
  },
  work(body, d, x) {
    const bio = d.vals.bio;
    Object.assign(
      bio,
      parseOccupation(str(body.occupation), str(body.occupationOther)),
      parseEducation({ level: str(body.education), detail: str(body.educationDetail), university: str(body.university), universityName: str(body.universityName), gradYear: str(body.gradYear) }, undefined, x.uni),
    );
    bio.learning = str(body.learning);
    if (bio.learning.length > LEARNING_MAX) return { error: x.t(`"กำลังเรียนรู้" ยาวได้ไม่เกิน ${LEARNING_MAX} ตัวอักษร`, `"Currently learning" can be at most ${LEARNING_MAX} characters.`), errorField: "learning" };
    if (!bio.learning) delete bio.learning;
    return null;
  },
  meet(body, d) {
    const bio = d.vals.bio;
    const energy = str(body.energy);
    const weekend = str(body.weekendRhythm);
    Object.assign(bio, {
      energy: ENERGY.some((x) => x.value === energy) ? energy : undefined,
      weekend: WEEKEND_RHYTHM.some((x) => x.value === weekend) ? weekend : undefined,
      pay: pickAll(body, "pay", PAY_METHODS.map((x) => x.value)).slice(0, MAX_PAY),
      bill: oneOf(str(body.bill), BILL_STYLE),
      travel: pickAll(body, "travel", GETTING_AROUND.map((x) => x.value)).slice(0, MAX_TRAVEL),
      diet: pickAll(body, "diet", DIET.map((x) => x.value)),
      spice: oneOf(str(body.spice), SPICE),
      pets: oneOf(str(body.pets), PETS),
      punctual: oneOf(str(body.punctual), PUNCTUAL),
      budget: oneOf(str(body.budget), BUDGETS),
      activities: pickAll(body, "activities", ACTIVITIES.map((x) => x.value)),
      meals: pickAll(body, "meals", MEALS.map((x) => x.value)),
      groupSize: oneOf(str(body.groupSize), GROUP_SIZES),
      times: pickAll(body, "times", TIME_WINDOWS.map((x) => x.value)),
      access: pickAll(body, "access", ACCESS_NEEDS.map((x) => x.value)),
    } satisfies Partial<Bio>);
    // The small / big group style follows the group size; the other styles are Here for's.
    d.vals.socialStyles = withGroupStyle(d.vals.socialStyles, bio.groupSize);
    return null;
  },
  prompts(body, d, x) {
    d.vals.bio.deck = x.deck;
    return applyPrompts(body, d, x, x.deck);
  },
  "dating-prompts"(body, d, x) {
    d.vals.bio.datingDeck = x.datingDeck;
    return applyPrompts(body, d, x, x.datingDeck);
  },
  links(body, d, x) {
    // Only when the post carried its section, so other posts never clear them.
    if (str(body.links_present) !== "1") return null;
    const typed = Object.fromEntries(NETWORKS.map((n) => [n.key, str(body[`link_${n.key}`]).slice(0, 400)]));
    d.vals.links = typed;
    d.vals.linksOn = str(body.linksOn) === "1";
    const out: Record<string, string | null> = {};
    for (const n of NETWORKS) {
      const r = normaliseLink(n.key, typed[n.key] ?? "");
      if (!r.ok) {
        const name = x.t(n.th, n.en);
        return { error: x.t(`${name}: ${r.error.th}`, `${name}: ${r.error.en}`), errorField: n.key };
      }
      out[n.key] = r.value;
    }
    d.links = { values: out, on: d.vals.linksOn };
    return null;
  },
};

/** Run in this order (Meeting up sets the group size Here for's styles follow); errors are reported in ERROR_ORDER. */
const APPLY_ORDER: (typeof SECTIONS)[number][] = ["photo", "basics", "languages", "interests", "meet", "here", "comm", "bangkok", "work", "prompts", "dating-prompts", "links"];
const ERROR_ORDER: (typeof SECTIONS)[number][] = ["basics", "languages", "interests", "comm", "work", "photo", "prompts", "dating-prompts", "links"];

/** Which columns and bio keys a section may write. Nothing outside these is ever changed by its save. */
type ProfileCol = "nickname" | "district" | "pronouns" | "showPronouns" | "languages" | "interests" | "socialStyles" | "intents" | "newcomer" | "locale" | "photoKey";
type Scope = { cols: ProfileCol[]; bio: (keyof Bio)[]; answers: string[] };
function sectionScope(name: SectionName, x: Pick<EditCtx, "deck" | "datingDeck">): Scope {
  const one = promptOf(name);
  if (one) return { cols: [], bio: [x.datingDeck.includes(one) ? "datingDeck" : "deck"], answers: [one] };
  const s = (cols: ProfileCol[], bio: (keyof Bio)[] = [], answers: string[] = []): Scope => ({ cols, bio, answers });
  switch (name as (typeof SECTIONS)[number]) {
    case "photo":
      return s(["photoKey"]);
    case "basics":
      return s(["nickname", "district", "pronouns", "showPronouns", "newcomer", "locale"]);
    case "languages":
      return s(["languages"], ["learningLangs"]);
    case "interests":
      return s(["interests"]);
    case "here":
      return s(["intents", "socialStyles"]);
    case "comm":
      return s([], ["comm"]);
    case "bangkok":
      return s([], ["story", "bkkTime", "hometown", "guide", "residency", "reflections"]);
    case "work":
      return s([], ["occupation", "occupationOther", "education", "educationDetail", "university", "universityName", "universityLabel", "gradYear", "learning"]);
    case "meet":
      return s(["socialStyles"], ["energy", "weekend", "pay", "bill", "travel", "diet", "spice", "pets", "punctual", "budget", "activities", "meals", "groupSize", "times", "access"]);
    case "prompts":
      return s([], ["deck"], x.deck);
    case "dating-prompts":
      return s([], ["datingDeck"], x.datingDeck);
    case "links":
      return s([]);
  }
  return s([]);
}

type Parsed = { ok: false; vals: ProfileVals; error: string; errorField?: string; section: SectionName | "all" } | { ok: true; draft: Draft; scope: Scope | "all" };

/** Read and validate the whole profile form (the all-in-one post). Touches nothing. */
function parseProfileForm(c: C, body: Body, uni: UniversityLookup): Parsed {
  const x = editCtx(c, uni);
  const d = newDraft(x);
  const errs = new Map<string, Fail>();
  // Every section is read first, so whatever error comes back, everything typed is still in the form.
  for (const n of APPLY_ORDER) {
    if (n === "dating-prompts" && !x.datingDeck.length) continue;
    const e = APPLY[n](body, d, x);
    if (e) errs.set(n, e);
  }
  // The whole form: answers to prompts no longer in either deck are dropped (with their photos).
  const bio = d.vals.bio;
  const all = [...x.deck, ...x.datingDeck];
  for (const [id, a] of Object.entries(bio.answers ?? {})) {
    if (all.includes(id)) continue;
    if (a.photoKey) d.dropKeys.push(a.photoKey);
    delete bio.answers![id];
  }
  bio.deck = x.deck;
  bio.datingDeck = x.datingDeck.length ? x.datingDeck : undefined;
  const first = ERROR_ORDER.find((n) => errs.has(n));
  if (first) return { ok: false, vals: d.vals, ...errs.get(first)!, section: "all" };
  return { ok: true, draft: d, scope: "all" };
}

/** Read and validate one section. Null when there is no such section for me (a prompt not in my decks, or dating prompts without 💘). */
function parseSection(c: C, name: SectionName, body: Body, uni: UniversityLookup): Parsed | null {
  const x = editCtx(c, uni);
  const d = newDraft(x);
  const one = promptOf(name);
  let e: Fail | null;
  if (one) {
    if (!x.deck.includes(one) && !x.datingDeck.includes(one)) return null;
    if (x.deck.includes(one)) d.vals.bio.deck = x.deck;
    else d.vals.bio.datingDeck = x.datingDeck;
    e = applyPrompts(body, d, x, [one]);
  } else {
    if (name === "dating-prompts" && !x.datingDeck.length) return null;
    e = APPLY[name as (typeof SECTIONS)[number]](body, d, x);
  }
  if (e) return { ok: false, vals: d.vals, ...e, section: name };
  return { ok: true, draft: d, scope: sectionScope(name, x) };
}

/** Upload files, then write the profile (only what the scope allows). Returns an error message or null. */
async function saveProfile(c: C, parsed: Extract<Parsed, { ok: true }>): Promise<string | null> {
  const { t } = view(c);
  const user = me(c);
  const p = user.profile!;
  const { draft, scope } = parsed;
  const vals = draft.vals;
  const may = (col: ProfileCol) => {
    if (scope !== "all") return scope.cols.includes(col);
    // The all-in-one post writes everything it carries; pronouns only when it carried them.
    return col === "pronouns" || col === "showPronouns" ? !!draft.pronounsSent : true;
  };
  // Server-generated keys only; bytes go straight to the file store.
  const uploaded: string[] = [];
  const put = async (key: string, file: File) => {
    await putObject(c.env, key, await file.arrayBuffer(), { contentType: file.type });
    uploaded.push(key);
  };
  let photoKey = p.photoKey;
  try {
    if (may("photoKey")) {
      if (draft.mainFile) {
        photoKey = `uploads/${user.account.id}/${crypto.randomUUID()}`;
        await put(photoKey, draft.mainFile);
      } else if (draft.removePhoto) {
        photoKey = null;
      }
    }
    for (const { id, file } of draft.pending) {
      const key = `uploads/${user.account.id}/prompts/${crypto.randomUUID()}`;
      await put(key, file);
      vals.bio.answers![id] = { ...vals.bio.answers![id], photoKey: key };
    }
  } catch {
    for (const k of uploaded) await deleteObject(c.env, k).catch(() => {});
    return t("อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง", "The photo couldn't be uploaded. Please try again.");
  }

  // The bio: the whole draft, or the stored bio with only this section's keys (and answers) replaced.
  const stored = cleanBio(p.bio);
  let bio: Bio;
  if (scope === "all") bio = vals.bio;
  else {
    bio = { ...stored };
    const out = bio as Record<string, unknown>;
    for (const k of scope.bio) {
      const val = vals.bio[k];
      if (val === undefined) delete out[k];
      else out[k] = val;
    }
    if (scope.answers.length) {
      const answers = { ...(stored.answers ?? {}) };
      for (const id of scope.answers) {
        const a = vals.bio.answers?.[id];
        if (a) answers[id] = a;
        else delete answers[id];
      }
      bio.answers = answers;
    }
  }
  const bioChanged = scope === "all" || scope.bio.length > 0 || scope.answers.length > 0;

  // This form only edits the non-romance intents; romance follows romance mode.
  const intents = [...(vals.intents.length ? vals.intents : ["friends"]), ...(p.romanceOn ? ["romance"] : [])];
  const all: Record<ProfileCol, unknown> = {
    nickname: vals.nickname,
    district: vals.district,
    pronouns: vals.pronouns,
    showPronouns: vals.showPronouns,
    languages: vals.languages,
    interests: vals.interests,
    socialStyles: vals.socialStyles,
    intents,
    newcomer: vals.newcomer,
    locale: vals.locale,
    photoKey,
  };
  const set: Partial<typeof profiles.$inferInsert> = {};
  for (const col of Object.keys(all) as ProfileCol[]) if (may(col)) (set as Record<string, unknown>)[col] = all[col];
  if (scope === "all") set.eventStyle = p.eventStyle;
  if (bioChanged) set.bio = bio;
  if (Object.keys(set).length) {
    set.updatedAt = new Date();
    await getDb(c.env).update(profiles).set(set).where(eq(profiles.accountId, user.account.id));
  }
  const drop = [...draft.dropKeys, ...(may("photoKey") && p.photoKey && p.photoKey !== photoKey ? [p.photoKey] : [])];
  for (const k of drop) await deleteObject(c.env, k).catch(() => {});
  if (may("locale") && vals.locale !== p.locale) setCookie(c, "lang", vals.locale, { path: "/", maxAge: 365 * 86_400, sameSite: "Lax" });
  // City Pulse follows the change reflection: replaced when edited, withdrawn when cleared (consent rules in syncQuizChange).
  const before = stored.reflections?.change;
  const after = bio.reflections?.change;
  if (draft.links) await saveLinks(c, draft.links);
  // Keep the in-request copy current for anything rendered after this.
  Object.assign(p, set);
  if (before !== after) await syncQuizChange(c, after);
  return null;
}

/**
 * Social links: one row per filled network (an empty field deletes its row), and the switch as an
 * append-only consent row, written only when it changes (latest wins, like the Privacy Center).
 */
async function saveLinks(c: C, links: { values: Record<string, string | null>; on: boolean }) {
  const db = getDb(c.env);
  const id = me(c).account.id;
  const now = new Date();
  const current = await linksSwitch(db, [id]);
  const keep = Object.entries(links.values).filter((e): e is [string, string] => e[1] !== null);
  const drop = Object.entries(links.values).filter(([, v]) => v === null).map(([k]) => k);
  const queries: { toSQL(): { sql: string; params: unknown[] } }[] = [];
  if (drop.length) queries.push(db.delete(profileLinks).where(and(eq(profileLinks.accountId, id), inArray(profileLinks.network, drop))));
  if (keep.length) {
    queries.push(
      db
        .insert(profileLinks)
        .values(keep.map(([network, value]) => ({ id: newId(), accountId: id, network, value, updatedAt: now })))
        .onConflictDoUpdate({ target: [profileLinks.accountId, profileLinks.network], set: { value: sql`excluded.value`, updatedAt: now } }),
    );
  }
  if (links.on !== !!current.get(id)) {
    queries.push(db.insert(consents).values({ id: newId(), accountId: id, category: PROFILE_LINKS_CONSENT, granted: links.on, version: CONSENT_VERSION }));
    queries.push(audit(db, id, "consent.updated", { type: "account", id }, { changed: { [PROFILE_LINKS_CONSENT]: links.on } }));
  }
  if (queries.length) await batch(c.env, queries);
}

settingsRoutes.post("/settings/profile", async (c) => {
  const body = (await c.req.parseBody({ all: true })) as Body;
  const parsed = parseProfileForm(c, body, await uniFor(c, body));
  if (!parsed.ok) return renderProfileForm(c, parsed.vals, { error: parsed.error, errorField: parsed.errorField, errorSection: "all", status: 400, filesLost: postedFiles(body) });
  const err = await saveProfile(c, parsed);
  if (err) return renderProfileForm(c, parsed.draft.vals, { error: err, errorSection: "all", status: 400, filesLost: postedFiles(body) });
  return c.redirect("/settings?notice=saved");
});

/** A section save sent by the page's script (PE_JS): it gets the section's form back instead of a whole page. */
const inPlace = (c: C) => c.req.header("x-pe") === "1";

/** One section's form on its own, for an edit sheet or an in-place save. */
async function sectionFragment(
  c: C,
  name: SectionName,
  vals: ProfileVals,
  opts: { back: "card" | "edit"; saved?: boolean; error?: string; errorField?: string; filesLost?: boolean; status?: 200 | 400 },
) {
  const d = await sectionData(c, vals, opts);
  c.header("cache-control", "no-store");
  // The long form's row shows how much is filled in; a save updates it from this.
  if (opts.saved) c.header("x-pe-progress", encodeURIComponent(progressText(d.v.t, hostSection(name, d.datingDeck), d)));
  return c.html(
    <SectionForm
      d={d}
      name={name}
      back={opts.back}
      saved={opts.saved}
      sheet={opts.back === "card"}
      dirty={!!opts.error}
      formError={opts.error && !opts.errorField ? opts.error : undefined}
      filesLost={opts.filesLost}
    />,
    opts.status ?? 200,
  );
}

/** Where a plain (no JS) section save goes back to, with the tick flag. */
function savedUrl(name: SectionName, back: "card" | "edit") {
  return back === "card" ? `/me/profile?saved=${encodeURIComponent(name)}#pe-${name}` : `/settings/profile?saved=${encodeURIComponent(name)}#${sectionAnchor(name)}`;
}

/** One section's form (for an edit sheet). A plain visit goes to that section of the long form. */
settingsRoutes.get("/settings/profile/section/:name", async (c) => {
  const name = c.req.param("name");
  if (!isSectionName(name)) return c.notFound();
  const x = editCtx(c);
  const one = promptOf(name);
  if ((one && !x.deck.includes(one) && !x.datingDeck.includes(one)) || (name === "dating-prompts" && !x.datingDeck.length)) return c.notFound();
  if (!inPlace(c)) return c.redirect(`/settings/profile?open=${hostSection(name, x.datingDeck)}#${sectionAnchor(name)}`);
  return sectionFragment(c, name, profileVals(me(c).profile!), { back: c.req.query("back") === "card" ? "card" : "edit" });
});

/**
 * Save one section. Only that section's fields are read and only its columns and bio keys are
 * written, so whatever else the post carries, nothing outside the section changes.
 */
settingsRoutes.post("/settings/profile/section/:name", async (c) => {
  const name = c.req.param("name");
  if (!isSectionName(name)) return c.notFound();
  const body = (await c.req.parseBody({ all: true })) as Body;
  const back = str(body.back) === "card" ? "card" : "edit";
  const parsed = parseSection(c, name, body, await uniFor(c, body));
  if (!parsed) return c.notFound();
  const lost = postedFiles(body);
  const refuse = (vals: ProfileVals, error: string, errorField?: string) =>
    inPlace(c)
      ? sectionFragment(c, name, vals, { back, error, errorField, filesLost: lost, status: 400 })
      : renderProfileForm(c, vals, { error, errorField, errorSection: hostSection(name, editCtx(c).datingDeck), status: 400, filesLost: lost, back });
  if (!parsed.ok) return refuse(parsed.vals, parsed.error, parsed.errorField);
  const err = await saveProfile(c, parsed);
  if (err) return refuse(parsed.draft.vals, err);
  if (inPlace(c)) return sectionFragment(c, name, profileVals(me(c).profile!), { back, saved: true });
  return c.redirect(savedUrl(name, back), 303);
});

/**
 * "How others see it" (owner card 3): the edit form's current values, saved or not, drawn as my
 * card the way a connection sees it. The page's script posts every section's fields here (photos
 * left out). Every section reads the post exactly as a save would, then nothing is written: the
 * card is rendered from that draft through the same template and privacy filter as the real one.
 */
settingsRoutes.post("/settings/profile/preview", async (c) => {
  const body = (await c.req.parseBody({ all: true })) as Body;
  const x = editCtx(c, await uniFor(c, body));
  const d = newDraft(x);
  // Problems don't stop a preview: it shows what was typed, as far as it can be read.
  for (const n of APPLY_ORDER) if (n !== "dating-prompts" || x.datingDeck.length) APPLY[n](body, d, x);
  const v = d.vals;
  const draft: Profile = {
    ...x.p,
    nickname: v.nickname || x.p.nickname,
    district: v.district,
    pronouns: v.pronouns,
    showPronouns: v.showPronouns,
    languages: v.languages,
    interests: v.interests,
    socialStyles: v.socialStyles,
    intents: [...(v.intents.length ? v.intents : ["friends"]), ...(x.p.romanceOn ? ["romance"] : [])],
    newcomer: v.newcomer,
    photoKey: d.removePhoto ? null : x.p.photoKey,
    bio: v.bio,
  };
  c.header("cache-control", "no-store");
  return c.html(await previewCard(c, draft));
});

/**
 * Swap one prompt in my deck for an unused one. When posted from a prompts form (the ↻ button),
 * that form is saved first so nothing typed is lost; the old all-in-one form saved everything.
 */
settingsRoutes.post("/settings/prompts/shuffle", async (c) => {
  const body = (await c.req.parseBody({ all: true })) as Body;
  const user = me(c);
  const id = str(body.promptId);
  const dating = isDatingPrompt(id);
  if ("nickname" in body) {
    const parsed = parseProfileForm(c, body, await uniFor(c, body));
    if (!parsed.ok) return renderProfileForm(c, parsed.vals, { error: parsed.error, errorField: parsed.errorField, errorSection: "all", status: 400, filesLost: postedFiles(body) });
    const err = await saveProfile(c, parsed);
    if (err) return renderProfileForm(c, parsed.draft.vals, { error: err, errorSection: "all", status: 400, filesLost: postedFiles(body) });
  } else if ("back" in body) {
    const section: SectionName = dating ? "dating-prompts" : "prompts";
    const parsed = parseSection(c, section, body, await uniFor(c, body));
    if (!parsed) return c.text("Unknown prompt", 400);
    if (!parsed.ok) return renderProfileForm(c, parsed.vals, { error: parsed.error, errorField: parsed.errorField, errorSection: section, status: 400, filesLost: postedFiles(body) });
    const err = await saveProfile(c, parsed);
    if (err) return renderProfileForm(c, parsed.draft.vals, { error: err, errorSection: section, status: 400, filesLost: postedFiles(body) });
  }
  const p = user.profile!;
  const bio = cleanBio(p.bio);
  if (dating && !romanceEligible(p)) return c.text("Unknown prompt", 400);
  const deck = dating ? currentDatingDeck(user.account.id, bio) : currentDeck(user.account.id, bio);
  if (!deck.includes(id)) return c.text("Unknown prompt", 400);
  const next = swapPrompt(deck, id, Math.random, bio.skipped ?? []);
  if (next === deck) return c.redirect(dating ? "/settings/profile?open=dating-prompts#dating-prompts" : "/settings/profile?open=prompts#prompts");
  const answers = { ...(bio.answers ?? {}) };
  const dropKey = answers[id]?.photoKey;
  delete answers[id];
  const newBio: Bio = { ...bio, ...(dating ? { datingDeck: next } : { deck: next }), answers, skipped: [...(bio.skipped ?? []).filter((x) => x !== id), id].slice(-40) };
  await getDb(c.env).update(profiles).set({ bio: newBio, updatedAt: new Date() }).where(eq(profiles.accountId, user.account.id));
  if (dropKey) await deleteObject(c.env, dropKey).catch(() => {});
  const fresh = next[deck.indexOf(id)];
  return c.redirect(`/settings/profile?notice=saved&open=${dating ? "dating-prompts" : "prompts"}#prompt-${fresh}`);
});

/** My own photo. Deployed: redirect to a signed URL. Locally: serve the bytes (dev only). */
settingsRoutes.get("/settings/photo", async (c) => {
  const key = me(c).profile!.photoKey;
  if (!key) return c.notFound();
  if (c.env.FILES) {
    return new Response(null, { status: 302, headers: { location: await getObjectUrl(c.env, key), "cache-control": "private, max-age=60" } });
  }
  const obj = await getObject(c.env, key).catch(() => null);
  if (!obj) return c.notFound();
  return new Response(obj.body, { headers: { "content-type": obj.metadata.contentType ?? "application/octet-stream", "cache-control": "private, max-age=60" } });
});
