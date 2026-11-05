/**
 * "Lock the app with Face ID or fingerprint" (owner: "Lock on app open"). Shown on Me only inside
 * the Jurrgun phone app; the app keeps the setting on the phone and does the asking, so nothing
 * here touches the server. Same look as the notifications switch.
 */
import { Script } from "./kit";
type T = (th: string, en: string) => string;

export function AppLockSwitch(props: { t: T }) {
  const { t } = props;
  const text = {
    off: t("ถามทุกครั้งที่เปิดแอป หรือกลับมาหลังออกไปเกิน 1 นาที", "Asks each time you open the app, or come back after a minute away"),
    on: t("เปิดอยู่บนเครื่องนี้ แตะเพื่อปิด", "On for this phone. Tap to turn off."),
    none: t("ตั้งค่าสแกนใบหน้าหรือลายนิ้วมือในเครื่องก่อน", "Set up Face ID or fingerprint on this phone first"),
    failed: t("ยังไม่ได้เปลี่ยน ลองใหม่อีกครั้ง", "Nothing changed. Try again."),
  };
  return (
    <>
      <div class="push-switch" id="app-lock" data-text={JSON.stringify(text)} hidden>
        <button type="button" class="qs" aria-pressed="false" aria-describedby="app-lock-hint app-lock-why">
          <span aria-hidden="true">🔒</span>
          <span>
            <b>{t("ล็อกแอปด้วยใบหน้าหรือลายนิ้วมือ", "Lock the app with Face ID or fingerprint")}</b>
            <small id="app-lock-hint" aria-live="polite">
              {text.off}
            </small>
            <small id="app-lock-why">{t("ใบหน้าและลายนิ้วมือของคุณอยู่ในเครื่องเท่านั้น Jurrgun ได้แค่คำตอบว่าผ่านหรือไม่ผ่าน", "Your face and fingerprint stay on your phone. Jurrgun only learns whether it matched.")}</small>
          </span>
          <span class="sw" aria-hidden="true" />
        </button>
      </div>
      <Script dangerouslySetInnerHTML={{ __html: APP_LOCK_JS }} />
    </>
  );
}

export const APP_LOCK_JS = `(function(){var f=document.getElementById("app-lock");if(!f||!/JurrgunApp/.test(navigator.userAgent)||!window.ReactNativeWebView)return;
var T=JSON.parse(f.dataset.text),b=f.querySelector("button"),hint=f.querySelector("small"),on=false;
function say(s,v){hint.textContent=s;b.setAttribute("aria-pressed",v?"true":"false")}
addEventListener("jurrgun-lock",function(e){var d=e.detail||{};f.hidden=false;b.disabled=!d.available;on=!!d.on;say(!d.available?T.none:d.ok===false?T.failed:on?T.on:T.off,on)});
b.addEventListener("click",function(){b.disabled=true;window.ReactNativeWebView.postMessage(JSON.stringify({type:"jurrgun-lock",on:!on}))});
window.ReactNativeWebView.postMessage(JSON.stringify({type:"jurrgun-lock"}))})()`;
