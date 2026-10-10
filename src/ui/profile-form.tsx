/**
 * Form pieces for the richer profile, shared by /settings/profile and the
 * onboarding "you" step: the grouped, searchable interest picker, the
 * communication-style picker and one input per prompt kind.
 *
 * Works without JS (plain checkboxes, radios, selects). The small inline
 * script adds: interest search, live counters, pick limits and slider values.
 */
import type { Child } from "hono/jsx";
import {
  CAPTION_MAX,
  COMM_STYLES,
  INTEREST_GROUPS,
  MAX_COMM,
  MAX_INTERESTS,
  OCCUPATION_OTHER_MAX,
  OCCUPATIONS,
  TEXT_MAX,
  type Answer,
  type Opt,
  type Prompt,
} from "../content/profile";
import type { View } from "./kit";

const L = (lang: "th" | "en", x: { th: string; en: string }) => (lang === "en" ? x.en : x.th);

/** Pill checkbox/radio with an emoji. */
function EmojiPill(props: { name: string; o: Opt; lang: "th" | "en"; checked?: boolean; type?: "checkbox" | "radio"; big?: boolean; q?: string }) {
  const { o } = props;
  const text = o.emoji === o.en ? "" : L(props.lang, o);
  return (
    <label class={`pill ${props.big ? "pf-big" : ""} ${props.q !== undefined ? "ip-chip" : ""}`} data-q={props.q}>
      <input type={props.type ?? "checkbox"} name={props.name} value={o.value} checked={props.checked} />
      <span>
        <b aria-hidden={text ? "true" : undefined}>{o.emoji}</b>
        {text ? ` ${text}` : null}
      </span>
    </label>
  );
}

/** Interests by group, with search and a cap of MAX_INTERESTS. */
export function InterestPicker(props: { v: View; values?: string[]; name?: string }) {
  const { t, lang } = props.v;
  const selected = new Set(props.values ?? []);
  const name = props.name ?? "interests";
  return (
    <div class="ip" data-limit={String(MAX_INTERESTS)}>
      <div class="ip-tools">
        <input type="search" class="ip-search" placeholder={t("ค้นหา เช่น กาแฟ วิ่ง แมว", "Search, e.g. coffee, running, cats")} aria-label={t("ค้นหาความสนใจ", "Search interests")} autocomplete="off" />
        <span class="ip-count" aria-live="polite">
          <b>{selected.size}</b>/{MAX_INTERESTS}
        </span>
      </div>
      <p class="pf-limit" role="status" hidden>
        {t(`เลือกได้ไม่เกิน ${MAX_INTERESTS} อย่าง`, `Up to ${MAX_INTERESTS} interests`)}
      </p>
      {INTEREST_GROUPS.map((g, i) => {
        const picked = g.items.filter((x) => selected.has(x.value)).length;
        return (
          <details class="ip-group" open={picked > 0 || i < 2}>
            <summary>
              <span aria-hidden="true">{g.emoji}</span> {L(lang, g)}
              {picked ? <small class="ip-picked">{picked}</small> : null}
            </summary>
            <div class="pills">
              {g.items.map((x) => (
                <EmojiPill name={name} o={x} lang={lang} checked={selected.has(x.value)} q={`${x.th} ${x.en} ${g.th} ${g.en}`.toLowerCase()} />
              ))}
            </div>
          </details>
        );
      })}
      <p class="ip-none muted" hidden>
        {t("ไม่พบ ลองคำอื่นดู", "Nothing found. Try another word.")}
      </p>
    </div>
  );
}

/** Communication styles, up to MAX_COMM. */
export function CommPicker(props: { v: View; values?: string[] }) {
  const { lang } = props.v;
  const selected = new Set(props.values ?? []);
  return (
    <div class="pf-comm" data-limit={String(MAX_COMM)}>
      {COMM_STYLES.map((c) => (
        <label class="pf-card-opt">
          <input type="checkbox" name="comm" value={c.value} checked={selected.has(c.value)} />
          <span>
            <b aria-hidden="true">{c.emoji}</b>
            <strong>{L(lang, c)}</strong>
            <small>{L(lang, c.blurb)}</small>
          </span>
        </label>
      ))}
      <p class="pf-limit" role="status" hidden>
        {props.v.t(`เลือกได้ไม่เกิน ${MAX_COMM} แบบ`, `Pick up to ${MAX_COMM}`)}
      </p>
    </div>
  );
}

/** Pill radios with a "not saying" option. */
export function OptRadios(props: { v: View; name: string; options: Opt[]; value?: string | null }) {
  const { t, lang } = props.v;
  return (
    <div class="pills">
      <label class="pill">
        <input type="radio" name={props.name} value="" checked={!props.value} />
        <span>{t("ไม่ระบุ", "Skip")}</span>
      </label>
      {props.options.map((o) => (
        <EmojiPill name={props.name} o={o} lang={lang} type="radio" checked={props.value === o.value} />
      ))}
    </div>
  );
}

