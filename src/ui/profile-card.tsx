/**
 * The profile card ("bio"): what another member sees at /people/:id and what
 * I preview at /me/profile. Big photo, name, district and badges, then one
 * glance strip of up to 6 emoji facts. Open below that: the top 2 prompt
 * answers, Here for and interests. Everything else folds into a native
 * details dropdown, in the order the sections always had (owner, 2026-10-18).
 *
 * Privacy: this component only ever receives display-safe fields. It never
 * gets age, birth date, username, relationship status, romance settings,
 * gender identity or age preferences, and "romance" is filtered out of the
 * "Here for" chips so romance mode is never revealed.
 */
import type { Child } from "hono/jsx";
import { reflectionFacts } from "./reflections";
import {
  COMM_STYLES,
  ENERGY,
  interestOpt,
  promptById,
  WEEKEND_RHYTHM,
  PAY_METHODS,
  BILL_STYLE,
  GETTING_AROUND,
  DIET,
  SPICE,
  PETS,
  PUNCTUAL,
  type Answer,
  type Bio,
  type Prompt,
  BKK_STORY,
  BKK_TIME,
  RESIDENCY,
  educationLabel,
  universityKey,
  occupationLabel,
} from "../content/profile";
import { DISTRICTS, GENDER_IDENTITIES, INTENTS, LANGUAGES, ORIENTATIONS, label } from "../lib/constants";
import { romanceCompatible, romanceEligible, type RomanceSide } from "../domain/rules";
import type { View } from "./kit";
import { styleLines } from "../vibe/styles";

const L = (lang: "th" | "en", x: { th: string; en: string }) => (lang === "en" ? x.en : x.th);

export type CardPerson = {
  accountId: string;
  nickname: string;
  /** Already gated on showPronouns. */
  pronouns: string | null;
  district: string;
  languages: string[];
  interests: string[];
  intents: string[];
  newcomer: boolean;
  /** Legacy two-prompt answers (weekend, bkk_spot). */
  legacy: Record<string, string>;
  bio: Bio;
  deck: string[];
  /**
   * Opt-in dating details (showDatingPrefs), only filled when the viewer is
   * also open to dating. Null for everyone else.
   */
  dating?: DatingShown | null;
  /** Dating prompt ids to show (see datingPromptsShown); empty for everyone else. */
  datingDeck?: string[];
};

export type DatingShown = { orientation: string | null; openTo: string[] | "everyone" | null };

/** What a dating viewer may see of `target`'s dating preferences, or null. */
export function datingShown(
  target: { romanceOn: boolean; relationship: string; showDatingPrefs: boolean; orientation: string | null; romanceOpenTo: string[] | "everyone" | null },
  viewer: { romanceOn: boolean; relationship: string } | null | undefined,
): DatingShown | null {
  if (!viewer || !target.showDatingPrefs || !romanceEligible(target) || !romanceEligible(viewer)) return null;
  return { orientation: target.orientation, openTo: target.romanceOpenTo };
}

type DatingSide = RomanceSide & { accountId: string; relationship: string; romanceOn: boolean };

/**
 * Dating prompts follow the same rule as romantic choices after an event:
 * both open to something more and a fit for each other (or my own card).
 * Friends-only members never see them.
 */
export function datingPromptsShown(target: DatingSide, viewer: DatingSide | null | undefined): boolean {
  if (!viewer || !romanceEligible(target) || !romanceEligible(viewer)) return false;
  return target.accountId === viewer.accountId || romanceCompatible(target, viewer);
}

/** One answered dating prompt as a line ("🌇 My ideal first date in Bangkok is… a canal boat"), for the buddy deck. */
export function datingTeaser(bio: Bio, deck: string[], lang: "th" | "en"): string | null {
  for (const id of deck) {
    const q = promptById(id);
    const a = bio.answers?.[id];
    if (!q || !a) continue;
    if (q.kind === "text" && typeof a.value === "string" && a.value) return `${q.emoji} ${L(lang, q)} ${a.value}`;
    if (q.kind === "choice" && typeof a.value === "string") {
      const opt = q.options?.find((o) => o.value === a.value);
      if (opt) return `${q.emoji} ${L(lang, q)} ${opt.emoji} ${L(lang, opt)}`;
    }
  }
  return null;
}

