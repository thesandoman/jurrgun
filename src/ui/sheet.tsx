/**
 * One Sheet for "more" actions (finalize review B2, owner 2026-10-16).
 *
 * Phones: a bottom sheet over a scrim. Laptops (1024px and up): a small
 * popover anchored to its trigger, no scrim. It is a plain <details>, so it
 * opens and closes without JS (the scrim is the summary's own ::before on
 * phones, so tapping it closes the sheet).
 *
 * With JS (SHEET_JS, loaded in <head>):
 *  - the panel is lifted into the top layer (popover="manual"), so no card,
 *    tile or overflow can clip it or tuck it under the tab bar;
 *  - focus moves into the panel, Tab is trapped while it is modal (phones),
 *    Escape or ✕ or the scrim closes it and focus goes back to the trigger
 *    (data-sheet-trap keeps Tab inside on laptops too, for a sheet holding a form);
 *  - on laptops a click outside closes it, it flips above its trigger when
 *    there is more room there, and it is never taller than the room on its
 *    side of the trigger (it scrolls inside instead);
 *  - it moves on the shared spring (jgMotion, damping 1, no overshoot) and
 *    simply appears when reduced motion is on;
 *  - any element with data-sheet-hold opens the first sheet inside it on a
 *    long press (chat bubbles).
 *
 * Never put a Sheet inside a <form>: its panel holds forms of its own.
 */
import type { Child } from "hono/jsx";
import type { T } from "../lib/i18n";

export function Sheet(props: {
  t: T;
  /** The panel's heading, also its accessible name. */
  title: string;
  /** What the trigger shows (a ⋯, a +, or a whole switch row). */
  trigger: Child;
  triggerClass?: string;
  /** The trigger's accessible name when it shows only a symbol. */
  triggerLabel?: string;
  class?: string;
  /** Open on load (for example after a form error inside it). */
  open?: boolean;
  /** Laptop popover: line up with the trigger's right edge (default) or left edge. */
  align?: "end" | "start";
  /** Keep Tab inside the panel on laptops too (a form being edited), not only while it is modal on phones. */
  trap?: boolean;
  /** An id for the details, so a script can find this sheet. */
  id?: string;
  children: Child;
}) {
  const { t } = props;
  const cls = ["sheet", props.align === "start" ? "sheet-start" : "", props.class ?? ""].filter(Boolean).join(" ");
  return (
    <details class={cls} id={props.id} data-sheet="" data-sheet-trap={props.trap ? "" : undefined} open={props.open}>
      <summary class={props.triggerClass} aria-label={props.triggerLabel} aria-haspopup="dialog">
        {props.trigger}
      </summary>
      <div class="sheet-panel" role="dialog" aria-label={props.title} tabindex={-1}>
        <div class="sheet-head">
          <strong>{props.title}</strong>
          <button type="button" class="sheet-x" data-sheet-close="" aria-label={t("ปิด", "Close")}>
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div class="sheet-body">{props.children}</div>
      </div>
    </details>
  );
}

/**
 * Where the laptop popover goes (plain function, also run by the tests). `s` is the trigger's rect,
 * `w` and `h` the panel's full size, `W` and `H` the viewport. It opens below the trigger, or above
 * it when the panel does not fit below and there is more room above, and its height is capped at the
 * room on that side (8px from the viewport edge, 6px from the trigger), so it scrolls inside instead
 * of running off the screen.
 */
export const SHEET_PLACE_JS = `function sheetPlace(s,w,h,W,H,start){var M=8,G=6,left=start?s.left:s.right-w;left=Math.max(M,Math.min(W-w-M,left));
var below=H-s.bottom-G-M,above=s.top-G-M,up=h>below&&above>below,room=Math.max(0,up?above:below),cap=Math.min(h,room);
return{left:left,top:up?s.top-G-cap:s.bottom+G,maxHeight:room,up:up}}`;

