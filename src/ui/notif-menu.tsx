/**
 * The bell in the top bar: a dropdown instead of a separate page.
 *
 * The list is fetched only when the menu opens (GET /notifications/panel,
 * which also marks those notifications read), so ordinary page views make no
 * extra query; the unread dot comes from the signed-in-user lookup (the count is in its label). Without
 * JS the menu still opens and offers the full /notifications page.
 */
import type { notifications } from "../schema";
import type { Lang } from "../lib/i18n";
import { fmtDate } from "../lib/i18n";
import { safeNext } from "./kit";
import { NewBadge, UnreadDot, unreadLabel } from "./unread";
import { ALERT_OFF, KIND_DISTRICT_ALERT } from "../domain/district-alert";

type T = (th: string, en: string) => string;
type Notification = typeof notifications.$inferSelect;

export function NotifMenu(props: { t: T; unread: number }) {
  const { t, unread } = props;
  const label = unreadLabel(t, { th: "การแจ้งเตือน", en: "Notifications" }, unread);
  return (
    <details class="notif" id="notif">
      <summary aria-label={label} title={label}>
        <span aria-hidden="true">🔔</span>
        <UnreadDot n={unread} class="notif-dot" />
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

/**
 * The empty-district alert's one-tap off (owner card 7): a POST from the
 * list, never a GET with side effects. Shown under the alert while it is on.
 */
export function DistrictAlertOff(props: { t: T }) {
  return (
    <form method="post" action="/events/district-alert/off" class="notif-off">
      <input type="hidden" name="back" value="/notifications" />
      <button type="submit" class="btn ghost">
        {props.t(ALERT_OFF.th, ALERT_OFF.en)}
      </button>
    </form>
  );
}

/** The list inside the dropdown (returned by /notifications/panel). `alertOn`: the district alert is still on. */
export function NotifItems(props: { t: T; lang: Lang; rows: Notification[]; alertOn?: boolean }) {
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
            <small>
              {n.readAt ? null : <NewBadge t={t} />} {fmtDate(n.createdAt, lang)}
            </small>
          </>
        );
        return (
          <li class={n.readAt ? undefined : "unread"}>
            {href ? <a href={href}>{inner}</a> : <div>{inner}</div>}
            {n.kind === KIND_DISTRICT_ALERT && props.alertOn ? <DistrictAlertOff t={t} /> : null}
          </li>
        );
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
