/**
 * "Notifications on this phone": the Web Push switch, on Me and on the
 * Notifications page. The server only knows the key; the script reads this
 * browser's own state, so no device information is sent until the member
 * says yes.
 *
 * Why the script is shaped this way:
 *   - Safari only shows the permission prompt when it is asked straight from
 *     the tap, so requestPermission() runs first in the click handler, before
 *     any other promise.
 *   - The switch works even if the service worker is not ready yet: it
 *     registers /sw.js itself and waits for it.
 *   - Browsers that cannot do push (in-app browsers such as LINE's, iPhone
 *     Safari before Add to Home Screen) still show the switch, switched off,
 *     with what to do instead, so it never just disappears.
 */
type T = (th: string, en: string) => string;

export function PushSwitch(props: { t: T; publicKey: string; card?: boolean }) {
  const { t } = props;
  const text = {
    off: t("เตือนก่อนวันงาน และตอนเลือกคนที่อยากเจออีก", "Day-before and meet-again reminders"),
    on: t("เปิดอยู่บนเครื่องนี้ แตะเพื่อปิด", "On for this phone. Tap to turn off."),
    blocked: t(
      "ถูกบล็อกไว้ Android: แตะไอคอนแม่กุญแจข้างที่อยู่เว็บ แล้วอนุญาตการแจ้งเตือน iPhone: การตั้งค่า > การแจ้งเตือน > Jurrgun",
      "Blocked. Android: tap the lock by the web address, then allow Notifications. iPhone: Settings > Notifications > Jurrgun.",
    ),
    ios: t("บน iPhone ให้แตะปุ่มแชร์ แล้วเลือก \"เพิ่มไปยังหน้าจอโฮม\" จากนั้นเปิด Jurrgun จากหน้าจอโฮม", "On iPhone, tap Share, then Add to Home Screen, and open Jurrgun from there."),
    browser: t("เบราว์เซอร์นี้ส่งการแจ้งเตือนไม่ได้ เปิด Jurrgun ใน Chrome หรือ Safari", "This browser can't show notifications. Open Jurrgun in Chrome or Safari."),
    working: t("กำลังเปิด…", "Switching on…"),
    failed: t("เปิดไม่สำเร็จ ลองใหม่อีกครั้ง", "Couldn't switch on. Try again."),
  };
  return (
    <>
      <div class={props.card ? "push-switch push-card" : "push-switch"} data-key={props.publicKey} data-text={JSON.stringify(text)} id="push">
        <button type="button" class="qs" aria-pressed="false" aria-describedby="push-hint">
          <span aria-hidden="true">🔔</span>
          <span>
            <b>{t("แจ้งเตือนบนเครื่องนี้", "Notifications on this phone")}</b>
            <small id="push-hint" aria-live="polite">
              {text.off}
            </small>
            <small class="reminder-note">{t("เปิดแล้ว การเตือนกิจกรรมจะเปิดให้ด้วย", "Switching this on also turns on event reminders.")}</small>
          </span>
          <span class="sw" aria-hidden="true" />
        </button>
      </div>
      <script dangerouslySetInnerHTML={{ __html: PUSH_SWITCH_JS }} />
    </>
  );
}

const PUSH_SWITCH_JS = `(function(){var f=document.getElementById("push");if(!f)return;
var T=JSON.parse(f.dataset.text),b=f.querySelector("button"),hint=f.querySelector("small"),sub=null;
function say(s,on){hint.textContent=s;b.setAttribute("aria-pressed",on?"true":"false")}
var standalone=navigator.standalone||matchMedia("(display-mode: standalone)").matches;
var ios=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
var can="serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;
if(!can){b.disabled=true;say(ios&&!standalone?T.ios:T.browser,false);return}
function reg(){return navigator.serviceWorker.getRegistration().then(function(r){return r||navigator.serviceWorker.register("/sw.js")}).then(function(){return navigator.serviceWorker.ready})}
function key(s){s=s.replace(/-/g,"+").replace(/_/g,"/");var r=atob(s+"===".slice((s.length+3)%4)),a=new Uint8Array(r.length);for(var i=0;i<r.length;i++)a[i]=r.charCodeAt(i);return a}
function post(u,d){return fetch(u,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(d),credentials:"same-origin"}).then(function(r){if(!r.ok)throw r})}
function refresh(){if(Notification.permission==="denied"){sub=null;say(T.blocked,false);return}
reg().then(function(r){return r.pushManager.getSubscription()}).then(function(s){sub=s;say(s?T.on:T.off,!!s)}).catch(function(){})}
refresh();
document.addEventListener("visibilitychange",function(){if(!document.hidden)refresh()});
b.addEventListener("click",function(){
  if(sub){var s=sub;b.disabled=true;post("/settings/push/off",{endpoint:s.endpoint}).catch(function(){}).then(function(){return s.unsubscribe()}).then(function(){sub=null;say(T.off,false)}).catch(function(){say(T.failed,true)}).then(function(){b.disabled=false});return}
  /* Asked first, straight from the tap: Safari ignores a prompt asked later. */
  var asked=Notification.permission==="granted"?Promise.resolve("granted"):new Promise(function(res){var r=Notification.requestPermission(res);if(r&&r.then)r.then(res)});
  b.disabled=true;say(T.working,false);
  asked.then(function(p){if(p!=="granted"){say(p==="denied"?T.blocked:T.off,false);return}
    return reg().then(function(r){return r.pushManager.getSubscription().then(function(s){return s||r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key(f.dataset.key)})})})
    .then(function(s){return post("/settings/push",s.toJSON()).then(function(){sub=s;say(T.on,true)})})
  }).catch(function(){say(T.failed,false)}).then(function(){b.disabled=false})
})})()`;
