/**
 * The profile card ("bio"): what another member sees at /people/:id and what
 * I preview at /me/profile. Big photo, name, district, badges, quick facts,
 * chips, and prompt answers interleaved between the sections, each styled by
 * its kind.
 *
 * Privacy: this component only ever receives display-safe fields. It never
 * gets age, birth date, username, relationship status, romance settings,
 * gender identity or age preferences, and "romance" is filtered out of the
 * "Here for" chips so romance mode is never revealed.
 */
import type { Child } from "hono/jsx";
import {
  COMM_STYLES,
  ENERGY,
  interestOpt,
  promptById,
  WEEKEND_RHYTHM,
  type Answer,
  type Bio,
  type Prompt,
  BKK_STORY,
  BKK_TIME,
  educationLabel,
  universityKey,
  occupationLabel,
} from "../content/profile";
import { DISTRICTS, INTENTS, LANGUAGES, label } from "../lib/constants";
import type { View } from "./kit";

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
};

const LEGACY: Record<string, { th: string; en: string; emoji: string }> = {
  weekend: { th: "วันหยุดที่สมบูรณ์แบบของฉันคือ…", en: "My perfect Bangkok weekend is…", emoji: "🧺" },
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
  /** Extra actions under the header (Edit button on my own card). */
  actions?: Child;
}) {
  const { t, lang } = props.v;
  const p = props.person;
  const bio = p.bio;
  const shared = new Set(props.viewerInterests ?? []);
  const answered: { q: Prompt; a: Answer }[] = [];
  for (const id of p.deck) {
    const q = promptById(id);
    const a = bio.answers?.[id];
    if (q && a && hasValue(a)) answered.push({ q, a });
  }
  const legacy = Object.entries(p.legacy ?? {}).filter(([k, val]) => LEGACY[k] && val);
  const cards: Child[] = [
    ...answered.map(({ q, a }) => <PromptCard v={props.v} q={q} a={a} photo={q.kind === "photo" && a.photoKey ? props.promptPhoto(q.id) : null} />),
    ...legacy.map(([k, val]) => <LegacyCard v={props.v} k={k} text={val} />),
  ];
  let next = 0;
  const slot = () => (next < cards.length ? cards[next++] : null);

  const intents = p.intents.filter((i) => i !== "romance");
  const comm = (bio.comm ?? []).map((c) => COMM_STYLES.find((x) => x.value === c)).filter((x) => !!x);
  const interests = p.interests.map((i) => ({ value: i, o: interestOpt(i) }));
  const sharedFirst = [...interests.filter((x) => shared.has(x.value)), ...interests.filter((x) => !shared.has(x.value))];
  const sharedCount = interests.filter((x) => shared.has(x.value)).length;
  const energy = ENERGY.find((x) => x.value === bio.energy);
  const weekend = WEEKEND_RHYTHM.find((x) => x.value === bio.weekend);
  const facts: [string, string, string][] = [];
  const story = BKK_STORY.find((x) => x.value === bio.story);
  const time = BKK_TIME.find((x) => x.value === bio.bkkTime);
  if (story || time) {
    const parts = [story ? L(lang, story) : "", time && time.value !== "always" ? t(`อยู่มา ${L(lang, time)}`, `here ${L(lang, time).toLowerCase()}`) : time ? L(lang, time) : ""].filter(Boolean);
    facts.push([story?.emoji ?? time!.emoji, t("กรุงเทพฯ ของฉัน", "My Bangkok"), parts.join(" · ")]);
  }
  if (bio.hometown) facts.push(["📍", t("บ้านเกิด", "Originally from"), bio.hometown]);
  if (bio.guide) facts.push(["🧭", t("คนมาใหม่", "Newcomers"), t("ยินดีช่วยคนที่เพิ่งมากรุงเทพฯ ถามได้เลย", "Happy to help people new to Bangkok. Ask away!")]);
  const occupation = occupationLabel(bio, lang);
  if (occupation) facts.push([occupation.emoji, t("อาชีพ", "Work"), occupation.text]);
  const education = educationLabel(bio, lang);
  if (education) facts.push([education.emoji, t("การศึกษา", "Education"), education.text]);
  if (energy) facts.push([energy.emoji, t("ตอนเจอกันครั้งแรก", "First-meet energy"), L(lang, energy)]);
  if (weekend) facts.push([weekend.emoji, t("จังหวะวันหยุด", "Weekend rhythm"), L(lang, weekend)]);
  if (p.languages.length) facts.push(["🗣️", t("คุยได้", "Speaks"), p.languages.map((l) => label(LANGUAGES, l, lang)).join(", ")]);
  if (bio.learningLangs?.length) facts.push(["🔤", t("กำลังหัดภาษา", "Learning"), bio.learningLangs.map((l) => label(LANGUAGES, l, lang)).join(", ")]);

  return (
    <article class="pc">
      <style dangerouslySetInnerHTML={{ __html: PROFILE_CSS }} />
      <header class="pc-hero">
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
            📍 {label(DISTRICTS, p.district, lang)}
            {p.newcomer ? <span class="pc-chip pc-new">🌱 {t("มาใหม่ในกรุงเทพฯ", "New to Bangkok")}</span> : null}
          </p>
          {props.badges ? <div class="pc-badges">{props.badges}</div> : null}
        </div>
      </header>

      {bio.learning ? (
        <section class="pc-lines">
          {bio.learning ? (
            <p>
              <span aria-hidden="true">📚</span> {t("กำลังเรียนรู้", "Currently learning")}: {bio.learning}
            </p>
          ) : null}
        </section>
      ) : null}
      {props.actions ? <div class="pc-actions">{props.actions}</div> : null}

      {slot()}

      {intents.length || facts.length ? (
        <section class="pc-sec">
          {intents.length ? (
            <>
              <h2>{t("มาที่นี่เพื่อ", "Here for")}</h2>
              <div class="pc-chips">
                {intents.map((i) => (
                  <span class="pc-chip pc-brand">{label(INTENTS, i, lang)}</span>
                ))}
              </div>
            </>
          ) : null}
          {facts.length ? (
            <dl class="pc-facts">
              {facts.map(([e, k, val]) => (
                <div>
                  <dt>
                    <span aria-hidden="true">{e}</span> {k}
                  </dt>
                  <dd>{val}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </section>
      ) : null}

      {slot()}

      {comm.length ? (
        <section class="pc-sec">
          <h2>{t("สไตล์การสื่อสาร", "How I keep in touch")}</h2>
          <div class="pc-comm">
            {comm.map((c) => (
              <div class="pc-comm-item">
                <b aria-hidden="true">{c!.emoji}</b>
                <span>
                  <strong>{L(lang, c!)}</strong>
                  <small>{L(lang, c!.blurb)}</small>
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {slot()}

      {interests.length ? (
        <section class="pc-sec">
          <h2>{t("ความสนใจ", "Interests")}</h2>
          {props.viewerInterests && sharedCount ? <p class="muted pc-shared-note">✨ {t(`ชอบเหมือนกัน ${sharedCount} อย่าง`, `${sharedCount} in common`)}</p> : null}
          {props.viewerUniversity && universityKey(bio) === props.viewerUniversity ? <p class="muted pc-shared-note">🎓 {t("มหาวิทยาลัยเดียวกับคุณ", "Same university as you")}</p> : null}
          <div class="pc-chips">
            {sharedFirst.map((x) => (
              <span class={`pc-chip ${shared.has(x.value) ? "pc-shared" : ""}`}>
                {shared.has(x.value) ? "✨ " : x.o ? `${x.o.emoji} ` : ""}
                {x.o ? L(lang, x.o) : x.value}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {cards.slice(next)}
    </article>
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
.pc{display:flex;flex-direction:column;gap:22px;margin:8px 0 40px}
.pc h2{font-size:.82rem;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-3);margin:0 0 12px;font-weight:600}
.pc-hero{display:flex;flex-direction:column;gap:18px}
.pc-photo{width:100%;aspect-ratio:4/5;max-height:440px;object-fit:cover;border-radius:28px;box-shadow:var(--shadow);display:block}
.pc-initial{display:grid;place-items:center;background:var(--hero);aspect-ratio:16/11}
.pc-initial span{font-size:5rem;font-weight:700;color:#fff;letter-spacing:-.04em;text-shadow:0 4px 24px rgba(0,0,0,.15)}
.pc-id h1{font-size:2rem;margin:0;letter-spacing:-.03em;line-height:1.15}
.pc-pronouns{font-size:1rem;font-weight:500;color:var(--ink-3)}
.pc-where{margin:8px 0 0;color:var(--ink-2);display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}
.pc-badges{margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.pc-badges .type-spark small{margin-top:6px}
.pc-lines{display:grid;gap:10px}
.pc-lines span[aria-hidden],.pc-q span[aria-hidden],.pc-facts dt span[aria-hidden]{margin-right:6px}
.pc-lines p{margin:0;font-size:1.05rem;color:var(--ink);line-height:1.5}
.pc-actions{display:flex;gap:10px;flex-wrap:wrap}
.pc-sec{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:22px;box-shadow:var(--shadow)}
.pc-chips{display:flex;flex-wrap:wrap;gap:8px}
.pc-chip{display:inline-flex;align-items:center;gap:4px;padding:7px 13px;border-radius:999px;background:var(--surface-2);color:var(--ink-2);font-size:.9rem;line-height:1.2}
.pc-brand{background:var(--brand-soft);color:var(--brand);font-weight:600}
.pc-new{background:var(--brand-soft);color:var(--brand);padding:3px 10px;font-size:.8rem}
.pc-shared{background:var(--brand);color:var(--brand-ink);font-weight:600}
.pc-shared-note{margin:-4px 0 12px}
.pc-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px;margin:20px 0 0}
.pc-facts:first-child{margin-top:0}
.pc-facts dt{font-size:.8rem;color:var(--ink-3)}
.pc-facts dd{margin:4px 0 0;font-weight:600}
.pc-comm{display:grid;gap:12px}
.pc-comm-item{display:flex;gap:14px;align-items:center}
.pc-comm-item b{display:inline-grid;place-items:center;width:44px;height:44px;border-radius:14px;background:var(--brand-soft);font-size:1.35rem;font-weight:400;flex:none}
.pc-comm-item span{display:flex;flex-direction:column}
.pc-comm-item small{color:var(--ink-3)}
.pc-card{background:var(--surface);border:1px solid var(--line);border-radius:24px;padding:24px 22px;box-shadow:var(--shadow);position:relative;overflow:hidden}
.pc-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;background:linear-gradient(var(--brand),var(--fresh))}
.pc-q{margin:0 0 12px;font-size:.92rem;font-weight:600;color:var(--ink-2)}
.pc-a{margin:0;font-size:1.35rem;line-height:1.4;font-weight:600;letter-spacing:-.01em;color:var(--ink)}
.pc-pick{display:flex;align-items:center;gap:14px;margin:0}
.pc-pick b{font-size:2.6rem;font-weight:400;line-height:1}
.pc-pick span{font-size:1.4rem;font-weight:700}
.pc-emoji{font-size:3rem;margin:0;letter-spacing:.12em;line-height:1.2}
.pc-track{position:relative;height:12px;border-radius:999px;background:var(--surface-2);margin:22px 0 10px}
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
`;
