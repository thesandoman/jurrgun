/**
 * Card flow: N screens ("steps") inside ONE plain form, one decision per screen.
 *
 *   <Flow v={v} submit={t("ต่อไป","Next")}>
 *     <FlowStep title="…">fields</FlowStep>
 *     <FlowStep title="…" auto>radio cards (auto-advance on tap)</FlowStep>
 *   </Flow>
 *
 * Without JS every step renders stacked and the form posts as usual. With JS
 * (a small inline script, no libraries) one step shows at a time with a slide
 * transition, a progress bar, Back / Next in a sticky bottom bar, required-field
 * checks before Next, auto-advance on radio steps, and browser Back support.
 */
import type { Child } from "hono/jsx";
import type { View } from "./kit";

export type Stage = { at: number; of: number };

export function FlowStep(props: {
  title: string;
  /** One short helper line. */
  hint?: string;
  /** Longer explanation, tucked behind an "ⓘ" toggle. */
  info?: Child;
  emoji?: string;
  /** Radio step: advance as soon as an answer is picked. */
  auto?: boolean;
  /** At least this many checkboxes in the step must be ticked before Next. */
  need?: number;
  /** Message when `need`, `sum` or `allOrNone` is not met. */
  needText?: string;
  /** Number inputs in the step must add up to this (or all be 0, which skips). */
  sum?: number;
  /** Every select in the step must be set, or none (which skips). */
  allOrNone?: boolean;
  class?: string;
  /** Label for the main button on this step (default: Next). */
  cta?: string;
  children?: Child;
}) {
  return (
    <section
      class={`flow-step ${props.class ?? ""}`}
      data-cta={props.cta}
      data-auto={props.auto ? "1" : undefined}
      data-need={props.need ? String(props.need) : undefined}
      data-need-text={props.needText}
      data-sum={props.sum ? String(props.sum) : undefined}
      data-all-or-none={props.allOrNone ? "1" : undefined}
    >
      <fieldset>
        <legend class="flow-title">
          {props.emoji ? (
            <span class="flow-emoji" aria-hidden="true">
              {props.emoji}
            </span>
          ) : null}
          {props.title}
        </legend>
        {props.hint ? <p class="flow-hint">{props.hint}</p> : null}
        {props.info ? (
          <details class="info">
            <summary>ⓘ</summary>
            <div>{props.info}</div>
          </details>
        ) : null}
        <div class="flow-body">{props.children}</div>
        <p class="flow-need" role="alert" hidden />
      </fieldset>
    </section>
  );
}

export function Flow(props: {
  v: View;
  /** Submit label on the last step (Next on the others). */
  submit: string;
  action?: string;
  hidden?: Record<string, string>;
  /** Where this flow sits in a bigger journey, for the progress bar. */
  stage?: Stage;
  /** Submit as soon as the last auto step is answered. */
  autoSubmit?: boolean;
  /** Extra controls in the bottom bar (e.g. "Skip for now"). */
  extra?: Child;
  /** Close / exit link shown top right. */
  close?: string;
  error?: Child;
  /** Step to open on (e.g. the step a server-side error refers to). */
  start?: number;
  children: Child;
}) {
  const { t } = props.v;
  const stage = props.stage ?? { at: 0, of: 1 };
  return (
    <form
      method="post"
      action={props.action}
      class="flow"
      data-stage-at={String(stage.at)}
      data-stage-of={String(stage.of)}
      data-autosubmit={props.autoSubmit ? "1" : undefined}
      data-start={props.start ? String(props.start) : undefined}
      data-next={t("ต่อไป", "Next")}
      data-skip={t("ข้าม", "Skip")}
      data-done={props.submit}
    >
      <div class="flow-top">
        <div class="flow-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((stage.at / stage.of) * 100)}>
          <i style={`width:${Math.round((stage.at / stage.of) * 100)}%`} />
        </div>
        {props.close ? (
          <a href={props.close} class="flow-close" aria-label={t("ปิด", "Close")}>
            ✕
          </a>
        ) : null}
      </div>
      {props.error ? <div class="flow-error">{props.error}</div> : null}
      {Object.entries(props.hidden ?? {}).map(([k, val]) => (
        <input type="hidden" name={k} value={val} />
      ))}
      <div class="flow-steps">{props.children}</div>
      <div class="flow-bar">
        <button type="button" class="btn ghost flow-back" hidden aria-label={t("ย้อนกลับ", "Back")}>
          ←
        </button>
        <button type="submit" class="btn primary flow-next">
          {props.submit}
        </button>
        {props.extra}
      </div>
      <script dangerouslySetInnerHTML={{ __html: FLOW_JS }} />
    </form>
  );
}