/** "Open to women, non-binary people": plural and lower case in a sentence. */
const OPEN_TO_EN: Record<string, string> = { woman: "women", man: "men", "non-binary": "non-binary people" };

/** The dating details as chips, bilingual. */
export function datingChips(d: DatingShown, lang: "th" | "en"): string[] {
  const out: string[] = [];
  if (d.orientation) out.push(`🫶 ${label(ORIENTATIONS, d.orientation, lang)}`);
  if (d.openTo === "everyone") out.push(lang === "en" ? "💘 Open to everyone" : "💘 เปิดใจกับทุกคน");
  else if (Array.isArray(d.openTo) && d.openTo.length)
    out.push(`💘 ${lang === "en" ? "Open to" : "อยากเจอ"} ${d.openTo.map((g) => (lang === "en" ? OPEN_TO_EN[g] ?? label(GENDER_IDENTITIES, g, lang).toLowerCase() : label(GENDER_IDENTITIES, g, lang))).join(", ")}`);
  return out;
}

const LEGACY: Record<string, { th: string; en: string; emoji: string }> = {
  weekend: { th: "สุดสัปดาห์ในฝันที่กรุงเทพฯ ของฉันคือ…", en: "My perfect Bangkok weekend is…", emoji: "🧺" },
  bkk_spot: { th: "มุมโปรดในกรุงเทพฯ ของฉันคือ…", en: "My favourite Bangkok spot is…", emoji: "📍" },
};

