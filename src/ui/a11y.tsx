/**
 * Accessibility menu: light (the default) / dark / automatic appearance, text size, high
 * contrast, reduced motion, a more readable font and underlined links. Choices live in localStorage on this
 * device ("bkk-a11y") and become classes on <html> before first paint
 * (A11Y_HEAD_JS), so pages never flash the default look.
 */
import type { T } from "../lib/i18n";

const KEY = "bkk-a11y";
const FLAGS = ["contrast", "motion", "readable", "links", "touch", "wide", "spacing"] as const;

/** Read the saved choices (migrating the old Aa "bkk-text" switch). Shared by both scripts. */
const READ = `function rd(){try{var s=JSON.parse(localStorage.getItem("${KEY}")||"null");if(s&&typeof s==="object")return s;return localStorage.getItem("bkk-text")==="big"?{size:"large"}:{}}catch(e){return{}}}`;
const APPLY = `function ap(s){var d=document.documentElement,c=d.classList,tt=s.theme||"light",th=tt==="light"||tt==="dark"?tt:null;if(th)d.setAttribute("data-theme",th);else d.removeAttribute("data-theme");document.querySelectorAll("meta[name=theme-color]").forEach(function(m){var o=m.getAttribute("data-media");m.setAttribute("media",th?(th===m.getAttribute("data-scheme")?"all":"not all"):o)});c.toggle("a11y-small",s.size==="small");c.toggle("a11y-large",s.size==="large");c.toggle("a11y-xl",s.size==="xl");${JSON.stringify(FLAGS)}.forEach(function(k){c.toggle("a11y-"+k,!!s[k])})}`;

/** Inline in <head>: apply saved choices before the page paints. */
export const A11Y_HEAD_JS = `(function(){${READ}${APPLY}ap(rd())})()`;

/** Inline at the end of <body>: wire the menu's controls. */
export const A11Y_MENU_JS = `(function(){${READ}${APPLY}
var s=rd(),menu=document.getElementById("a11y");if(!menu)return;
var inputs=menu.querySelectorAll("[data-a11y]");
function sync(){inputs.forEach(function(i){var k=i.dataset.a11y;i.checked=i.type==="radio"?(s[k]||i.dataset.default)===i.value:!!s[k]})}
function save(){try{localStorage.setItem("${KEY}",JSON.stringify(s));localStorage.removeItem("bkk-text")}catch(e){}ap(s)}
inputs.forEach(function(i){i.addEventListener("change",function(){if(i.type==="radio")s[i.dataset.a11y]=i.value;else s[i.dataset.a11y]=i.checked;save()})});
var reset=menu.querySelector("[data-a11y-reset]");if(reset)reset.addEventListener("click",function(){s={};save();sync()});
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&menu.open){menu.open=false;menu.querySelector("summary").focus()}});
document.addEventListener("click",function(e){if(menu.open&&!menu.contains(e.target))menu.open=false});
sync()})()`;

export function A11yIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="4.5" r="1.8" fill="currentColor" stroke="none" />
      <path d="M5 8.5c2.2.8 4.5 1.2 7 1.2s4.8-.4 7-1.2M12 9.7v4.6m0 0-3 6.2m3-6.2 3 6.2" />
    </svg>
  );
}

