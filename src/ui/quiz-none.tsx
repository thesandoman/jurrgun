/**
 * "None of these are me" in the Bangkok Type quiz (quiz-review 7, D26): a
 * gentle way out when no answer fits, on every question. It posts a{i}=none,
 * which casts no vote (parseAnswers in src/routes/quiz.tsx), with no limit
 * (D29). It replaces the old Skip: with it, every question asks for a
 * response (D30). No reactions, nudges or cheering here (D26).
 */
import type { View } from "./kit";
import type { AnyQuestion } from "../vibe/generator";

/**
 * "None of these are me". In a pick-one format it is one more radio in the
 * question's group and it carries `required`, so the group must be answered;
 * a slider or rank keeps its own field, so there it is a checkbox, placed last
 * so it wins when both post (the script also switches the other field off).
 */
export function NoneOfThese(props: { v: View; q: AnyQuestion; i: number }) {
  const { t } = props.v;
  const own = props.q.format === "slider" || props.q.format === "rank";
  return (
    <label class="q-none">
      <input type={own ? "checkbox" : "radio"} name={`a${props.i}`} value="none" required={!own} data-i={String(props.i)} />
      <span>{t("ไม่มีข้อไหนเป็นฉันเลย", "None of these are me")}</span>
    </label>
  );
}

/** What the script needs (the words it fills in), on a hidden element so Flow stays as it is. */
export function NoneData(props: { v: View }) {
  const { t } = props.v;
  return (
    <i
      class="q-none-data"
      hidden
      data-pick={t('เลือกคำตอบที่ใกล้คุณที่สุด หรือแตะ "ไม่มีข้อไหนเป็นฉันเลย"', 'Pick the closest answer, or tap "None of these are me"')}
    />
  );
}

export const QUIZ_NONE_CSS = `
.q-none{display:flex;align-items:center;justify-content:center;gap:8px;margin:14px auto 0;min-height:44px;padding:8px 16px;border-radius:999px;border:1.5px dashed var(--line);color:var(--ink-2);font-weight:500;cursor:pointer;width:fit-content;max-width:100%;text-align:center;transition:border-color .15s ease,background-color .15s ease}
.q-none input{position:absolute;opacity:0;width:1px;height:1px}
.q-none:has(input:checked){border-style:solid;border-color:var(--ink-2);background:var(--surface-2);color:var(--ink)}
.q-none:has(input:focus-visible){outline:3px solid color-mix(in srgb,var(--brand) 55%,transparent);outline-offset:2px}
.qf-slider.is-none .qf-track,.qf-slider.is-none .qf-scale,.qf-slider.is-none .qf-read{opacity:.4}
@media (forced-colors:active){.q-none:has(input:checked){outline:3px solid Highlight}}
@media (prefers-reduced-motion:reduce){.q-none{transition:none}}
`;

/**
 * Runs once per quiz form, after QUIZ_FORMATS_JS. ES5-ish like FLOW_JS.
 * Without it, the no-JS form still has the none option and its `required`.
 */
export const QUIZ_NONE_JS = `(function(){
var f=document.currentScript&&document.currentScript.closest("form");if(!f||f.dataset.qnReady)return;f.dataset.qnReady="1";
var m=f.querySelector(".q-none-data");if(!m)return;var d=m.dataset,nones=[].slice.call(f.querySelectorAll(".q-none input"));
function group(x){return [].slice.call(f.querySelectorAll('input[type=radio][name="a'+x.dataset.i+'"]'))}
/* Every pick-one answer in a step is required: an answer or "none" (D30). */
nones.forEach(function(x){if(x.type==="radio")group(x).forEach(function(r){r.required=true})});
function own(x){return x.closest(".flow-step").querySelector(".qf-slider,.qf-rank")}
function sync(){
  nones.forEach(function(x){
    if(x.type==="radio"){var g=group(x),any=g.some(function(r){return r.checked});g[0].setCustomValidity(any?"":d.pick)}
    var w=own(x);if(w&&w.classList.contains("qf-slider")){var rg=w.querySelector("input[type=range]");rg.disabled=x.checked;w.classList.toggle("is-none",x.checked)}});
}
f.addEventListener("change",function(e){
  var t=e.target,st=t.closest&&t.closest(".flow-step");if(!st)return;
  /* A real pick in a slider or rank step takes back that step's "none". */
  if(!t.closest(".q-none")){var n=st.querySelector(".q-none input[type=checkbox]");if(n&&n.checked)n.checked=false}
  sync();
});
sync();
})();`;
