/**
 * Offline next table (owner-approved): a member's next booked tables stay
 * readable with no signal.
 *
 * What is saved: only the member's own pass page for a confirmed, upcoming
 * event (/me/events/:id/pass), at most NEXT_MAX of them. That page shows
 * nothing about other members except the host's first name, which the event
 * page already shows. The service worker (routes/pwa.tsx) keeps it in its own
 * cache, OFFLINE_CACHE, stamps the time it saved it, and serves it only when
 * the network fails. It drops a copy once the event has ended, and the whole
 * cache is deleted on sign-out and on any signed-out page.
 *
 * How a page knows it came from the cache: the live page carries an empty
 * data-offline-saved attribute; the worker fills in the time when it stores
 * its copy, so only a cached copy shows the "saved for offline" note.
 */
import { Script } from "./kit";
export const OFFLINE_CACHE = "jurrgun-next-v1";
/** At most this many passes are kept on a device. */
export const NEXT_MAX = 3;
/** The attribute the worker fills in with the time it saved the page. */
export const SAVED_ATTR = "data-offline-saved";

type T = (th: string, en: string) => string;

/** The pass paths a page asks the worker to keep (`replace`: drop every other saved pass). */
export function SaveNext(props: { paths: string[]; replace?: boolean }) {
  const paths = props.paths.slice(0, NEXT_MAX);
  if (!paths.length && !props.replace) return null;
  const msg = JSON.stringify({ type: "jurrgun-save-next", urls: paths, replace: !!props.replace }).replace(/</g, "\\u003c");
  return (
    <Script
      dangerouslySetInnerHTML={{
        __html: `(function(){if(!("serviceWorker" in navigator))return;navigator.serviceWorker.ready.then(function(r){if(r.active)r.active.postMessage(${msg})}).catch(function(){})})()`,
      }}
    />
  );
}

/**
 * "Saved for offline at 18:05": hidden on the live page, shown when the page
 * was served from the device. The time is written by the worker, formatted
 * here in the page's language and Bangkok time.
 */
export function OfflineSavedNote(props: { t: T; lang: string }) {
  const { t } = props;
  return (
    <>
      <p class="offline-saved" id="offline-saved" role="status" hidden>
        <span aria-hidden="true">📶</span>{" "}
        <span>
          <b>{t("บันทึกไว้ดูตอนออฟไลน์", "Saved for offline")}</b> <span data-saved-time="" />
          <small>{t("ไม่มีสัญญาณตอนนี้ ข้อมูลนี้มาจากเครื่องของคุณ ถ้ามีอะไรเปลี่ยน จะเห็นเมื่อกลับมาออนไลน์", "No signal right now, so this is the copy on your phone. Any changes show once you're back online.")}</small>
        </span>
      </p>
      <Script
        dangerouslySetInnerHTML={{
          __html: `(function(){var s=document.querySelector("[${SAVED_ATTR}]"),at=s&&s.getAttribute("${SAVED_ATTR}");if(!at)return;var d=new Date(at);if(isNaN(d))return;var n=document.getElementById("offline-saved");var th=${JSON.stringify(props.lang !== "en")};
var f=d.toLocaleString(th?"th-TH":"en-GB",{timeZone:"Asia/Bangkok",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});n.querySelector("[data-saved-time]").textContent=(th?"เมื่อ ":"at ")+f;n.hidden=false})()`,
        }}
      />
    </>
  );
}

/** Signed-out pages: forget any saved pass on this device (a shared phone, an expired session). */
export const CLEAR_OFFLINE_JS = `(function(){try{if(window.caches)caches.delete(${JSON.stringify(OFFLINE_CACHE)});if(navigator.serviceWorker&&navigator.serviceWorker.controller)navigator.serviceWorker.controller.postMessage({type:"jurrgun-clear-next"})}catch(e){}})()`;