export function ProfileCard(props: {
  v: View;
  person: CardPerson;
  /** Main photo URL, or null for the gradient initial. */
  photo: string | null;
  /** URL for a photo prompt's image. */
  promptPhoto: (promptId: string) => string;
  /** Badges row (resident, Bangkok Type). */
  badges?: Child;
  /** The viewer's interests, to highlight shared ones. Null on my own card. */
  viewerInterests?: string[] | null;
  /** The viewer's university key, to say "same university". */
  viewerUniversity?: string | null;
  /** Extra actions under the header (Edit button on my own card). On the compact card only one fits beside the name. */
  actions?: Child;
  /**
   * My own card: a nudge to fill in more (the Answer-prompts button). It gets
   * its own full-width row under the header, or, on a nearly empty card, sits
   * in the empty state at the bottom with one quiet line.
   */
  invite?: Child;
  /** Names of the regular tables they sit at, already filtered for this viewer (src/services/regular-tables.ts regularAt). */
  regularAt?: string[];
  /** My own card: a small avatar with the actions beside the name. */
  compact?: boolean;
}) {
  const { t, lang } = props.v;
  const p = props.person;
  const bio = p.bio;
  const shared = new Set(props.viewerInterests ?? []);
  // The quick-facts form asks spice, timing and years in Bangkok too. When both are answered they can disagree
  // (a spice slider at 0 beside a "Medium" pick), so the fact wins and the matching prompt is left out.
  const supersededBy: Record<string, unknown> = { spice: bio.spice, punctual: bio.punctual, bkk_years: bio.bkkTime };
  const answered: { q: Prompt; a: Answer }[] = [];
  for (const id of p.deck) {
    const q = promptById(id);
    const a = bio.answers?.[id];
    if (q && a && hasValue(a) && !supersededBy[id]) answered.push({ q, a });
  }
  const datingAnswered: { q: Prompt; a: Answer }[] = [];
  for (const id of p.datingDeck ?? []) {
    const q = promptById(id);
    const a = bio.answers?.[id];
    if (q && a && hasValue(a)) datingAnswered.push({ q, a });
  }
  // "How you date" from the quiz. bio only carries it when the viewer may see dating (cardPerson strips it otherwise).
  const dateStyle = (p.datingDeck ?? []).length ? styleLines("open-to-more", bio.dateStyle, lang) : [];
  const legacy = Object.entries(p.legacy ?? {}).filter(([k, val]) => LEGACY[k] && val);
  const cards: Child[] = [
    ...answered.map(({ q, a }) => <PromptCard v={props.v} q={q} a={a} photo={q.kind === "photo" && a.photoKey ? props.promptPhoto(q.id) : null} />),
    ...legacy.map(([k, val]) => <LegacyCard v={props.v} k={k} text={val} />),
  ];
  // The top 2 answers are the centrepiece, open; the rest fold under "More about".
  const [first, second] = cards;
  const restCards = cards.slice(2);

  const intents = p.intents.filter((i) => i !== "romance");
  const comm = (bio.comm ?? []).map((c) => COMM_STYLES.find((x) => x.value === c)).filter((x) => !!x);
  const interests = p.interests.map((i) => ({ value: i, o: interestOpt(i) }));
  const sharedFirst = [...interests.filter((x) => shared.has(x.value)), ...interests.filter((x) => !shared.has(x.value))];
  const sharedCount = interests.filter((x) => shared.has(x.value)).length;
  // Shared ones always show; the rest fill up to 6, and a "+N" opens the others (never a lone "+1").
  const chipsShown = sharedFirst.length <= INTERESTS_SHOWN + 1 ? sharedFirst.length : Math.max(INTERESTS_SHOWN, sharedCount);

  // The glance strip: one line of up to 6 emoji facts, labels for screen readers only.
  const learningPrompt = answered.some(({ q }) => q.id === "learning_now");
  const occupation = occupationLabel(bio, lang);
  const education = educationLabel(bio, lang);
  const time = BKK_TIME.find((x) => x.value === bio.bkkTime);
  const story = BKK_STORY.find((x) => x.value === bio.story);
  // "Lives in Bangkok" is the default; the others are worth knowing at a table.
  const res = RESIDENCY.find((x) => x.value === bio.residency && x.value !== "lives");
  const energy = ENERGY.find((x) => x.value === bio.energy);
  const weekend = WEEKEND_RHYTHM.find((x) => x.value === bio.weekend);
  const learnLangs = (bio.learningLangs ?? []).map((l) => label(LANGUAGES, l, lang));
  // Learning shows once: the prompt if answered, else one glance item (languages, or the short answer).
  const learning: Row | null = learningPrompt
    ? null
    : learnLangs.length
      ? { e: "🔤", k: t("กำลังหัดภาษา", "Learning"), v: t(`หัดภาษา${learnLangs.join(" ")}`, `Learning ${learnLangs.join(", ")}`) }
      : bio.learning
        ? { e: "📚", k: t("กำลังเรียนรู้", "Currently learning"), v: bio.learning }
        : null;
  const work: Row | null = occupation
    ? { e: occupation.emoji, k: t("อาชีพ", "Work"), v: occupation.text }
    : education
      ? { e: education.emoji, k: t("การศึกษา", "Education"), v: education.text }
      : null;
  const priority: (Row | null)[] = [
    work,
    bio.hometown ? { e: "🏡", k: t("บ้านเกิด", "Originally from"), v: bio.hometown } : null,
    time ? { e: "⏳", k: t("อยู่กรุงเทพฯ มา", "Time in Bangkok"), v: time.value === "always" ? t("อยู่กรุงเทพฯ ทั้งชีวิต", "Bangkok all my life") : t(`อยู่กรุงเทพฯ ${time.th}`, `${time.en} in Bangkok`) } : null,
    p.languages.length ? { e: "🗣️", k: t("พูดภาษา", "Speaks"), v: p.languages.map((l) => label(LANGUAGES, l, lang)).join(", ") } : null,
    learning,
    energy ? { e: energy.emoji, k: t("ตอนเจอกันครั้งแรก", "First-meet energy"), v: L(lang, energy) } : null,
  ];
  // Fewer than 6? Fill from the next most telling facts; what doesn't fit folds under "More about".
  const spare: (Row | null)[] = [
    story ? { e: story.emoji, k: t("กรุงเทพฯ ของฉัน", "My Bangkok"), v: L(lang, story) } : null,
    res ? { e: res.emoji, k: t("ตอนนี้", "Right now"), v: L(lang, res) } : null,
    occupation && education ? { e: education.emoji, k: t("การศึกษา", "Education"), v: education.text } : null,
  ];
  const glance = priority.filter((x): x is Row => !!x);
  const spareRows = spare.filter((x): x is Row => !!x);
  while (glance.length < GLANCE_MAX && spareRows.length) glance.push(spareRows.shift()!);
  // Leftover Bangkok facts, with a short label where the value can't stand alone.
  const moreRows: Row[] = [
    ...spareRows.map((r) => ({ ...r, show: true })),
    ...reflectionFacts(bio.reflections, lang, t).map(([e, k, val]) => ({ e, k, v: val, show: true })),
    ...(bio.guide ? [{ e: "🧭", k: t("คนมาใหม่", "Newcomers"), v: t("ยินดีช่วยคนที่เพิ่งมากรุงเทพฯ ถามได้เลย", "Happy to help people new to Bangkok. Ask away!") }] : []),
  ];

  // Meeting up: compact emoji rows; a short label shows only where the value is unclear on its own.
  const many = (list: typeof PAY_METHODS, vals?: string[]) => (vals ?? []).map((v) => list.find((x) => x.value === v)).filter((x) => !!x).map((x) => L(lang, x!)).join(", ");
  const one = (list: typeof PAY_METHODS, v?: string) => list.find((x) => x.value === v);
  const meet: Row[] = [];
  if (weekend) meet.push({ e: weekend.emoji, k: t("สไตล์วันหยุด", "Weekend rhythm"), v: L(lang, weekend) });
  if (bio.pay?.length) meet.push({ e: "💳", k: t("จ่ายด้วย", "Pays with"), v: many(PAY_METHODS, bio.pay) });
  const bill = one(BILL_STYLE, bio.bill);
  if (bill) meet.push({ e: bill.emoji, k: t("เวลาเช็กบิล", "Bill style"), v: L(lang, bill) });
  if (bio.travel?.length) meet.push({ e: "🚇", k: t("เดินทางด้วย", "Gets around by"), v: many(GETTING_AROUND, bio.travel) });
  if (bio.diet?.length) meet.push({ e: "🍽️", k: t("เรื่องอาหาร", "Food needs"), v: many(DIET, bio.diet) });
  const spice = one(SPICE, bio.spice);
  if (spice) meet.push({ e: spice.emoji, k: t("ความเผ็ด", "Spice"), v: L(lang, spice), show: true });
  const pets = one(PETS, bio.pets);
  if (pets) meet.push({ e: pets.emoji, k: t("สัตว์เลี้ยง", "Pets"), v: L(lang, pets), show: true });
  const punctual = one(PUNCTUAL, bio.punctual);
  if (punctual) meet.push({ e: punctual.emoji, k: t("เวลานัด", "Timing"), v: L(lang, punctual) });

  const tables = props.regularAt ?? [];
  const sections = [intents.length || meet.length || tables.length, comm.length, interests.length].filter(Boolean).length;
  // Nearly empty: no prompt answers and at most one section. The invite becomes the empty state.
  const sparse = !cards.length && !datingAnswered.length && sections < 2;
  const datingChipList = p.dating ? datingChips(p.dating, lang) : [];

  return (
    <article class="pc">
      <style dangerouslySetInnerHTML={{ __html: PROFILE_CSS }} />
      <header class={props.compact ? "pc-hero pc-compact" : "pc-hero"}>
        {props.photo ? (
          <img class="pc-photo" src={props.photo} alt={t(`รูปของ ${p.nickname}`, `${p.nickname}'s photo`)} />
        ) : (
          <div class="pc-photo pc-initial" aria-hidden="true">
            <span>{[...p.nickname][0]?.toUpperCase() ?? "?"}</span>
          </div>
        )}
        <div class="pc-id">
          <h1>
            {p.nickname}
            {p.pronouns ? <small class="pc-pronouns"> {p.pronouns}</small> : null}
          </h1>
          <p class="pc-where">
            <span class="pc-place">📍 {label(DISTRICTS, p.district, lang)}</span>
            {p.newcomer ? <span class="pc-chip pc-new">🌱 {t("มาใหม่ในกรุงเทพฯ", "New to Bangkok")}</span> : null}
          </p>
          {props.badges ? <div class="pc-badges">{props.badges}</div> : null}
        </div>
        {props.compact && props.actions ? <div class="pc-actions">{props.actions}</div> : null}
      </header>

      {glance.length ? (
        <ul class="pc-glance" aria-label={t("ข้อมูลโดยย่อ", "At a glance")}>
          {glance.slice(0, GLANCE_MAX).map((r) => (
            <li>
              <span aria-hidden="true">{r.e}</span> <span class="sr-only">{r.k}: </span>
              {r.v}
            </li>
          ))}
        </ul>
      ) : null}

      {props.invite && !sparse ? <div class="pc-invite">{props.invite}</div> : null}
      {props.actions && !props.compact ? <div class="pc-actions">{props.actions}</div> : null}

      {first ?? null}

      {intents.length ? (
        <section class="pc-sec" id="pc-about">
          <h2>{t("มาที่นี่เพื่อ", "Here for")}</h2>
          <div class="pc-chips">
            {intents.map((i) => (
              <span class="pc-chip pc-brand">{label(INTENTS, i, lang)}</span>
            ))}
          </div>
        </section>
      ) : null}

      {meet.length ? (
        <Fold title={t("เวลาเจอกัน", "Meeting up")}>
          <Rows rows={meet} />
        </Fold>
      ) : null}

      {tables.length ? (
        <Fold title={t(`ขาประจำ ${tables.length} โต๊ะ`, `Regular at ${tables.length} ${tables.length === 1 ? "table" : "tables"}`)} emoji="🪑">
          <div class="pc-chips">
            {tables.map((name) => (
              <span class="pc-chip">{name}</span>
            ))}
          </div>
        </Fold>
      ) : null}

      {/* 💘 below the friendship facts, saying who can see it (owner card). Folded, with a love-red line. */}
      {datingChipList.length || datingAnswered.length || dateStyle.length ? (
        <Fold cls="pc-dating" title={t("เปิดใจมากกว่าเพื่อน", "Open to something more")} emoji="💘">
          <p class="pc-lock">🔒 {t("เห็นได้เฉพาะคนที่เปิดใจเรื่องเดตเหมือนกัน", "Only people who also opted in to dating see this")}</p>
          {datingChipList.length ? (
            <div class="pc-chips">
              {datingChipList.map((x) => (
                <span class="pc-chip">{x}</span>
              ))}
            </div>
          ) : null}
          {dateStyle.length ? (
            <div class="pc-datestyle">
              <h3>{t("สไตล์การเดตของฉัน", "How I date")}</h3>
              <Rows rows={dateStyle.map((x) => ({ e: x.emoji, k: x.title, v: x.label, show: true }))} />
            </div>
          ) : null}
          {datingAnswered.map(({ q, a }) => (
            <PromptCard v={props.v} q={q} a={a} photo={null} />
          ))}
        </Fold>
      ) : null}

      {second ?? null}

      {comm.length ? (
        <Fold title={t("สไตล์การสื่อสาร", "How I keep in touch")}>
          <div class="pc-chips">
            {comm.map((c) => (
              <span class="pc-chip">
                <span aria-hidden="true">{c!.emoji}</span> {L(lang, c!)}
              </span>
            ))}
          </div>
        </Fold>
      ) : null}

      {interests.length ? (
        <section class="pc-sec" id="pc-interests">
          <h2>{t("ความสนใจ", "Interests")}</h2>
          {props.viewerInterests && sharedCount ? <p class="muted pc-shared-note">✨ {t(`ชอบเหมือนกัน ${sharedCount} อย่าง`, `${sharedCount} in common`)}</p> : null}
          {props.viewerUniversity && universityKey(bio) === props.viewerUniversity ? <p class="muted pc-shared-note">🎓 {t("มหาวิทยาลัยเดียวกับคุณ", "Same university as you")}</p> : null}
          <div class="pc-chips">{sharedFirst.slice(0, chipsShown).map((x) => <InterestChip x={x} shared={shared.has(x.value)} lang={lang} />)}</div>
          {sharedFirst.length > chipsShown ? (
            <details class="pc-more-chips">
              <summary>
                +{sharedFirst.length - chipsShown}
                <span class="sr-only"> {t("ความสนใจอื่น", "more interests")}</span>
              </summary>
              <div class="pc-chips">{sharedFirst.slice(chipsShown).map((x) => <InterestChip x={x} shared={shared.has(x.value)} lang={lang} />)}</div>
            </details>
          ) : null}
        </section>
      ) : null}

      {restCards.length || moreRows.length ? (
        <Fold cls="pc-more" title={t(`ข้อมูลเพิ่มเติมของ ${p.nickname}`, `More about ${p.nickname}`)}>
          {moreRows.length ? <Rows rows={moreRows} /> : null}
          {restCards}
        </Fold>
      ) : null}

      {props.invite && sparse ? (
        <section class="pc-sec pc-empty">
          <p class="muted">{t("โปรไฟล์ยังโล่งอยู่ ตอบคำถามสั้น ๆ สักสองสามข้อ ให้คนที่เจอได้รู้จักคุณมากขึ้น", "Your profile is still quiet. A few short prompts help the people you meet get to know you.")}</p>
          {props.invite}
        </section>
      ) : null}
    </article>
  );
}

