/**
 * The Bangkok Type quiz's interactive formats (src/vibe/generator.ts FORMATS):
 * this-or-that, slider, rank your top 3, map tap, photo cards and finish the
 * sentence. Each one is a plain form field first: without JavaScript they are
 * radios, a range input and number selects, and they post the same answers.
 * The script adds the gestures (swipe, snap, numbered taps, pins) with spring
 * motion from window.jgMotion (src/ui/spring.ts), and falls back to instant
 * changes under reduced motion.
 *
 * Nothing here knows a type: the components get the public view of a question
 * (labels, icons, pins, places) and post option indices.
 */
import { L } from "../lib/i18n";
import type { View } from "./kit";
import { QuestionArt } from "./question-art";
import { MAP_H, MAP_OUTLINE, MAP_RIVER, MAP_W } from "../vibe/quiz-map";
import { RANK_PICKS, toPublic, type Format, type PublicQuestion, type Question } from "../vibe/generator";

type FieldProps = { v: View; q: PublicQuestion; i: number };

/** One short line under the question, per format. */
export function formatHint(v: View, format: Format): string | null {
  const { t } = v;
  switch (format) {
    case "this-or-that":
      return t("ปัดไปทางที่ใช่คุณมากกว่า หรือแตะเลือก", "Swipe toward the one that's more you, or tap it");
    case "slider":
      return t("เลื่อนไปทางที่ใช่คุณมากกว่า ตรงกลางแปลว่าพอ ๆ กัน", "Slide toward the one that's more you. The middle means both.");
    case "rank":
      return t(`แตะ ${RANK_PICKS} อันดับที่ใช่ที่สุด เริ่มจากอันดับ 1`, `Tap your top ${RANK_PICKS}, favourite first`);
    case "map":
      return t("แตะหมุดบนแผนที่ หรือเลือกจากรายการ", "Tap a pin on the map, or pick from the list");
    case "photo":
      return t("แตะที่ที่คุณอยากไปมากที่สุด", "Tap the place you'd most like to be");
    case "sentence":
      return t("เลือกตอนจบที่เป็นตัวคุณที่สุด", "Pick the ending that's most you");
    default:
      return null;
  }
}

/** Formats that advance as soon as an answer is picked (the others wait for Next). */
export const AUTO_FORMATS: ReadonlySet<Format> = new Set<Format>(["choice", "this-or-that", "photo"]);

function ThisOrThat(props: FieldProps) {
  const { t, lang } = props.v;
  const { q, i } = props;
  return (
    <div class="qf-tot" data-tot data-tap={t("แตะอันที่ใช่คุณมากกว่า", "Tap the one that's more you")}>
      {q.options.map((o, j) => (
        <>
          {j === 1 ? (
            <span class="qf-tot-or" aria-hidden="true">
              {t("หรือ", "or")}
            </span>
          ) : null}
          <label class="qf-tot-card" data-side={String(j)}>
            <input type="radio" name={`a${i}`} value={String(j)} />
            <span class="qf-tot-face">
              <b class="qf-tot-emoji" aria-hidden="true">
                {q.icons[j]}
              </b>
              <span>{L(lang, o)}</span>
            </span>
          </label>
        </>
      ))}
    </div>
  );
}

function Slider(props: FieldProps) {
  const { t, lang } = props.v;
  const { q, i } = props;
  const [left, right] = q.options;
  const id = `q${i}-slider`;
  const mid = t("พอ ๆ กันทั้งสองแบบ", "Both equally");
  return (
    <div
      class="qf-slider"
      data-slider
      data-left={L(lang, left)}
      data-right={L(lang, right)}
      data-left-icon={q.icons[0]}
      data-right-icon={q.icons[1]}
      data-mid={mid}
      data-lean={t("ค่อนไปทาง", "Leaning to")}
      data-all={t("ใช่เลยแบบนี้", "All the way to")}
    >
      <div class="qf-ends">
        <span class="qf-end" data-end="0">
          <b aria-hidden="true">{q.icons[0]}</b>
          <span>{L(lang, left)}</span>
        </span>
        <span class="qf-end" data-end="1">
          <b aria-hidden="true">{q.icons[1]}</b>
          <span>{L(lang, right)}</span>
        </span>
      </div>
      <div class="qf-track">
        <span class="qf-zone" aria-hidden="true" />
        <input
          id={id}
          type="range"
          name={`a${i}`}
          min="0"
          max="100"
          step="5"
          value="50"
          aria-label={t(`จาก "${L(lang, left)}" ถึง "${L(lang, right)}"`, `From "${L(lang, left)}" to "${L(lang, right)}"`)}
          aria-valuetext={mid}
        />
      </div>
      <div class="qf-scale" aria-hidden="true">
        <span>◀ {q.icons[0]}</span>
        <span>{t("พอ ๆ กัน", "both")}</span>
        <span>{q.icons[1]} ▶</span>
      </div>
      <output for={id} class="qf-read" aria-live="polite">
        {mid}
      </output>
    </div>
  );
}