export function A11yMenu(props: { t: T; class?: string }) {
  const { t } = props;
  const sizes: [string, string, string][] = [
    ["small", t("เล็ก", "Small"), ".85rem"],
    ["normal", t("ปกติ", "Normal"), "1rem"],
    ["large", t("ใหญ่", "Large"), "1.2rem"],
    ["xl", t("ใหญ่มาก", "Largest"), "1.4rem"],
  ];
  const themes: [string, string, string][] = [
    ["auto", t("อัตโนมัติ", "Auto"), "◐"],
    ["light", t("สว่าง", "Light"), "☀"],
    ["dark", t("มืด", "Dark"), "☾"],
  ];
  const flags: [(typeof FLAGS)[number], string, string][] = [
    ["contrast", t("คอนทราสต์สูง", "High contrast"), t("ตัวหนังสือเข้มขึ้น เส้นขอบชัดขึ้น", "Darker text and stronger outlines")],
    ["motion", t("ลดการเคลื่อนไหว", "Reduce motion"), t("หยุดแอนิเมชันและข่าววิ่ง", "Stops animations and the scrolling ticker")],
    ["readable", t("ฟอนต์อ่านง่าย", "Easy-read font"), t("ฟอนต์ชัดขึ้น ระยะห่างกว้างขึ้น", "Clearer letters and wider spacing")],
    ["links", t("ขีดเส้นใต้ลิงก์", "Underline links"), t("เห็นลิงก์ได้โดยไม่ต้องดูสี", "Spot links without relying on colour")],
    ["touch", t("ปุ่มใหญ่ขึ้น", "Bigger buttons"), t("กดง่ายขึ้น ทุกมือใช้สะดวก", "Easier to tap, for any hands")],
    ["spacing", t("ระยะบรรทัดกว้าง", "More line spacing"), t("อ่านสบายตาขึ้น", "Easier to follow lines of text")],
    ["wide", t("หน้ากว้างบนจอใหญ่", "Wider pages on big screens"), t("ใช้พื้นที่จอแล็ปท็อปเต็มขึ้น", "Use more of a laptop screen")],
  ];
  return (
    <details class={`a11y ${props.class ?? ""}`.trim()} id="a11y">
      <summary aria-label={t("การช่วยการเข้าถึง", "Accessibility")} title={t("การช่วยการเข้าถึง", "Accessibility")}>
        <A11yIcon />
      </summary>
      <div class="a11y-panel" role="group" aria-labelledby="a11y-h">
        <p class="a11y-h" id="a11y-h">
          {t("การช่วยการเข้าถึง", "Accessibility")}
        </p>
        <fieldset class="a11y-size">
          <legend>{t("ธีมสี", "Appearance")}</legend>
          <div>
            {themes.map(([value, text, mark]) => (
              <label>
                <input type="radio" name="a11y-theme" value={value} data-a11y="theme" data-default="light" checked={value === "light"} />
                <span>
                  <b style="font-size:1.2rem" aria-hidden="true">
                    {mark}
                  </b>
                  {text}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset class="a11y-size">
          <legend>{t("ขนาดตัวอักษร", "Text size")}</legend>
          <div>
            {sizes.map(([value, text, size]) => (
              <label>
                <input type="radio" name="a11y-size" value={value} data-a11y="size" data-default="normal" checked={value === "normal"} />
                <span>
                  <b style={`font-size:${size}`} aria-hidden="true">
                    {t("ก", "Aa")}
                  </b>
                  {text}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {flags.map(([key, text, hint]) => (
          <label class="a11y-row">
            <span>
              {text}
              <small>{hint}</small>
            </span>
            <input type="checkbox" role="switch" data-a11y={key} />
          </label>
        ))}
        <div class="a11y-foot">
          <small>{t("บันทึกไว้ในเครื่องนี้เท่านั้น", "Saved on this device only")}</small>
          <button type="button" class="a11y-reset" data-a11y-reset="">
            {t("รีเซ็ต", "Reset")}
          </button>
        </div>
        <noscript>
          <small>{t("ต้องเปิด JavaScript เพื่อใช้ตัวเลือกเหล่านี้", "These options need JavaScript turned on.")}</small>
        </noscript>
      </div>
    </details>
  );
}

/**
 * Form safety nets: a Caps Lock note under password fields; "you have
 * unsaved changes" before leaving a form marked data-guard (Edit profile;
 * window.jgGuard adds forms that arrive later and resets one after an in-place save);
 * and when the browser refuses a form (required, pattern, min/max), each
 * failing field is marked aria-invalid so screen readers say so, cleared as
 * soon as the value is fixed (WCAG 3.3.1).
 */
export const A11Y_FORM_JS = `(function(){
function caps(e){var f=e.target;if(!f||!f.closest)return;var w=f.closest(".field");w=w&&w.querySelector(".caps-warn");if(!w)return;w.hidden=e.type==="blur"||!(e.getModifierState&&e.getModifierState("CapsLock"))}
["keydown","keyup"].forEach(function(t){document.addEventListener(t,function(e){if(e.target&&e.target.closest&&e.target.closest(".pw,.field")&&e.target.matches("input"))caps(e)},true)});
document.addEventListener("blur",function(e){if(e.target&&e.target.matches&&e.target.matches("input"))caps(e)},true);
var guarded=[];function guard(f){if(f._g)return f._g;var g={f:f,start:snap(f),sent:false,always:f.getAttribute("data-guard")==="dirty"};f._g=g;guarded.push(g);f.addEventListener("submit",function(){g.sent=true});return g}
document.querySelectorAll("form[data-guard]").forEach(guard);
function snap(f){var a=[];new FormData(f).forEach(function(v,k){a.push(k+"="+(typeof v==="string"?v:v.name+":"+v.size))});return a.join("&")}
window.jgGuard={add:guard,reset:function(f){var g=guard(f);g.start=snap(f);g.sent=false;g.always=f.getAttribute("data-guard")==="dirty"},drop:function(f){guarded=guarded.filter(function(g){return g.f!==f});f._g=null},dirty:function(f){var g=f._g;return !!g&&!g.sent&&(g.always||snap(f)!==g.start)}};
addEventListener("pageshow",function(){guarded.forEach(function(g){g.sent=false})});
addEventListener("beforeunload",function(e){if(guarded.some(function(g){return !g.sent&&(g.always||snap(g.f)!==g.start)})){e.preventDefault();e.returnValue=""}});
document.addEventListener("invalid",function(e){var f=e.target;if(f&&f.setAttribute)f.setAttribute("aria-invalid","true")},true);document.addEventListener("input",function(e){var f=e.target;if(f&&f.getAttribute&&f.getAttribute("aria-invalid")==="true"&&f.checkValidity&&f.checkValidity())f.removeAttribute("aria-invalid")},true)})()`;
