/**
 * The dating safety net (/safety). Public, short and tap-first:
 *  - one-tap calls to the emergency and help lines (HELPLINES in content/learn.ts);
 *  - "share my date plan": who, where, when and back-by, sent to someone you
 *    trust through the phone's own share sheet, LINE or SMS. The plan never
 *    touches our server: it is put together in the browser;
 *  - a seven-line checklist (SAFETY_TIPS in content/dating.ts);
 *  - report and block, always available.
 */
import { Hono } from "hono";
import type { AppEnv } from "../lib/env";
import { L } from "../lib/i18n";
import { HELPLINES } from "../content/learn";
import { SAFETY_TIPS } from "../content/dating";
import { Card, page, view } from "../ui/kit";

export const safetyRoutes = new Hono<AppEnv>();

/** Lines worth one tap on a date, with a short label for the button. */
const DATE_LINES: [string, { en: string; th: string }][] = [
  ["191", { en: "Police", th: "ตำรวจ" }],
  ["1669", { en: "Ambulance", th: "รถพยาบาล" }],
  ["1300", { en: "Harassment", th: "ถูกคุกคาม" }],
  ["1441", { en: "Scams", th: "มิจฉาชีพ" }],
  ["1155", { en: "Tourist police", th: "ตำรวจท่องเที่ยว" }],
];

const SHARE_JS = `(function(){
var f=document.getElementById("plan");if(!f)return;
function msg(){var g=function(n){return (f.elements[n].value||"").trim()};
return f.dataset.tpl.replace("{who}",g("who")||"?").replace("{where}",g("where")||"?").replace("{when}",g("when")||"?").replace("{back}",g("back")||"?")}
f.querySelector("[data-act=share]").addEventListener("click",function(){var m=msg();if(navigator.share){navigator.share({text:m}).catch(function(){})}else if(navigator.clipboard){navigator.clipboard.writeText(m);this.textContent="✓"}});
f.querySelector("[data-act=line]").addEventListener("click",function(){location.href="https://line.me/R/msg/text/?"+encodeURIComponent(msg())});
f.querySelector("[data-act=sms]").addEventListener("click",function(){location.href="sms:?&body="+encodeURIComponent(msg())});
})();`;

safetyRoutes.get("/safety", (c) => {
  const { t, lang } = view(c);
  // Only numbers that are in the verified HELPLINES list.
  const lines = DATE_LINES.filter(([n]) => HELPLINES.some((h) => h.number === n));
  return page(
    c,
    { title: t("ปลอดภัยไว้ก่อน", "Safety net") },
    <>
      <h1>🛡️ {t("ปลอดภัยไว้ก่อน", "Your safety net")}</h1>
      <div class="sos">
        {lines.map(([n, label]) => (
          <a class="sos-btn" href={`tel:${n}`}>
            <strong>{n}</strong>
            <small>{L(lang, label)}</small>
          </a>
        ))}
      </div>

      <Card>
        <h2>📲 {t("แชร์แผนเดทให้คนที่ไว้ใจ", "Share your date plan")}</h2>
        <form
          id="plan"
          class="plan"
          onsubmit="return false"
          data-tpl={t(
            "แชร์แผนนะ: เจอ {who} ที่ {where} เวลา {when} จะทักกลับก่อน {back} ถ้าเงียบไป ช่วยโทรหาด้วย 🙏",
            "My plan: meeting {who} at {where}, {when}. I'll message you by {back}. If you don't hear from me, please call. 🙏",
          )}
        >
          <label>
            {t("กับใคร", "Who")}
            <input name="who" maxlength={40} placeholder={t("ชื่อเล่น", "Nickname")} />
          </label>
          <label>
            {t("ที่ไหน", "Where")}
            <input name="where" maxlength={80} placeholder={t("เช่น คาเฟ่ในอารีย์", "e.g. a café in Ari")} />
          </label>
          <label>
            {t("เมื่อไร", "When")}
            <input name="when" maxlength={40} placeholder={t("เช่น เสาร์ 6 โมงเย็น", "e.g. Sat 6 pm")} />
          </label>
          <label>
            {t("จะทักกลับก่อน", "Back by")}
            <input name="back" maxlength={20} placeholder={t("เช่น 3 ทุ่ม", "e.g. 9 pm")} />
          </label>
          <div class="row">
            <button type="button" class="btn primary" data-act="share">{t("แชร์", "Share")}</button>
            <button type="button" class="btn ghost" data-act="line">LINE</button>
            <button type="button" class="btn ghost" data-act="sms">SMS</button>
          </div>
          <small class="muted">🔒 {t("แผนนี้ไม่ถูกบันทึกในระบบ", "This plan is never saved on our side.")}</small>
        </form>
        <script dangerouslySetInnerHTML={{ __html: SHARE_JS }} />
      </Card>

      <ul class="checklist">
        {SAFETY_TIPS.map((x) => (
          <li>
            <b aria-hidden="true">{x.emoji}</b> {L(lang, x.text)}
          </li>
        ))}
      </ul>

      <p class="row">
        <a href="/report">🚩 {t("รายงาน", "Report someone")}</a>
        <a href="/learn/date-responsibly">{t("อ่านเพิ่ม", "Read more")} →</a>
      </p>
    </>,
  );
});
