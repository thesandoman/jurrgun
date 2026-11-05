/**
 * "Put Jurrgun on your home screen" (Mobile App card M2, owner: "Quiet line
 * on Me"). One quiet card under Your next table, and nothing else: no
 * badge, no banner, no repeat once it is dismissed.
 *
 * Shown only when all of these hold (the server renders it hidden, only when
 * the member has an upcoming booking; this script decides the rest):
 *   - Jurrgun isn't already running installed (home-screen app, or the
 *     Jurrgun phone app, whose web view says "JurrgunApp" in its user agent);
 *   - "Don't show again" hasn't been tapped on this phone (localStorage);
 *   - Android/Chrome: the browser offered to install (beforeinstallprompt),
 *     so the button really installs. It hides once installed;
 *   - iPhone: only when no notifications switch is on the page, because that
 *     switch already shows the same Add to Home Screen steps on iPhone.
 */
import { Script } from "./kit";

type T = (th: string, en: string) => string;

export const INSTALL_DISMISS_KEY = "jg-install-line-off";

export function InstallLine(props: { t: T }) {
  const { t } = props;
  return (
    <>
      <div class="card me-ask install-line" id="install-line" hidden>
        <p>
          <strong data-for="android">
            📲 {t("เพิ่ม Jurrgun ไว้ที่หน้าจอโฮม เปิดดูโต๊ะของคุณได้ในแตะเดียว", "Put Jurrgun on your home screen, so your table is one tap away.")}
          </strong>
          <strong data-for="ios" hidden>
            📲{" "}
            {t(
              "บน iPhone แตะปุ่มแชร์ แล้วเลือก \"เพิ่มไปยังหน้าจอโฮม\" การเตือนก่อนวันงานใช้ได้เมื่อเปิดจากหน้าจอโฮมเท่านั้น",
              "On iPhone, tap Share, then Add to Home Screen. Day-before reminders only work from there.",
            )}
          </strong>
        </p>
        <div class="row">
          <button type="button" class="btn ghost" data-act="off">
            {t("ไม่ต้องแสดงอีก", "Don't show again")}
          </button>
          <button type="button" class="btn primary" data-act="add" data-for="android">
            {t("เพิ่มไปยังหน้าจอโฮม", "Add to home screen")}
          </button>
        </div>
      </div>
      <Script dangerouslySetInnerHTML={{ __html: INSTALL_LINE_JS }} />
    </>
  );
}

export const INSTALL_LINE_JS = `(function(){var box=document.getElementById("install-line");if(!box)return;
var KEY=${JSON.stringify(INSTALL_DISMISS_KEY)};
function get(){try{return localStorage.getItem(KEY)}catch(e){return null}}
function set(){try{localStorage.setItem(KEY,"1")}catch(e){}}
var installed=(window.matchMedia&&matchMedia("(display-mode: standalone)").matches)||navigator.standalone===true||/JurrgunApp/.test(navigator.userAgent);
if(installed||get())return;
var ios=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
function only(which){[].forEach.call(box.querySelectorAll("[data-for]"),function(x){x.hidden=x.getAttribute("data-for")!==which})}
function hide(){box.hidden=true}
box.querySelector("[data-act=off]").addEventListener("click",function(){set();hide()});
/* The notifications switch sits further down Me, so look for it once the page has loaded. */
if(ios){var check=function(){if(document.getElementById("push"))return;only("ios");box.hidden=false};if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",check);else check();return}
var offer=null;
addEventListener("beforeinstallprompt",function(e){e.preventDefault();offer=e;only("android");box.hidden=false});
addEventListener("appinstalled",function(){set();hide()});
box.querySelector("[data-act=add]").addEventListener("click",function(){if(!offer)return;var o=offer;offer=null;o.prompt();(o.userChoice||Promise.resolve({})).then(function(r){if(r&&r.outcome==="accepted"){set();hide()}}).catch(function(){})});
})();`;