/** Big tappable answer card (radio). */
export function AnswerCard(props: { name: string; value: string; label: string; emoji?: string; badge?: string; checked?: boolean; required?: boolean }) {
  return (
    <label class="answer">
      <input type="radio" name={props.name} value={props.value} checked={props.checked} required={props.required} />
      <span>
        {props.emoji ? (
          <b class="answer-emoji" aria-hidden="true">
            {props.emoji}
          </b>
        ) : null}
        {props.badge ? (
          <b class="answer-badge" aria-hidden="true">
            {props.badge}
          </b>
        ) : null}
        {props.label}
      </span>
    </label>
  );
}

/**
 * Runs once per form (the script tag sits inside the form it drives).
 * Kept small and dependency-free; ES5-ish so old Android WebViews cope.
 */
const FLOW_JS = `(function(){
var s=document.currentScript,f=s&&s.closest("form.flow");if(!f||f.dataset.ready)return;f.dataset.ready="1";
var steps=[].slice.call(f.querySelectorAll(".flow-step"));if(steps.length<1)return;
f.classList.add("is-js");
var back=f.querySelector(".flow-back"),next=f.querySelector(".flow-next"),bar=f.querySelector(".flow-progress i"),pb=f.querySelector(".flow-progress");
var at=+f.dataset.stageAt||0,of=+f.dataset.stageOf||1,i=0,busy=0;
var reduce=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
i=Math.max(0,Math.min(steps.length-1,+f.dataset.start||0));
function show(n,dir,push){
  n=Math.max(0,Math.min(steps.length-1,n));
  steps.forEach(function(st,j){st.classList.remove("on","in-f","in-b");st.hidden=j!==n;st.setAttribute("aria-hidden",j!==n?"true":"false")});
  var st=steps[n];if(!reduce&&dir)st.classList.add(dir>0?"in-f":"in-b");st.classList.add("on");
  i=n;back.hidden=n===0;
  var last=n===steps.length-1,auto=st.dataset.auto==="1",picked=!!st.querySelector("input[type=radio]:checked");
  next.textContent=last?f.dataset.done:(st.dataset.cta||(auto&&!picked&&!st.querySelector("[required]")?f.dataset.skip:f.dataset.next));next.classList.toggle("ghost",auto&&!last);next.classList.toggle("primary",!(auto&&!last));
  var pct=Math.round(((at+(n+1)/steps.length)/of)*100);if(bar)bar.style.width=pct+"%";if(pb)pb.setAttribute("aria-valuenow",pct);
  if(push&&history.pushState)history.pushState({flow:n},"");
  var h=st.querySelector(".flow-title");if(h&&dir){h.setAttribute("tabindex","-1");h.focus({preventScroll:true});}
  if(dir)window.scrollTo(0,0);
}
function valid(st){
  var els=[].slice.call(st.querySelectorAll("input,select,textarea"));
  for(var k=0;k<els.length;k++){if(!els[k].checkValidity()){els[k].reportValidity();return false}}
  var need=+(st.dataset.need||0),sum=+(st.dataset.sum||0),msg=st.querySelector(".flow-need");
  function fail(){if(msg){msg.textContent=st.dataset.needText||"";msg.hidden=false}st.classList.remove("shake");void st.offsetWidth;st.classList.add("shake");return false}
  if(need&&st.querySelectorAll("input:checked").length<need)return fail();
  if(sum){var tot=0;[].forEach.call(st.querySelectorAll("input[type=number]"),function(x){tot+=+x.value||0});if(tot!==0&&tot!==sum)return fail()}
  if(st.dataset.allOrNone==="1"){var sel=st.querySelectorAll("select"),set=0;[].forEach.call(sel,function(x){if(x.value)set++});if(set&&set<sel.length)return fail()}
  if(msg)msg.hidden=true;return true;
}
function go(){if(busy)return;if(!valid(steps[i]))return;if(i<steps.length-1)show(i+1,1,true);else submit()}
function submit(){busy=1;next.disabled=true;next.classList.add("is-busy");if(f.requestSubmit)f.requestSubmit();else f.submit()}
f.addEventListener("submit",function(e){if(busy)return;if(e.submitter&&e.submitter!==next)return;if(i<steps.length-1){e.preventDefault();go()}else if(!valid(steps[i])){e.preventDefault()}else{busy=1;next.classList.add("is-busy")}});
back.addEventListener("click",function(){if(history.state&&typeof history.state.flow==="number")history.back();else show(i-1,-1,false)});
window.addEventListener("popstate",function(e){var n=e.state&&typeof e.state.flow==="number"?e.state.flow:0;if(n!==i)show(n,n>i?1:-1,false)});
f.addEventListener("change",function(e){
  var st=steps[i];if(!st||st.dataset.auto!=="1"||e.target.type!=="radio"||!st.contains(e.target))return;
  setTimeout(function(){if(steps[i]!==st)return;if(i<steps.length-1)show(i+1,1,true);else if(f.dataset.autosubmit==="1")submit()},reduce?60:220);
});
if(history.replaceState)history.replaceState({flow:i},"");
show(i,0,false);
})();`;
