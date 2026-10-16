/**
 * The dating safety net (/safety). Public, short and tap-first:
 *  - one-tap calls to the emergency and help lines (HELPLINES in content/learn.ts);
 *  - "share my date plan": who, where, when and back-by, sent to someone you
 *    trust through the phone's own share sheet, LINE or SMS. The plan never
 *    touches our server: it is put together in the browser;
 *  - a seven-line checklist (SAFETY_TIPS in content/dating.ts);
 *  - report and block, always available;
 *  - an opt-in "home safe?" check: set a back-by time and a private prompt
 *    appears then (a notification dated for that moment). "Need help" shows
 *    the helplines and alerts the safety team.
 */
import { Hono } from "hono";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { newId } from "../lib/crypto";
import type { AppEnv } from "../lib/env";
import { fmtDate, L } from "../lib/i18n";
import { notify } from "../lib/records";
import { requireMember } from "../lib/session";
import { accounts, notifications, safeArrivals } from "../schema";
import { HELPLINES } from "../content/learn";
import { SAFETY_TIPS } from "../content/dating";
import { Button, Card, Notice, page, str, view, type View } from "../ui/kit";

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
  const v = view(c);
  const { t, lang } = v;
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

      {v.user?.profile?.onboardedAt ? (
        <Card>
          <h2>🏠 {t("ให้เราถามว่าถึงบ้านปลอดภัยไหม", "Ask me if I got home safe")}</h2>
          <SafeArrivalForm v={v} context="self" />
        </Card>
      ) : null}
      <Card>
        <h2>📲 {t("แชร์แผนเดตให้คนที่ไว้ใจ", "Share your date plan")}</h2>
        <form
          id="plan"
          class="plan"
          onsubmit="return false"
          data-tpl={t(
            "บอกแผนไว้ก่อนนะ: ไปเจอ {who} ที่ {where} ตอน {when} จะทักกลับก่อน {back} ถ้าเงียบไป ช่วยโทรหาหน่อย 🙏",
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
          <small class="muted">🔒 {t("เราไม่เก็บแผนนี้ไว้ในระบบ", "This plan is never saved on our side.")}</small>
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
        <a href="/safety/how">{t("เราดูแลความปลอดภัยยังไง", "How we keep you safe")}</a>
        <a href="/learn/date-responsibly">{t("อ่านเพิ่ม", "Read more")} →</a>
      </p>
    </>,
  );
});

// ----------------------------------------------------- home safe? check --

/** The "home safe?" form: a back-by time today (or tomorrow if it has passed). */
export function SafeArrivalForm(props: { v: View; context: string }) {
  const { t } = props.v;
  return (
    <form method="post" action="/safety/arrival" class="row safe-arrival">
      <input type="hidden" name="context" value={props.context} />
      <label>
        🏠 {t("ถามฉันว่าถึงบ้านปลอดภัยไหม ตอน", "Ask me if I'm home safe at")}{" "}
        <input type="time" name="back" required value="21:00" />
      </label>
      <Button kind="ghost">{t("ตั้งเวลา", "Set")}</Button>
    </form>
  );
}

/** The next moment that local Bangkok time reads HH:MM. */
export function nextLocal(hhmm: string, now = new Date()): Date | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  const local = new Date(now.getTime() + 7 * 3600_000);
  const at = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), Number(m[1]), Number(m[2])) - 7 * 3600_000);
  return at.getTime() <= now.getTime() ? new Date(at.getTime() + 86_400_000) : at;
}

safetyRoutes.post("/safety/arrival", requireMember, async (c) => {
  const body = await c.req.parseBody();
  const backBy = nextLocal(str(body.back));
  const context = str(body.context).slice(0, 80) || "self";
  if (!backBy) return c.redirect("/safety");
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const id = newId();
  await db.insert(safeArrivals).values({ id, accountId: me, context, backBy });
  // Appears at back-by time (notifications dated in the future stay hidden until then).
  await db.insert(notifications).values({ id: newId(), accountId: me, kind: "safe_arrival", titleTh: "ถึงบ้านปลอดภัยไหม? แตะเพื่อบอกเรา", titleEn: "Home safe? Tap to let us know", link: `/safety/arrival/${id}`, createdAt: backBy });
  return c.redirect(`/safety/arrival/${id}?set=1`);
});