/**
 * Occupation: a dropdown, and a text box for "Other". The box hides itself
 * unless "Other" is picked (CSS :has; browsers without it just always show it).
 */
export function OccupationPicker(props: { v: View; value?: string; other?: string }) {
  const { t, lang } = props.v;
  return (
    <div class="occ">
      <div class="field">
        <label for="f-occupation">{t("อาชีพ", "Occupation")}</label>
        <select id="f-occupation" name="occupation">
          <option value="">{t("ไม่ระบุ", "Prefer not to say")}</option>
          {OCCUPATIONS.map((o) => (
            <option value={o.value} selected={o.value === props.value}>
              {`${o.emoji} ${L(lang, o)}`}
            </option>
          ))}
        </select>
      </div>
      <div class="field occ-other">
        <label for="f-occupationOther">{t("อาชีพของคุณ", "Your occupation")}</label>
        <input
          id="f-occupationOther"
          name="occupationOther"
          type="text"
          value={props.other ?? ""}
          maxlength={OCCUPATION_OTHER_MAX}
          placeholder={t("เช่น นักบินโดรน", "e.g. Drone pilot")}
        />
      </div>
    </div>
  );
}

/** One prompt from the member's deck, with the input its kind needs. */
export function PromptInput(props: { v: View; p: Prompt; answer?: Answer; photoSrc?: string | null; shuffle?: boolean }) {
  const { t, lang } = props.v;
  const { p, answer } = props;
  const name = `a_${p.id}`;
  const val = answer?.value;
  const has = (x: string) => (Array.isArray(val) ? val.includes(x) : val === x);
  let body: Child = null;
  switch (p.kind) {
    case "text":
      body = (
        <div class="pf-text">
          <textarea name={name} rows={3} maxlength={TEXT_MAX} data-count={String(TEXT_MAX)} aria-label={L(lang, p)} placeholder={t("ตอบสั้น ๆ ด้วยใจ", "A short, honest answer")}>
            {typeof val === "string" ? val : ""}
          </textarea>
          <small class="pf-counter" aria-live="polite">
            {typeof val === "string" ? val.length : 0}/{TEXT_MAX}
          </small>
        </div>
      );
      break;
    case "slider": {
      const v = typeof val === "number" ? val : Math.round(((p.min ?? 0) + (p.max ?? 10)) / 2 / (p.step ?? 1)) * (p.step ?? 1);
      body = (
        <div class="pf-slider">
          <div class="pf-slider-row">
            <input
              type="range"
              min={p.min}
              max={p.max}
              step={p.step}
              value={String(v)}
              {...(typeof val === "number" ? { name } : { "data-name": name })}
              aria-label={L(lang, p)}
            />
            <output class={`pf-out ${typeof val === "number" ? "" : "pf-unset"}`}>{typeof val === "number" ? String(val) : "?"}</output>
          </div>
          <div class="pf-ends">
            <small>{L(lang, p.ends![0])}</small>
            <small>{L(lang, p.ends![1])}</small>
          </div>
          {typeof val === "number" ? null : <small class="muted">{t("เลื่อนเพื่อตอบ", "Slide to answer")}</small>}
        </div>
      );
      break;
    }
    case "scale":
      body = (
        <div class="pf-scale">
          <div class="pills">
            {[1, 2, 3, 4, 5].map((n) => (
              <label class="pill">
                <input type="radio" name={name} value={String(n)} checked={val === n} />
                <span>{n}</span>
              </label>
            ))}
          </div>
          <div class="pf-ends">
            <small>1 · {L(lang, p.ends![0])}</small>
            <small>5 · {L(lang, p.ends![1])}</small>
          </div>
        </div>
      );
      break;
    case "choice":
      body = (
        <div class="pills">
          {p.options!.map((o) => (
            <EmojiPill name={name} o={o} lang={lang} type="radio" checked={has(o.value)} />
          ))}
        </div>
      );
      break;
    case "emoji": {
      const pick = p.pick ?? 1;
      body = (
        <div class="pills pf-emoji" data-limit={pick > 1 ? String(pick) : undefined}>
          {p.options!.map((o) => (
            <EmojiPill name={name} o={o} lang={lang} type={pick > 1 ? "checkbox" : "radio"} checked={has(o.value)} big />
          ))}
          {pick > 1 ? (
            <p class="pf-limit" role="status" hidden>
              {t(`เลือกได้ ${pick}`, `Pick ${pick}`)}
            </p>
          ) : null}
        </div>
      );
      break;
    }
    case "multi": {
      const pick = p.pick ?? 3;
      body = (
        <div class="pills" data-limit={String(pick)}>
          {p.options!.map((o) => (
            <EmojiPill name={name} o={o} lang={lang} checked={has(o.value)} />
          ))}
          <p class="pf-limit" role="status" hidden>
            {t(`เลือกได้ไม่เกิน ${pick}`, `Pick up to ${pick}`)}
          </p>
        </div>
      );
      break;
    }
    case "rank": {
      const order = Array.isArray(val) ? val : [];
      const n = p.options!.length;
      body = (
        <ol class="pf-rank">
          {p.options!.map((o) => {
            const at = order.indexOf(o.value) + 1;
            return (
              <li>
                <select name={`r_${p.id}_${o.value}`} aria-label={`${L(lang, o)}: ${t("อันดับ", "place")}`}>
                  <option value="">·</option>
                  {Array.from({ length: n }, (_, i) => (
                    <option value={String(i + 1)} selected={at === i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </select>
                <span>
                  {o.emoji} {L(lang, o)}
                </span>
              </li>
            );
          })}
        </ol>
      );
      break;
    }
    case "photo":
      body = (
        <div class="pf-photo">
          {props.photoSrc ? <img src={props.photoSrc} alt={L(lang, p)} loading="lazy" /> : null}
          <input type="file" name={`f_${p.id}`} accept="image/jpeg,image/png,image/webp" aria-label={L(lang, p)} />
          <input type="text" name={name} value={typeof val === "string" ? val : ""} maxlength={CAPTION_MAX} placeholder={t("คำบรรยายสั้น ๆ (ไม่บังคับ)", "Short caption (optional)")} aria-label={t("คำบรรยายรูป", "Caption")} />
          <small class="muted">{t("JPG, PNG หรือ WebP ไม่เกิน 5 MB", "JPG, PNG or WebP, up to 5 MB")}</small>
        </div>
      );
      break;
  }
  return (
    <section class={`pf-prompt pf-${p.kind}-q`} id={`prompt-${p.id}`}>
      <div class="pf-prompt-head">
        <span class="pf-prompt-emoji" aria-hidden="true">
          {p.emoji}
        </span>
        <strong>{L(lang, p)}</strong>
      </div>
      <input type="hidden" name={`m_${p.id}`} value="1" />
      {body}
      <div class="pf-prompt-foot">
        {props.shuffle !== false ? (
          <button type="submit" class="btn ghost pf-shuffle" formaction="/settings/prompts/shuffle" formnovalidate name="promptId" value={p.id}>
            ↻ {t("ขอคำถามอื่น", "Different question")}
          </button>
        ) : null}
        {answer ? (
          <label class="pf-clear">
            <input type="checkbox" name={`clear_${p.id}`} value="1" /> {t("ลบคำตอบ", "Clear answer")}
          </label>
        ) : null}
      </div>
    </section>
  );
}

/** Include once per page, after the form. */
export function ProfileFormScript() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PROFILE_FORM_CSS }} />
      <script dangerouslySetInnerHTML={{ __html: PROFILE_FORM_JS }} />
    </>
  );
}

