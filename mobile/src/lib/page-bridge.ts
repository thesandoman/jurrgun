/**
 * What the app needs to know about the page it shows, and app-only touches inside it
 * (owner cards M1, M3, M5).
 *
 *  - BEFORE: marks <html class="in-app"> before the page paints, so the site's app-only CSS applies
 *    (no text selection or callouts on chrome).
 *  - AFTER: tells the app the page's theme (for the status bar) and whether pull-to-refresh fits
 *    this page, again whenever the theme or an open sheet changes; and a tap on the current tab
 *    scrolls to the top instead of reloading.
 *
 * Pull-to-refresh is only for lists where new things arrive (My events, chats, notifications,
 * tables); never on Discover (no autopilot), forms (it would drop unsaved edits), open sheets
 * or the fullscreen map.
 */
export const PAGE_MESSAGE = 'jurrgun-page';

export const BEFORE = `document.documentElement.classList.add("in-app");true;`;

export const AFTER = `(function(){if(window.__jgApp)return;window.__jgApp=1;
var LIST=/^\\/(me\\/events\\/?$|connections\\/?$|chat(\\/|$)|notifications\\/?$|tables\\/?$)/;
function report(){var d=document.documentElement,dark=d.getAttribute("data-theme")==="dark";
var form=!!document.querySelector("form[data-guard],main form input:not([type=hidden]),main form textarea");
var sheet=!!document.querySelector("details[open].filters,.sheet.is-open,[role=dialog]:not([hidden])");
var pull=LIST.test(location.pathname)&&!form&&!sheet;
window.ReactNativeWebView.postMessage(JSON.stringify({type:${JSON.stringify(PAGE_MESSAGE)},dark:dark,pull:pull}))}
report();new MutationObserver(report).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
document.addEventListener("toggle",report,true);
document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest(".tabbar a[aria-current=page]");if(!a)return;e.preventDefault();
scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"})},true);
})();true;`;