/** Classic script, after SPRING_JS. Event delegation only, so content swapped in later (chat) works too. */
export const SHEET_JS = `(function(){${SHEET_PLACE_JS}
var D=document,R=D.documentElement;R.classList.add("sheet-js");
var mq=matchMedia("(max-width:1023px)"),cur=null,anim=null,held=false;
function M(){return window.jgMotion}
function still(){var m=M();return !m||m.still()}
function up(p){try{return p.matches(":popover-open")}catch(e){return false}}
function panelOf(d){return d.querySelector(":scope>.sheet-panel")}
function focusables(p){return [].slice.call(p.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select,textarea,summary,[tabindex]:not([tabindex="-1"])')).filter(function(e){return e.offsetParent!==null||e===D.activeElement})}
function place(d){var p=panelOf(d);if(!p||d.classList.contains("modal")||!up(p))return;var s=d.querySelector(":scope>summary").getBoundingClientRect(),h=p.scrollHeight+(p.offsetHeight-p.clientHeight);
var x=sheetPlace(s,p.offsetWidth,h,innerWidth,innerHeight,d.classList.contains("sheet-start"));p.style.maxHeight=x.maxHeight+"px";p.style.left=x.left+"px";p.style.top=x.top+"px";d.classList.toggle("sheet-up",x.up)}
function lift(d){var p=panelOf(d);if(!p)return;var modal=mq.matches;d.classList.toggle("modal",modal);d.classList.add("lifted");p.setAttribute("aria-modal",modal?"true":"false");if(modal){p.style.maxHeight="";p.style.left="";p.style.top=""}
if(p.showPopover){try{p.setAttribute("popover","manual");p.showPopover()}catch(e){}}
place(d);cur=d;var f=focusables(p).filter(function(e){return !e.hasAttribute("data-sheet-close")})[0]||p;try{f.focus({preventScroll:true})}catch(e){}
if(anim)anim.stop();if(still())return;
if(modal){var h=p.offsetHeight;p.style.transform="translate3d(0,"+h+"px,0)";anim=M().spring({from:h,to:0,damping:1,response:0.35,onUpdate:function(x){p.style.transform="translate3d(0,"+x+"px,0)"},onDone:function(){p.style.transform=""}})}
else{p.style.opacity="0";anim=M().spring({from:8,to:0,damping:1,response:0.25,onUpdate:function(x){p.style.transform="translate3d(0,"+(-x)+"px,0)";p.style.opacity=String(1-x/8)},onDone:function(){p.style.transform="";p.style.opacity=""}})}}
function open(d){if(cur&&cur!==d)shut(cur,true);if(!d.open)d.open=true;lift(d)}
function done(d,back){var p=panelOf(d);if(p){p.style.transform="";p.style.opacity="";p.style.maxHeight="";p.style.left="";p.style.top="";if(p.hidePopover&&up(p))try{p.hidePopover()}catch(e){}}
var had=p&&p.contains(D.activeElement);d.open=false;d.classList.remove("lifted","modal","sheet-up");if(cur===d)cur=null;if(back||had){var s=d.querySelector(":scope>summary");s&&s.focus({preventScroll:true})}}
function shut(d,quick,back){var p=panelOf(d);if(anim){anim.stop();anim=null}
if(quick||still()||!p||!d.classList.contains("modal")){done(d,back);return}
var h=p.offsetHeight;anim=M().spring({from:0,to:h,damping:1,response:0.3,onUpdate:function(x){p.style.transform="translate3d(0,"+x+"px,0)"},onDone:function(){anim=null;done(d,back)}})}
D.addEventListener("click",function(e){var t=e.target;if(held){held=false;e.preventDefault();e.stopPropagation();return}
var x=t.closest&&t.closest("[data-sheet-close]");if(x){var dx=x.closest("details.sheet");if(dx){e.preventDefault();shut(dx,false,true)}return}
var s=t.closest&&t.closest("details.sheet>summary");if(s){var d=s.parentElement;e.preventDefault();if(d.open&&d.classList.contains("lifted"))shut(d,false,true);else open(d);return}
if(cur){var p=panelOf(cur);if(t===p&&cur.classList.contains("modal")){var r=p.getBoundingClientRect();if(e.clientY<r.top){shut(cur,false,true)}return}
if(!cur.contains(t))shut(cur,true)}});
D.addEventListener("keydown",function(e){if(!cur)return;var p=panelOf(cur);
if(e.key==="Escape"){e.preventDefault();shut(cur,false,true);return}
if(e.key==="Tab"&&(cur.classList.contains("modal")||cur.hasAttribute("data-sheet-trap"))&&p){var f=focusables(p);if(!f.length){e.preventDefault();return}var a=f[0],z=f[f.length-1];
if(!p.contains(D.activeElement)){e.preventDefault();a.focus()}else if(e.shiftKey&&D.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&D.activeElement===z){e.preventDefault();a.focus()}}});
addEventListener("scroll",function(){if(cur)place(cur)},{passive:true});addEventListener("resize",function(){if(cur)place(cur)});
var hold=null;D.addEventListener("pointerdown",function(e){held=false;var h=e.target.closest&&e.target.closest("[data-sheet-hold]");if(!h||e.pointerType==="mouse"||e.target.closest("details.sheet"))return;
var x0=e.clientX,y0=e.clientY;hold={x:x0,y:y0,id:setTimeout(function(){var d=h.querySelector("details.sheet");hold=null;if(d){var m=M();m&&m.tick();held=true;open(d)}},500)}});
function cancel(e){if(!hold)return;if(e.type==="pointermove"&&Math.abs(e.clientX-hold.x)<10&&Math.abs(e.clientY-hold.y)<10)return;clearTimeout(hold.id);hold=null}
D.addEventListener("pointermove",cancel);D.addEventListener("pointerup",cancel);D.addEventListener("pointercancel",cancel);
D.addEventListener("contextmenu",function(e){if(e.target.closest&&e.target.closest("[data-sheet-hold]")&&matchMedia("(hover:none)").matches)e.preventDefault()});
window.jgSheet={open:open,shut:shut};
D.addEventListener("DOMContentLoaded",function(){var d=D.querySelector("details.sheet[open]");if(d)lift(d)})})();`;