export const PROFILE_FORM_CSS = `
.occ:not(:has(option[value=other]:checked)) .occ-other{display:none}
.pf-section{margin:36px 0}
.pf-section>h2{display:flex;align-items:center;gap:10px;margin:0 0 6px;font-size:1.15rem}
.pf-section>h2 span[aria-hidden]{display:inline-grid;place-items:center;width:36px;height:36px;border-radius:12px;background:var(--brand-soft)}
.pf-section>p.muted{margin:0 0 14px}
.pill b{font-weight:400}
.pill.pf-big span{font-size:1.6rem;padding:6px 12px;min-width:52px;text-align:center}
.ip-tools{display:flex;gap:10px;align-items:center;margin:8px 0 12px}
.ip-search{flex:1;min-height:46px;border-radius:999px;border:1px solid var(--line);padding:0 18px;font:inherit;background:var(--surface);color:var(--ink)}
.ip-count{font-size:.9rem;color:var(--ink-3);white-space:nowrap}
.ip-count b{color:var(--brand)}
.ip-group{border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);padding:4px 16px;margin:10px 0}
.ip-group summary{cursor:pointer;font-weight:600;padding:12px 0;display:flex;align-items:center;gap:8px}
.ip-group .pills{padding:0 0 14px}
.ip-picked{margin-left:auto;background:var(--brand);color:var(--brand-ink);border-radius:999px;padding:1px 9px;font-size:.78rem}
.pf-limit{color:var(--warn);font-size:.86rem;margin:6px 0}
.pf-comm{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.pf-comm .pf-limit{grid-column:1/-1}
.pf-card-opt{position:relative}
.pf-card-opt input{position:absolute;opacity:0;inset:0}
.pf-card-opt span{display:flex;flex-direction:column;gap:2px;padding:14px;border:1px solid var(--line);border-radius:16px;background:var(--surface);cursor:pointer;height:100%}
.pf-card-opt b{font-size:1.5rem;font-weight:400}
.pf-card-opt small{color:var(--ink-3)}
.pf-card-opt input:checked+span{border-color:var(--brand);background:var(--brand-soft);box-shadow:inset 0 0 0 1px var(--brand)}
.pf-card-opt input:focus-visible+span{outline:3px solid color-mix(in srgb,var(--brand) 45%,transparent)}
.pf-prompt{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:20px;margin:16px 0;box-shadow:var(--shadow)}
.pf-prompt-head{display:flex;gap:12px;align-items:center;margin-bottom:14px}
.pf-prompt-emoji{display:inline-grid;place-items:center;flex:none;width:40px;height:40px;border-radius:14px;background:var(--brand-soft);font-size:1.25rem}
.pf-prompt textarea,.pf-prompt input[type=text]{width:100%;font:inherit;border:1px solid var(--line);border-radius:14px;padding:12px 14px;background:var(--bg);color:var(--ink)}
.pf-counter{display:block;text-align:right;margin-top:4px}
.pf-slider-row{display:flex;gap:14px;align-items:center}
.pf-slider input[type=range]{flex:1;accent-color:var(--brand);min-height:40px}
.pf-out{min-width:44px;text-align:center;font-weight:700;font-size:1.1rem;color:var(--brand);background:var(--brand-soft);border-radius:12px;padding:6px 8px}
.pf-out.pf-unset{color:var(--ink-3);background:var(--surface-2)}
.pf-ends{display:flex;justify-content:space-between;gap:12px;margin-top:6px}
.pf-rank{list-style:none;padding:0;margin:0;display:grid;gap:8px}
.pf-rank li{display:flex;gap:12px;align-items:center}
.pf-rank select{min-height:44px;border-radius:12px;border:1px solid var(--line);padding:0 10px;font:inherit;background:var(--surface);color:var(--ink)}
.pf-photo{display:grid;gap:10px}
.pf-photo img{width:100%;max-height:260px;object-fit:cover;border-radius:16px}
.pf-prompt-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:14px;flex-wrap:wrap}
.pf-shuffle{min-height:40px;padding:6px 14px;font-size:.9rem}
.pf-clear{font-size:.86rem;color:var(--ink-3);display:flex;gap:6px;align-items:center}
.pf-photo-main{display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.pf-photo-main img,.pf-photo-main .pf-initial{width:96px;height:96px;border-radius:28px;object-fit:cover}
.pf-initial{display:grid;place-items:center;background:var(--hero);color:#fff;font-size:2.2rem;font-weight:700}
.pf-save{position:sticky;bottom:calc(112px + env(safe-area-inset-bottom));z-index:3;display:flex;justify-content:center;margin:28px 0}
.pf-save .btn{min-width:220px;box-shadow:var(--shadow)}
`;

