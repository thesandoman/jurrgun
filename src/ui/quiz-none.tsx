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
 * "None of these are me": one more radio in the question's group, carrying
 * `required`, so the group must be answered (every question is a plain
 * pick-one, D26).
 */
export function NoneOfThese(props: { v: View; q: AnyQuestion; i: number }) {
  const { t } = props.v;
  return (
    <label class="q-none">
      <input type="radio" name={`a${props.i}`} value="none" required data-i={String(props.i)} />
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
@media (forced-colors:active){.q-none:has(input:checked){outline:3px solid Highlight}}
@media (prefers-reduced-motion:reduce){.q-none{transition:none}}
`;

/**
 * Runs once per quiz form. ES5-ish like FLOW_JS.
 * Without it, the no-JS form still has the none option and its `required`.
 */
export const QUIZ_NONE_JS = `(function(){
var f=document.currentScript&&document.currentScript.closest("form");if(!f||f.dataset.qnReady)return;f.dataset.qnReady="1";
var m=f.querySelector(".q-none-data");if(!m)return;var d=m.dataset,nones=[].slice.call(f.querySelectorAll(".q-none input"));
function group(x){return [].slice.call(f.querySelectorAll('input[type=radio][name="a'+x.dataset.i+'"]'))}
/* Every pick-one answer in a step is required: an answer or "none" (D30). */
nones.forEach(function(x){group(x).forEach(function(r){r.required=true})});
function sync(){
  nones.forEach(function(x){var g=group(x),any=g.some(function(r){return r.checked});g[0].setCustomValidity(any?"":d.pick)});
}
f.addEventListener("change",sync);
sync();
})();`;