function Rank(props: FieldProps) {
  const { t, lang } = props.v;
  const { q, i } = props;
  const n = q.pick ?? RANK_PICKS;
  const status = `q${i}-rank-status`;
  return (
    <div
      class="qf-rank"
      data-rank
      data-pick={String(n)}
      data-start={t("แตะอันดับ 1 ของคุณ", "Tap your number 1")}
      data-more={t("ต่อไปคืออันดับ {n}", "Now your number {n}")}
      data-done={t(`ครบ ${n} อันดับแล้ว กดต่อไปได้เลย หรือแตะเพื่อเปลี่ยน`, `Top ${n} set. Tap Next, or untick one to change it`)}
      data-full={t(`เลือกครบ ${n} แล้ว แตะอันที่เลือกไว้เพื่อเอาออกก่อน`, `You have ${n} already. Untick one first`)}
      data-need={t(`เลือกให้ครบ ${n} หรือไม่เลือกเลยเพื่อข้าม`, `Pick ${n}, or none to skip`)}
      data-ranked={t("อันดับ {n}", "number {n}")}
    >
      <input type="hidden" name={`a${i}`} value="" class="qf-rank-value" />
      <ol class="qf-rank-list">
        {q.options.map((o, j) => (
          <li>
            <label class="qf-rank-item">
              <input type="checkbox" class="qf-rank-box" data-j={String(j)} aria-describedby={status} />
              <span class="qf-rank-face">
                <b class="qf-rank-badge" aria-hidden="true" />
                <b class="answer-emoji" aria-hidden="true">
                  {q.icons[j]}
                </b>
                <span>{L(lang, o)}</span>
                <span class="sr-only qf-rank-sr" />
              </span>
            </label>
            <label class="qf-rank-pick">
              <b class="answer-emoji" aria-hidden="true">
                {q.icons[j]}
              </b>
              <span>{L(lang, o)}</span>
              <select name={`a${i}_${j}`} aria-label={t(`อันดับของ: ${L(lang, o)}`, `Rank for: ${L(lang, o)}`)}>
                <option value="">–</option>
                {Array.from({ length: n }, (_, k) => (
                  <option value={String(k + 1)}>{k + 1}</option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ol>
      <div class="qf-rank-tools">
        <button type="button" class="btn ghost qf-rank-undo" disabled>
          ↶ {t("ย้อน", "Undo")}
        </button>
        <span class="qf-rank-status" id={status} aria-live="polite">
          {t(`ใส่เลข 1 ถึง ${n} ให้ ${n} อันดับที่ชอบ 1 คือชอบที่สุด`, `Number your top ${n}: 1 is your favourite`)}
        </span>
      </div>
    </div>
  );
}

function MapTap(props: FieldProps) {
  const { t, lang } = props.v;
  const { q, i } = props;
  const pins = q.pins ?? [];
  return (
    <div class="qf-map" data-map>
      <div class="qf-map-box" style={`aspect-ratio:${MAP_W}/${MAP_H}`}>
        <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} aria-hidden="true" focusable="false">
          <path class="qf-map-land" d={MAP_OUTLINE} />
          <path class="qf-map-river" d={MAP_RIVER} />
        </svg>
        <span class="qf-map-label" aria-hidden="true">
          {t("แม่น้ำเจ้าพระยา", "Chao Phraya")}
        </span>
        {pins.map((p, j) => (
          <label class="qf-pin" data-j={String(j)} for={`q${i}-m${j}`} style={`left:${p.x}%;top:${p.y}%`} aria-hidden="true">
            <span class="qf-pin-head">
              <b>{q.icons[j]}</b>
              <i>{j + 1}</i>
            </span>
          </label>
        ))}
      </div>
      <div class="answers qf-map-list">
        {q.options.map((o, j) => (
          <label class="answer qf-map-opt" data-j={String(j)}>
            <input type="radio" id={`q${i}-m${j}`} name={`a${i}`} value={String(j)} />
            <span>
              <b class="answer-badge" aria-hidden="true">
                {j + 1}
              </b>
              <em class="qf-map-text">
                {L(lang, o)}
                {q.areas?.[j] ? <small class="qf-area">📍 {L(lang, q.areas[j])}</small> : null}
              </em>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function Photos(props: FieldProps) {
  const { lang } = props.v;
  const { q, i } = props;
  return (
    <div class="qf-photos">
      {q.options.map((o, j) => (
        <label class="qf-photo">
          <input type="radio" name={`a${i}`} value={String(j)} />
          <span class="qf-photo-face">
            {q.photos?.[j] ? <QuestionArt art={q.photos[j]} lang={lang} /> : null}
            <span class="qf-photo-text">
              {L(lang, o)}
              {q.areas?.[j] ? <span class="sr-only">, {L(lang, q.areas[j])}</span> : null}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}

function Sentence(props: FieldProps) {
  const { lang } = props.v;
  const { q, i } = props;
  return (
    <div class="qf-sentence" data-sentence>
      <p class="qf-stem" aria-hidden="true">
        <span>{q.stem ? L(lang, q.stem) : ""}</span> <span class="qf-blank">…</span>
      </p>
      <div class="qf-chips">
        {q.options.map((o, j) => (
          <label class="qf-chip">
            <input type="radio" name={`a${i}`} value={String(j)} aria-label={`${q.stem ? L(lang, q.stem) : ""} ${L(lang, o)}`} />
            <span class="qf-chip-face">
              <b aria-hidden="true">{q.icons[j]}</b>
              <span class="qf-chip-text">{L(lang, o)}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** The field for an interactive format, or null for a plain pick-one. */
export function FormatField(props: { v: View; q: Question; i: number }) {
  const pq = toPublic(props.q);
  const p = { v: props.v, q: pq, i: props.i };
  switch (pq.format) {
    case "this-or-that":
      return <ThisOrThat {...p} />;
    case "slider":
      return <Slider {...p} />;
    case "rank":
      return <Rank {...p} />;
    case "map":
      return <MapTap {...p} />;
    case "photo":
      return <Photos {...p} />;
    case "sentence":
      return <Sentence {...p} />;
    default:
      return null;
  }
}

export const QUIZ_FORMATS_CSS = `
.qf-hint{display:block;margin:0 0 8px;font-size:.88rem;color:var(--ink-2)}
/* this or that */
.qf-tot{position:relative;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,8rem),1fr));gap:12px;margin-top:12px;touch-action:pan-y;user-select:none;-webkit-user-select:none}
.qf-tot-card{position:relative;display:block;will-change:transform}
.qf-tot-card input{position:absolute;opacity:0;inset:0}
.qf-tot-face{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;height:100%;min-height:180px;padding:18px 12px;border-radius:24px;border:1.5px solid var(--line);background:var(--surface);box-shadow:var(--shadow);text-align:center;font-weight:500;line-height:1.35;cursor:pointer;transition:border-color .15s ease,background-color .15s ease}
.qf-tot-emoji{font-size:2.6rem;line-height:1}
.qf-tot-card input:checked+.qf-tot-face{border-color:var(--brand);background:var(--brand-soft);color:var(--ink)}
.qf-tot-card input:focus-visible+.qf-tot-face{outline:3px solid color-mix(in srgb,var(--brand) 55%,transparent);outline-offset:2px}
.qf-tot-or{position:absolute;left:50%;top:50%;z-index:1;transform:translate(-50%,-50%);display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;padding:0 8px;border-radius:999px;background:var(--surface-2);border:1.5px solid var(--line);color:var(--ink-2);font-weight:700;font-size:.9rem;pointer-events:none}
.qf-tot.dragging .qf-tot-face{transition:none}
/* slider */
.qf-slider{margin-top:14px;--lean:0}
.qf-ends{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,8.5rem),1fr));gap:10px}
.qf-end{display:flex;flex-direction:column;gap:6px;padding:12px;border-radius:18px;border:1.5px solid var(--line);background:var(--surface);box-shadow:var(--shadow);font-weight:500;line-height:1.35;transition:border-color .15s ease,background-color .15s ease}
.qf-end b{font-size:1.8rem;line-height:1}
.qf-end[data-end="1"]{text-align:right;align-items:flex-end}
.qf-slider.lean-0 .qf-end[data-end="0"],.qf-slider.lean-1 .qf-end[data-end="1"]{border-color:var(--brand);background:var(--brand-soft)}
.qf-track{position:relative;margin:18px 0 4px}
.qf-zone{position:absolute;left:40%;width:20%;top:50%;height:22px;transform:translateY(-50%);border-radius:999px;background:color-mix(in srgb,var(--sun,#ffb443) 30%,transparent);pointer-events:none}
.qf-track input[type=range]{position:relative;display:block;width:100%;height:44px;margin:0;background:transparent;cursor:pointer;-webkit-appearance:none;appearance:none}
.qf-track input[type=range]::-webkit-slider-runnable-track{height:10px;border-radius:999px;background:var(--line)}
.qf-track input[type=range]::-moz-range-track{height:10px;border-radius:999px;background:var(--line)}
.qf-track input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:34px;height:34px;margin-top:-12px;border-radius:50%;background:var(--brand);border:4px solid var(--surface);box-shadow:var(--shadow)}
.qf-track input[type=range]::-moz-range-thumb{width:28px;height:28px;border-radius:50%;background:var(--brand);border:4px solid var(--surface);box-shadow:var(--shadow)}
.qf-track input[type=range]:focus-visible{outline:3px solid color-mix(in srgb,var(--brand) 55%,transparent);outline-offset:4px;border-radius:999px}
.qf-scale{display:flex;justify-content:space-between;font-size:.8rem;color:var(--ink-3)}
.qf-read{display:block;text-align:center;font-weight:700;color:var(--brand);min-height:1.5em;margin-top:6px}
/* rank */
.qf-rank-list{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:8px}
.qf-rank-item{position:relative;display:none}
.qf-rank-item input{position:absolute;opacity:0;inset:0}
.qf-rank-face,.qf-rank-pick{display:flex;align-items:center;gap:12px;min-height:64px;padding:12px 14px;border-radius:16px;border:1.5px solid var(--line);background:var(--surface);box-shadow:var(--shadow);font-weight:500;line-height:1.35;cursor:pointer;transition:border-color .15s ease,background-color .15s ease}
.qf-rank-face>span:not(.sr-only),.qf-rank-pick>span{flex:1}
.qf-rank-badge{flex:none;width:34px;height:34px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;border:2px dashed var(--line);font-size:1rem}
.qf-rank-item.on .qf-rank-face{border-color:var(--brand);background:var(--brand-soft)}
.qf-rank-item.on .qf-rank-badge{border:0;background:var(--brand);color:var(--brand-ink);animation:qf-pop .42s cubic-bezier(.34,1.56,.64,1) both}
.qf-rank-item input:focus-visible+.qf-rank-face{outline:3px solid color-mix(in srgb,var(--brand) 55%,transparent);outline-offset:2px}
.qf-rank-pick select{flex:none;min-width:64px;min-height:44px;font:inherit;font-weight:700;text-align:center;border-radius:12px;border:1.5px solid var(--line);background:var(--surface);color:var(--ink)}
.qf-rank-tools{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:12px}
.qf-rank-undo{display:none}
.qf-rank-status{font-size:.88rem;color:var(--ink-2)}
.flow.is-js .qf-rank-item{display:block}
.flow.is-js .qf-rank-pick{display:none}
.flow.is-js .qf-rank-undo{display:inline-flex}
/* map */
.qf-map-box{position:relative;margin:10px 0 12px;border-radius:20px;overflow:hidden;background:var(--river-soft,#e0f1f5);border:1px solid var(--line);box-shadow:var(--shadow)}
.qf-map-box svg{position:absolute;inset:0;width:100%;height:100%}
.qf-map-land{fill:var(--surface);stroke:color-mix(in srgb,var(--brand) 35%,var(--line));stroke-width:.6}
.qf-map-river{fill:none;stroke:var(--river,#0b6e8a);stroke-width:2.2;stroke-linecap:round;opacity:.85}
.qf-map-label{position:absolute;left:6px;bottom:6px;font-size:.72rem;color:var(--ink-3);background:color-mix(in srgb,var(--surface) 80%,transparent);padding:1px 8px;border-radius:999px}
.qf-pin{position:absolute;transform:translate(-50%,-50%);cursor:pointer;-webkit-tap-highlight-color:transparent}
.qf-pin::before{content:"";position:absolute;inset:-6px}
.qf-pin-head{position:relative;display:flex;align-items:center;gap:2px;padding:4px 8px 4px 6px;border-radius:999px;background:var(--surface);border:1.5px solid var(--line);box-shadow:0 4px 12px rgba(0,0,0,.18);transform-origin:50% 50%;will-change:transform}
.qf-pin-head b{font-size:1.15rem;line-height:1}
.qf-pin-head i{font-style:normal;font-weight:700;font-size:.78rem;color:var(--ink-2)}
.qf-pin.on .qf-pin-head{background:var(--brand);border-color:var(--brand)}
.qf-pin.on .qf-pin-head i{color:var(--brand-ink)}
.qf-pin.on{z-index:2}
.qf-map-text{flex:1;font-style:normal}
.qf-area{display:block;margin-top:2px;font-size:.8rem;color:var(--ink-3)}
.answer input:checked+span .qf-area{color:inherit;opacity:.85}
/* photo cards */
.qf-photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,13rem),1fr));gap:12px;margin-top:10px}
.qf-photo{position:relative;display:block}
.qf-photo input{position:absolute;opacity:0;inset:0}
.qf-photo-face{display:flex;flex-direction:column;height:100%;border-radius:20px;overflow:hidden;border:1.5px solid var(--line);background:var(--surface);box-shadow:var(--shadow);cursor:pointer;transition:transform .2s cubic-bezier(.34,1.56,.64,1),border-color .15s ease,background-color .15s ease}
.qf-photo-face .q-art{margin:0;border-radius:0;box-shadow:none;height:104px}
.qf-photo-text{padding:12px 14px;font-weight:500;line-height:1.35}
.qf-photo:active .qf-photo-face{transform:scale(.97)}
.qf-photo input:checked+.qf-photo-face{border-color:var(--brand);background:var(--brand-soft);color:var(--ink)}
.qf-photo input:focus-visible+.qf-photo-face{outline:3px solid color-mix(in srgb,var(--brand) 55%,transparent);outline-offset:2px}
/* finish the sentence */
.qf-stem{margin:10px 0 14px;padding:16px;border-radius:18px;background:var(--surface-2);font-size:1.15rem;font-weight:600;line-height:1.45}
.qf-blank{display:inline;border-bottom:2px dashed var(--ink-3);color:var(--ink-3)}
.qf-blank.on{border-bottom-color:var(--brand);color:var(--brand);animation:qf-in .38s cubic-bezier(.34,1.56,.64,1) both}
.qf-chips{display:flex;flex-wrap:wrap;gap:8px}
.qf-chip{position:relative;display:block;max-width:100%}
.qf-chip input{position:absolute;opacity:0;inset:0}
.qf-chip-face{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:10px 16px;border-radius:22px;border:1.5px solid var(--line);background:var(--surface);box-shadow:var(--shadow);font-weight:500;line-height:1.35;cursor:pointer;transition:transform .2s cubic-bezier(.34,1.56,.64,1),border-color .15s ease,background-color .15s ease}
.qf-chip-face b{flex:none}
.qf-chip:active .qf-chip-face{transform:scale(.97)}
.qf-chip input:checked+.qf-chip-face{border-color:var(--brand);background:var(--brand);color:var(--brand-ink)}
.qf-chip input:focus-visible+.qf-chip-face{outline:3px solid color-mix(in srgb,var(--brand) 55%,transparent);outline-offset:2px}
@keyframes qf-pop{from{transform:scale(.4)}to{transform:none}}
@keyframes qf-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@media (forced-colors:active){.qf-tot-card input:checked+.qf-tot-face,.qf-rank-item.on .qf-rank-face,.qf-photo input:checked+.qf-photo-face,.qf-chip input:checked+.qf-chip-face,.qf-pin.on .qf-pin-head{outline:3px solid Highlight}}
@media (prefers-reduced-motion:reduce){.qf-rank-item.on .qf-rank-badge,.qf-blank.on{animation:none}.qf-photo-face,.qf-chip-face{transition:none}.qf-photo:active .qf-photo-face,.qf-chip:active .qf-chip-face{transform:none}}
html.a11y-motion .qf-rank-item.on .qf-rank-badge,html.a11y-motion .qf-blank.on{animation:none}
html.a11y-motion .qf-photo-face,html.a11y-motion .qf-chip-face{transition:none}
`;

/**
 * Runs once per quiz form. ES5-ish like FLOW_JS. Every widget works without
 * it; this adds the gestures and the live read-outs.
 */
export const QUIZ_FORMATS_JS = `(function(){
var f=document.currentScript&&document.currentScript.closest("form");if(!f||f.dataset.qfReady)return;f.dataset.qfReady="1";
var M=window.jgMotion;function still(){return M?M.still():(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches)}
function each(sel,fn){[].forEach.call(f.querySelectorAll(sel),fn)}
function fire(el){el.dispatchEvent(new Event("change",{bubbles:true}))}

/* this or that: tap, or swipe toward a card; a spring takes it home or across */
each("[data-tot]",function(w){
  var cards=[].slice.call(w.querySelectorAll(".qf-tot-card")),start=null,dx=0,anim=null,tr=M?M.tracker():null,moved=false;
  /* Stacked (large text): left and right mean nothing, so it is tap only and the hint says so. */
  var hint=w.closest(".flow-step").querySelector(".qf-hint"),swipeHint=hint?hint.textContent:"";
  function stacked(){return cards[1].offsetTop>cards[0].offsetTop+10}
  function fit(){if(hint&&cards[0].offsetParent)hint.textContent=stacked()?w.dataset.tap:swipeHint}
  fit();window.addEventListener("resize",fit);new MutationObserver(fit).observe(w.closest(".flow-step"),{attributes:true,attributeFilter:["hidden"]});
  function paint(x){var W=w.clientWidth||300,p=Math.max(-1,Math.min(1,x/(W*0.5)));
    cards.forEach(function(c,j){var toward=j===0?-p:p;c.style.transform=x?"translateX("+(x*0.35).toFixed(1)+"px) rotate("+(x/W*4).toFixed(2)+"deg) scale("+(1+Math.max(0,toward)*0.05).toFixed(3)+")":"";c.style.opacity=x?String(1-Math.max(0,-toward)*0.35):""})}
  function settle(to,done){if(anim)anim.stop();if(still()||!M){paint(0);if(done)done();return}
    anim=M.spring({from:dx,to:to,velocity:tr?tr.velocity():0,damping:0.8,response:0.35,onUpdate:function(x){dx=x;paint(x)},onDone:function(){dx=0;if(to!==0)paint(0);if(done)done()}})}
  w.addEventListener("pointerdown",function(e){if(e.button||stacked())return;if(anim)anim.stop();start={x:e.clientX-dx,y:e.clientY};moved=false;if(tr){tr.reset();tr.add(e.clientX)}});
  w.addEventListener("pointermove",function(e){if(!start)return;var x=e.clientX-start.x,y=e.clientY-start.y;
    if(!moved){if(Math.abs(x)<8||Math.abs(x)<Math.abs(y))return;moved=true;w.classList.add("dragging");try{w.setPointerCapture(e.pointerId)}catch(_){}}
    if(tr)tr.add(e.clientX);dx=x;if(!still())paint(x)});
  function end(){if(!start)return;start=null;w.classList.remove("dragging");if(!moved)return;
    var W=w.clientWidth||300,proj=dx+(M&&tr?M.project(tr.velocity()):0);
    if(Math.abs(proj)>W*0.28){var j=proj<0?0:1,inp=cards[j].querySelector("input");
      if(!inp.checked){inp.checked=true;fire(inp)}if(M)M.tick();settle(0)}
    else settle(0)}
  w.addEventListener("pointerup",end);w.addEventListener("pointercancel",end);
  w.addEventListener("click",function(e){if(moved){e.preventDefault();e.stopPropagation();moved=false}},true);
});

/* slider: live read-out; let go inside the middle band and it springs to the centre */
each("[data-slider]",function(w){
  var r=w.querySelector("input[type=range]"),o=w.querySelector("output"),d=w.dataset,anim=null;
  function upd(){var v=+r.value,side=v<50?0:1,txt,vis;
    if(v>=40&&v<=60){txt=d.mid;vis=d.mid}else{var pre=v<=10||v>=90?d.all:d.lean;txt=pre+": "+(side?d.right:d.left);vis=pre+" "+(side?d.rightIcon:d.leftIcon)}
    o.textContent=vis;r.setAttribute("aria-valuetext",txt);
    w.classList.toggle("lean-0",v<40);w.classList.toggle("lean-1",v>60)}
  function snap(){var v=+r.value;if(v<40||v>60||v===50)return;if(still()||!M){r.value="50";upd();return}
    if(anim)anim.stop();anim=M.spring({from:v,to:50,damping:0.75,response:0.3,onUpdate:function(x){r.value=String(Math.round(x));upd()},onDone:function(){r.value="50";upd()}})}
  r.addEventListener("input",function(){if(anim)anim.stop();upd()});
  r.addEventListener("pointerup",snap);r.addEventListener("touchend",snap);
  upd();
});

/* rank: tick your top N in order; badges number them; partial picks block Next */
each("[data-rank]",function(w){
  var d=w.dataset,n=+d.pick||3,boxes=[].slice.call(w.querySelectorAll(".qf-rank-box")),out=w.querySelector(".qf-rank-value"),undo=w.querySelector(".qf-rank-undo"),st=w.querySelector(".qf-rank-status"),order=[],msg="";
  function draw(){
    boxes.forEach(function(b,j){var k=order.indexOf(j),item=b.closest(".qf-rank-item");b.checked=k>=0;item.classList.toggle("on",k>=0);
      item.querySelector(".qf-rank-badge").textContent=k<0?"":String(k+1);item.querySelector(".qf-rank-sr").textContent=k<0?"":", "+d.ranked.replace("{n}",k+1)});
    out.value=order.length===n?order.join(","):"";
    var partial=order.length>0&&order.length<n;boxes[0].setCustomValidity(partial?d.need:"");
    undo.disabled=!order.length;
    st.textContent=msg||(order.length===n?d.done:(order.length?d.more.replace("{n}",order.length+1):d.start));msg="";
  }
  boxes.forEach(function(b){b.addEventListener("change",function(){var j=+b.dataset.j,k=order.indexOf(j);
    if(k>=0)order.splice(k,1);else if(order.length<n)order.push(j);else msg=d.full;
    if(order.length===n&&k<0&&M)M.tick();draw()})});
  undo.addEventListener("click",function(){order.pop();draw()});
  draw();
});

/* map: a pin and its list row are the same radio; the picked pin springs up */
each("[data-map]",function(w){
  var pins=[].slice.call(w.querySelectorAll(".qf-pin")),radios=[].slice.call(w.querySelectorAll("input[type=radio]"));
  function pop(head){if(still()||!M){head.style.transform="scale(1.18)";return}M.spring({from:0.7,to:1.18,damping:0.55,response:0.4,onUpdate:function(s){head.style.transform="scale("+s.toFixed(3)+")"}})}
  function draw(e){radios.forEach(function(r,j){var on=r.checked,p=pins[j];if(!p)return;var was=p.classList.contains("on");p.classList.toggle("on",on);if(on&&!was)pop(p.querySelector(".qf-pin-head"));if(!on)p.querySelector(".qf-pin-head").style.transform=""})}
  w.addEventListener("change",draw);
  pins.forEach(function(p,j){p.addEventListener("click",function(){var row=w.querySelectorAll(".qf-map-opt")[j];if(row&&row.scrollIntoView)setTimeout(function(){row.scrollIntoView({block:"nearest",behavior:still()?"auto":"smooth"})},30)})});
  draw();
});

/* finish the sentence: the picked chip fills the blank */
each("[data-sentence]",function(w){
  var blank=w.querySelector(".qf-blank");
  function draw(){var c=w.querySelector("input:checked");blank.classList.remove("on");if(!c){blank.textContent="…";return}
    blank.textContent=c.parentNode.querySelector(".qf-chip-text").textContent.trim();void blank.offsetWidth;blank.classList.add("on")}
  w.addEventListener("change",draw);draw();
});
})();`;
