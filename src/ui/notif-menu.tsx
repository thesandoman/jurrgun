/**
 * The bell in the top bar: a dropdown instead of a separate page.
 *
 * The list is fetched only when the menu opens (GET /notifications/panel,
 * which also marks those notifications read), so ordinary page views make no
 * extra query; the unread badge comes from the signed-in-user lookup. Without
 * JS the menu still opens and offers the full /notifications page.
 */
import type { notifications } from "../schema";
import type { Lang } from "../lib/i18n";
import { fmtDate } from "../lib/i18n";
import { safeNext } from "./kit";

type T = (th: string, en: string) => string;
type Notification = typeof notifications.$inferSelect;

export function NotifMenu(props: { t: T; unread: number }) {
  const { t, unread } = props;
  const label = unread ? t(`การแจ้งเตือน (ยังไม่อ่าน ${unread})`, `Notifications (${unread} unread)`) : t("การแจ้งเตือน", "Notifications");
  return (
    <details class="notif" id="notif">
      <summary aria-label={label} title={label}>
        <span aria-hidden="true">🔔</span>
        {unread ? (
          <span class="notif-dot" aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </summary>
      <div class="notif-panel" role="region" aria-label={t("การแจ้งเตือน", "Notifications")} data-src="/notifications/panel">
        <p class="notif-h">{t("การแจ้งเตือน", "Notifications")}</p>
        <div class="notif-body">
          <p class="muted notif-empty">{t("กำลังโหลด…", "Loading…")}</p>
        </div>
        <a class="notif-all" href="/notifications">
          {t("ดูทั้งหมด", "See all")} →
        </a>
      </div>
    </details>
  );
}

/** The list inside the dropdown (returned by /notifications/panel). */
export function NotifItems(props: { t: T; lang: Lang; rows: Notification[] }) {
  const { t, lang, rows } = props;
  if (rows.length === 0) return <p class="muted notif-empty">{t("ยังไม่มีการแจ้งเตือน", "No notifications yet.")}</p>;
  return (
    <ul class="notif-list">
      {rows.map((n) => {
        const title = lang === "en" ? n.titleEn : n.titleTh;
        const href = n.link ? safeNext(n.link, "") : "";
        const inner = (
          <>
            <span class="notif-title">{title}</span>
            <small>{fmtDate(n.createdAt, lang)}</small>
          </>
        );
        return <li class={n.readAt ? undefined : "unread"}>{href ? <a href={href}>{inner}</a> : <div>{inner}</div>}</li>;
      })}
    </ul>
  );
}

/** Loads the list on first open; closes on Escape or a click outside. */
export const NOTIF_JS = `(function(){
var m=document.getElementById("notif");if(!m)return;
var p=m.querySelector(".notif-panel"),b=m.querySelector(".notif-body"),loaded=false;
m.addEventListener("toggle",function(){
  if(!m.open||loaded)return;loaded=true;
  fetch(p.getAttribute("data-src"),{credentials:"same-origin",headers:{accept:"text/html"}})
    .then(function(r){if(!r.ok)throw 0;return r.text()})
    .then(function(h){b.innerHTML=h;var d=m.querySelector(".notif-dot");if(d)d.remove()})
    .catch(function(){loaded=false});
});
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&m.open){m.open=false;m.querySelector("summary").focus()}});
document.addEventListener("click",function(e){if(m.open&&!m.contains(e.target))m.open=false});
})();`;