/** At most this many facts in the glance strip, and interests before the "+N". */
const GLANCE_MAX = 6;
const INTERESTS_SHOWN = 6;

/** One fact: emoji, its label (spoken, and shown when `show`), and the value. */
type Row = { e: string; k: string; v: string; show?: boolean };

/** Compact emoji rows with no boxes; the label is visually hidden unless the value needs it. */
function Rows(props: { rows: Row[] }) {
  return (
    <ul class="pc-rows">
      {props.rows.map((r) => (
        <li>
          <span aria-hidden="true">{r.e}</span>
          <span>
            {r.show ? <span class="pc-k">{r.k}</span> : <span class="sr-only">{r.k}</span>}
            <span class={r.show ? "pc-sep" : "sr-only"}>: </span>
            {r.v}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A section below the top, folded: a native details/summary (no script), the
 * heading as a 44px summary row with a chevron, closed until opened.
 */
export function Fold(props: { title: string; emoji?: string; cls?: string; children: Child }) {
  return (
    <details class={props.cls ? `pc-fold ${props.cls}` : "pc-fold"}>
      <summary>
        <h2 class="pc-fold-h">
          {props.emoji ? <span aria-hidden="true">{props.emoji} </span> : null}
          {props.title}
        </h2>
      </summary>
      <div class="pc-fold-body">{props.children}</div>
    </details>
  );
}

function InterestChip(props: { x: { value: string; o: ReturnType<typeof interestOpt> }; shared: boolean; lang: "th" | "en" }) {
  const { x, shared } = props;
  return (
    <span class={`pc-chip ${shared ? "pc-shared" : ""}`}>
      {shared ? "✨ " : x.o ? `${x.o.emoji} ` : ""}
      {x.o ? L(props.lang, x.o) : x.value}
    </span>
  );
}

function hasValue(a: Answer): boolean {
  if (a.kind === "photo") return !!a.photoKey;
  if (Array.isArray(a.value)) return a.value.length > 0;
  return a.value !== "" && a.value !== null && a.value !== undefined;
}

function LegacyCard(props: { v: View; k: string; text: string }) {
  const q = LEGACY[props.k];
  return (
    <section class="pc-card pc-text">
      <p class="pc-q">
        <span aria-hidden="true">{q.emoji}</span> {L(props.v.lang, q)}
      </p>
      <p class="pc-a">{props.text}</p>
    </section>
  );
}

export function PromptCard(props: { v: View; q: Prompt; a: Answer; photo: string | null }) {
  const { lang } = props.v;
  const { q, a } = props;
  const opt = (value: string) => q.options?.find((o) => o.value === value);
  let body: Child = null;
  switch (q.kind) {
    case "text":
      body = <p class="pc-a">{String(a.value)}</p>;
      break;
    case "slider": {
      const n = Number(a.value);
      const min = q.min ?? 0;
      const max = q.max ?? 10;
      const pct = Math.max(0, Math.min(100, ((n - min) / (max - min || 1)) * 100));
      body = (
        <div class="pc-slider">
          <div class="pc-track" role="img" aria-label={`${n} / ${max}`}>
            <i style={`width:${pct.toFixed(1)}%`} />
            <b style={`left:${pct.toFixed(1)}%`}>{n}</b>
          </div>
          <div class="pc-ends">
            <small>{L(lang, q.ends![0])}</small>
            <small>{L(lang, q.ends![1])}</small>
          </div>
        </div>
      );
      break;
    }
    case "scale": {
      const n = Number(a.value);
      body = (
        <div class="pc-scale">
          <div class="pc-dots" role="img" aria-label={`${n} / 5`}>
            {[1, 2, 3, 4, 5].map((i) => (
              <i class={i <= n ? "on" : ""} />
            ))}
          </div>
          <div class="pc-ends">
            <small>{L(lang, q.ends![0])}</small>
            <small>{L(lang, q.ends![1])}</small>
          </div>
        </div>
      );
      break;
    }
    case "choice": {
      const o = opt(String(a.value));
      body = o ? (
        <p class="pc-pick">
          <b aria-hidden="true">{o.emoji}</b>
          <span>{L(lang, o)}</span>
        </p>
      ) : null;
      break;
    }
    case "emoji": {
      const vals = Array.isArray(a.value) ? a.value : [String(a.value)];
      body = <p class="pc-emoji">{vals.join(" ")}</p>;
      break;
    }
    case "multi": {
      const vals = Array.isArray(a.value) ? a.value : [];
      body = (
        <div class="pc-chips">
          {vals.map((v) => {
            const o = opt(v);
            return o ? (
              <span class="pc-chip pc-brand">
                {o.emoji} {L(lang, o)}
              </span>
            ) : null;
          })}
        </div>
      );
      break;
    }
    case "rank": {
      const vals = Array.isArray(a.value) ? a.value : [];
      body = (
        <ol class="pc-rank">
          {vals.map((v) => {
            const o = opt(v);
            return o ? (
              <li>
                <span aria-hidden="true">{o.emoji}</span> {L(lang, o)}
              </li>
            ) : null;
          })}
        </ol>
      );
      break;
    }
    case "photo":
      body = (
        <figure class="pc-fig">
          {props.photo ? <img src={props.photo} alt={L(lang, q)} loading="lazy" /> : null}
          {a.value ? <figcaption>{String(a.value)}</figcaption> : null}
        </figure>
      );
      break;
  }
  return (
    <section class={`pc-card pc-${q.kind}`}>
      <p class="pc-q">
        <span aria-hidden="true">{q.emoji}</span> {L(lang, q)}
      </p>
      {body}
    </section>
  );
}

export const PROFILE_CSS = `
.pc{display:flex;flex-direction:column;gap:24px;margin:8px 0 40px}
.pc h2{font-size:.82rem;text-transform:none;letter-spacing:0;color:var(--ink-2);margin:0 0 12px;font-weight:700}
.pc-hero{display:flex;flex-direction:column;gap:18px}
.pc-photo{width:100%;aspect-ratio:4/5;max-height:440px;object-fit:cover;border-radius:28px;display:block}
.pc-initial{display:grid;place-items:center;background:var(--hero);aspect-ratio:16/11}
.pc-initial span{font-size:5rem;font-weight:700;color:#fff;letter-spacing:-.04em;text-shadow:0 4px 24px rgba(0,0,0,.15)}
.pc-id h1{font-size:2rem;margin:0;letter-spacing:-.03em;line-height:1.15}
.pc-pronouns{font-size:1rem;font-weight:500;color:var(--ink-3)}
.pc-where{margin:8px 0 0;color:var(--ink-2);display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}
.pc-badges{margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
/* Open sections (owner, 2026-10-16): straight on the page, a thin line above each; the 💘 one keeps a love-red line. */
.pc-dating{border-top:1px solid color-mix(in srgb,var(--love) 45%,var(--line))}
.pc-lock{margin:-4px 0 10px;font-size:.86rem;color:var(--love-ink)}
.pc-q span[aria-hidden]{margin-right:6px}
.pc-actions{display:flex;gap:10px;flex-wrap:wrap}
.pc-sec{padding:24px 0 0;border-top:1px solid var(--line)}
.pc-chips{display:flex;flex-wrap:wrap;gap:8px}
.pc-chip{display:inline-flex;align-items:center;gap:4px;padding:7px 13px;border-radius:999px;background:var(--surface-2);color:var(--ink-2);font-size:.9rem;line-height:1.2}
.pc-brand{background:var(--brand-soft);color:var(--brand);font-weight:600}
.pc-new{background:var(--brand-soft);color:var(--brand);padding:3px 10px;font-size:.8rem}
.pc-shared{background:var(--brand);color:var(--brand-ink);font-weight:600}
.pc-shared-note{margin:-4px 0 12px}
.pc-card{padding:24px 0 0;border-top:1px solid var(--line)}
.pc-q{margin:0 0 12px;font-size:.92rem;font-weight:600;color:var(--ink-2)}
.pc-a{margin:0;font-size:1.35rem;line-height:1.4;font-weight:600;letter-spacing:-.01em;color:var(--ink)}
.pc-pick{display:flex;align-items:center;gap:14px;margin:0}
.pc-pick b{font-size:2.6rem;font-weight:400;line-height:1}
.pc-pick span{font-size:1.4rem;font-weight:700}
p.pc-emoji{font-size:3rem;margin:0;letter-spacing:.12em;line-height:1.2}
/* The 36px knob is centred on the value, so the track leaves 18px each side for it now the section has no padding. */
.pc-track{position:relative;height:12px;border-radius:999px;background:var(--surface-2);margin:24px 18px 12px}
.pc-track i{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:linear-gradient(90deg,var(--fresh),var(--brand))}
.pc-track b{position:absolute;top:50%;transform:translate(-50%,-50%);min-width:36px;height:36px;padding:0 6px;border-radius:999px;background:var(--surface);border:3px solid var(--brand);display:grid;place-items:center;font-size:.9rem;color:var(--brand)}
.pc-ends{display:flex;justify-content:space-between;gap:12px}
.pc-dots{display:flex;gap:10px;margin:6px 0 10px}
.pc-dots i{width:26px;height:26px;border-radius:50%;background:var(--surface-2);border:2px solid var(--line)}
.pc-dots i.on{background:var(--brand);border-color:var(--brand)}
.pc-rank{margin:0;padding-left:0;list-style:none;counter-reset:r;display:grid;gap:10px}
.pc-rank li{counter-increment:r;display:flex;align-items:center;gap:10px;font-weight:600;font-size:1.05rem}
.pc-rank li::before{content:counter(r);display:inline-grid;place-items:center;width:30px;height:30px;border-radius:10px;background:var(--brand-soft);color:var(--brand);font-size:.9rem}
.pc-fig{margin:0}
.pc-fig img{width:100%;max-height:420px;object-fit:cover;border-radius:18px;display:block}
.pc-fig figcaption{margin-top:10px;color:var(--ink-2)}
@media (min-width:700px){.pc-hero{flex-direction:row;align-items:flex-end}.pc-hero .pc-photo{width:300px;flex:none}}
/* My own card (owner card E): a small avatar beside the name, Edit on the same row. */
.pc-compact{flex-direction:row;flex-wrap:wrap;align-items:center;gap:12px 14px}
.pc-compact .pc-photo{width:72px;height:72px;aspect-ratio:1;max-height:none;border-radius:20px;flex:none;box-shadow:none}
.pc-compact .pc-initial span{font-size:2rem}
.pc-compact .pc-id{flex:1;min-width:0}
.pc-compact .pc-id h1{font-size:1.6rem}
.pc-compact .pc-where{margin-top:2px;gap:4px 8px}
.pc-place,.pc-new{white-space:nowrap}
.pc-compact .pc-actions{flex:none;flex-direction:column;align-items:flex-end;gap:6px}
.pc-compact .pc-actions .btn{padding-inline:14px}
@media (max-width:359.98px){.pc-compact .pc-actions{flex-basis:100%;align-items:flex-start}}
@media (min-width:700px){.pc-hero.pc-compact{align-items:center}.pc-hero.pc-compact .pc-photo{width:72px}.pc-compact .pc-actions{flex-direction:row}}
`;