const PROFILE_FORM_JS = `(function(){
if(window.__pf)return;window.__pf=1;
function q(s,r){return (r||document).querySelectorAll(s)}
function counts(){q('.ip').forEach(function(ip){var b=ip.querySelector('.ip-count b');if(b)b.textContent=q('.ip-chip input:checked',ip).length});}
document.addEventListener('change',function(e){var t=e.target;if(!t||t.type!=='checkbox')return;var box=t.closest('[data-limit]');if(!box)return;
var max=+box.dataset.limit,n=box.querySelectorAll('input[type=checkbox]:checked').length;var m=box.querySelector('.pf-limit');
if(t.checked&&n>max){t.checked=false;if(m){m.hidden=false;clearTimeout(m._t);m._t=setTimeout(function(){m.hidden=true},2500)}}counts()});
document.addEventListener('input',function(e){var t=e.target;if(!t)return;
if(t.type==='range'){if(t.dataset.name){t.name=t.dataset.name;}var o=t.parentNode.querySelector('output');if(o){o.textContent=t.value;o.classList.remove('pf-unset')}}
if(t.dataset&&t.dataset.count){var c=t.parentNode.querySelector('.pf-counter');if(c)c.textContent=t.value.length+'/'+t.dataset.count}
if(t.classList.contains('ip-search')){var ip=t.closest('.ip'),v=t.value.trim().toLowerCase(),any=false;q('.ip-group',ip).forEach(function(g){var hit=0;q('.ip-chip',g).forEach(function(c){var ok=!v||c.dataset.q.indexOf(v)>=0;c.hidden=!ok;if(ok)hit++});g.hidden=!hit;if(v&&hit)g.open=true;if(hit)any=true});var none=ip.querySelector('.ip-none');if(none)none.hidden=any}});
document.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target&&e.target.classList&&e.target.classList.contains('ip-search'))e.preventDefault()});
counts();})();`;