safetyRoutes.get("/safety/arrival/:id", requireMember, async (c) => {
  const { t, lang } = view(c);
  const db = getDb(c.env);
  const [row] = await db.select().from(safeArrivals).where(and(eq(safeArrivals.id, c.req.param("id")), eq(safeArrivals.accountId, c.var.user!.account.id))).limit(1);
  if (!row) return c.text("Not found", 404);
  return page(
    c,
    { title: t("ถึงบ้านปลอดภัยไหม", "Home safe?") },
    <>
      <h1>🏠 {t("ถึงบ้านปลอดภัยไหม?", "Home safe?")}</h1>
      {c.req.query("set") ? <Notice kind="ok">{t(`ตั้งไว้แล้ว เราจะถามตอน ${fmtDate(row.backBy, lang)}`, `Set. We'll ask at ${fmtDate(row.backBy, lang)}.`)}</Notice> : null}
      {row.answer === "safe" ? (
        <Notice kind="ok">{t("ดีใจที่ถึงบ้านแล้ว ขอบคุณที่บอกเรานะ", "Glad you're home. Thanks for letting us know.")}</Notice>
      ) : row.answer === "help" ? (
        <HelpNow v={view(c)} />
      ) : (
        <form method="post" action={`/safety/arrival/${row.id}`} class="row">
          <button class="btn primary" name="answer" value="safe">✅ {t("ถึงแล้ว ปลอดภัย", "Yes, I'm safe")}</button>
          <button class="btn ghost" name="answer" value="help">🆘 {t("ต้องการความช่วยเหลือ", "I need help")}</button>
        </form>
      )}
    </>,
  );
});

function HelpNow(props: { v: View }) {
  const { t, lang } = props.v;
  const lines = DATE_LINES.filter(([n]) => HELPLINES.some((h) => h.number === n));
  return (
    <>
      <Notice kind="warn">{t("เราแจ้งทีมความปลอดภัยแล้ว ถ้าอันตรายตอนนี้ โทรหาตำรวจ 191 ทันที", "We've told our safety team. If you're in danger now, call the police on 191.")}</Notice>
      <div class="sos">
        {lines.map(([n, label]) => (
          <a class="sos-btn" href={`tel:${n}`}>
            <strong>{n}</strong>
            <small>{L(lang, label)}</small>
          </a>
        ))}
      </div>
      <p>
        <a href="/report">{t("รายงานสิ่งที่เกิดขึ้น", "Report what happened")}</a>
      </p>
    </>
  );
}

safetyRoutes.post("/safety/arrival/:id", requireMember, async (c) => {
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const [row] = await db.select().from(safeArrivals).where(and(eq(safeArrivals.id, c.req.param("id")), eq(safeArrivals.accountId, me))).limit(1);
  if (!row) return c.text("Not found", 404);
  const answer = str((await c.req.parseBody()).answer) === "help" ? "help" : "safe";
  if (!row.answer) {
    await db.update(safeArrivals).set({ answer, answeredAt: new Date() }).where(eq(safeArrivals.id, row.id));
    if (answer === "help") {
      const staff = await db.select({ id: accounts.id }).from(accounts).where(and(inArray(accounts.role, ["moderator", "bma_admin"]), eq(accounts.status, "active"))).limit(500);
      for (const s of staff) await notify(db, s.id, "report", "ด่วน: สมาชิกขอความช่วยเหลือหลังนัดเจอ", "Urgent: a member asked for help after a meetup", `/admin/users/${me}`);
    }
  }
  return c.redirect(`/safety/arrival/${row.id}`);
});
