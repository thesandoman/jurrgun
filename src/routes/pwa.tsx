/**
 * PWA plumbing (PRD §16): the service worker and the offline page.
 *
 * The worker precaches only three public, member-free files: /offline,
 * /icon.svg and /manifest.webmanifest. Pages and API responses go straight
 * to the network and are not stored, because pages carry member data.
 *
 * The one exception is the member's own next table (ui/offline-next.tsx):
 * the pass page of a confirmed, upcoming event is kept in a separate cache so
 * it stays readable with no signal. It is served only when the network fails,
 * dropped once the event has ended, and the whole cache is deleted on sign-out
 * and on any signed-out page.
 */
import { Hono } from "hono";
import type { AppEnv } from "../lib/env";
import { Card, LinkButton, page, view } from "../ui/kit";
import { NEXT_MAX, OFFLINE_CACHE, SAVED_ATTR } from "../ui/offline-next";

export const pwaRoutes = new Hono<AppEnv>();

/** Bump when the precached files or this script's logic change. */
export const SW_VERSION = "bkk-social-v3";

const SW = `/* Jurrgun service worker. Caches public shell files, plus the member's own next table pass. */
const CACHE = ${JSON.stringify(SW_VERSION)};
const NEXT = ${JSON.stringify(OFFLINE_CACHE)};
const NEXT_MAX = ${NEXT_MAX};
const PRECACHE = ["/offline", "/icon.svg", "/manifest.webmanifest"];
// The member's own pass page, and nothing else, may be kept for offline.
const PASS = /^\\/me\\/events\\/[A-Za-z0-9_-]+\\/pass$/;
const MARK = '${SAVED_ATTR}=""';
const FRESH_MS = 60 * 60 * 1000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Fetched without cookies so the cached copies are the signed-out versions.
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { credentials: "omit" })))).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== NEXT).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** Keep a fetched pass page, stamped with the time it was saved. A pass that is gone is dropped. */
function keepPass(path, res) {
  if (!res || res.status === 404 || res.status === 403) return caches.open(NEXT).then((c) => c.delete(path));
  if (!res.ok || res.redirected) return Promise.resolve();
  return res.clone().text().then((html) => {
    // The phone-down view (checked in) has no essentials: keep the last saved copy instead.
    if (html.indexOf(MARK) < 0) return;
    const at = new Date().toISOString();
    const body = html.replace(MARK, '${SAVED_ATTR}="' + at + '"');
    return caches.open(NEXT).then((c) => c.put(path, new Response(body, { headers: { "content-type": "text/html; charset=utf-8", "x-saved-at": at } })));
  });
}

/** A saved pass, unless its event has ended (then it is dropped). */
function savedPass(path) {
  return caches.open(NEXT).then((c) => c.match(path).then((hit) => {
    if (!hit) return null;
    return hit.text().then((html) => {
      const m = html.match(/data-ends="([^"]+)"/);
      if (m && Date.parse(m[1]) < Date.now()) return c.delete(path).then(() => null);
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    });
  }));
}

self.addEventListener("message", (event) => {
  const d = event.data || {};
  if (event.origin && event.origin !== self.location.origin) return;
  if (d.type === "jurrgun-clear-next") { event.waitUntil(caches.delete(NEXT)); return; }
  if (d.type !== "jurrgun-save-next" || !Array.isArray(d.urls)) return;
  const paths = d.urls.filter((u) => typeof u === "string" && PASS.test(u)).slice(0, NEXT_MAX);
  event.waitUntil(
    caches.open(NEXT).then((c) => c.keys().then((keys) => {
      const drop = d.replace ? keys.filter((k) => paths.indexOf(new URL(k.url).pathname) < 0) : [];
      return Promise.all(drop.map((k) => c.delete(k))).then(() => Promise.all(paths.map((p) =>
        c.match(p).then((hit) => {
          // Saved within the hour: no need to fetch it again.
          const at = hit ? Date.parse(hit.headers.get("x-saved-at") || "") : 0;
          if (at && Date.now() - at < FRESH_MS) return;
          return fetch(p, { credentials: "same-origin" }).then((res) => keepPass(p, res)).catch(() => {});
        })
      )));
    }))
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Signing out forgets the saved passes on this device. The request itself goes on as normal.
  if (req.method === "POST" && url.pathname === "/logout") {
    event.waitUntil(caches.delete(NEXT));
    return;
  }
  if (req.method !== "GET") return;

  // Pages: always the network first. Only the member's own pass page is kept,
  // and the saved copy is used only when the network fails.
  if (req.mode === "navigate") {
    const pass = PASS.test(url.pathname) && !url.search ? url.pathname : null;
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (pass) event.waitUntil(keepPass(pass, res).catch(() => {}));
          return res;
        })
        .catch(() =>
          (pass ? savedPass(pass) : Promise.resolve(null)).then((saved) =>
            saved || caches.match("/offline").then((r) => r || new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } }))
          )
        )
    );
    return;
  }

  // The icon: cache first.
  if (url.pathname === "/icon.svg") {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
    return;
  }

  // Everything else (HTML fragments, JSON, member data): the browser's
  // normal network handling. Nothing is written to the cache.
});

// Web Push (src/services/clock.ts): show the message; a tap opens its page.
self.addEventListener("push", (event) => {
  let m = {};
  try { m = event.data ? event.data.json() : {}; } catch (e) {}
  const url = typeof m.url === "string" && m.url.startsWith("/") ? m.url : "/";
  event.waitUntil(self.registration.showNotification(m.title || "Jurrgun", { body: m.body || "", tag: m.tag, icon: "/icon.svg", badge: "/icon.svg", data: { url } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) if (new URL(w.url).origin === self.location.origin && "focus" in w) return w.navigate(url).then((x) => (x || w).focus());
      return self.clients.openWindow(url);
    })
  );
});
`;

pwaRoutes.get("/sw.js", (c) =>
  c.body(SW, 200, {
    "content-type": "application/javascript; charset=utf-8",
    "cache-control": "no-cache",
    // Lets the worker control the whole origin even though it lives at /sw.js.
    "service-worker-allowed": "/",
  }),
);

/**
 * The offline page lists the passes saved on this device, read from the
 * browser's own cache by this script (the page itself is cached signed-out,
 * so the server never puts member data in it).
 */
const SAVED_LIST_JS = `(function(){var box=document.getElementById("offline-next-list");if(!box||!window.caches)return;
caches.open(${JSON.stringify(OFFLINE_CACHE)}).then(function(c){return c.keys().then(function(ks){return Promise.all(ks.map(function(k){return c.match(k).then(function(r){return r.text()}).then(function(h){
var d=new DOMParser().parseFromString(h,"text/html"),e=d.querySelector("[data-ends]"),h1=d.querySelector("h1");if(!e||Date.parse(e.getAttribute("data-ends"))<Date.now())return null;
return{url:new URL(k.url).pathname,title:h1?h1.textContent.trim():"",when:e.getAttribute("data-when")||""}})}))})}).then(function(list){list=(list||[]).filter(Boolean);if(!list.length)return;
var ul=box.querySelector("ul");list.forEach(function(x){var li=document.createElement("li"),a=document.createElement("a");a.href=x.url;a.className="card link";var b=document.createElement("b");b.textContent=x.title;var s=document.createElement("small");s.textContent=x.when;a.appendChild(b);a.appendChild(s);li.appendChild(a);ul.appendChild(li)});box.hidden=false}).catch(function(){})})()`;

pwaRoutes.get("/offline", (c) => {
  const { t } = view(c);
  return page(
    c,
    { title: t("ออฟไลน์", "Offline") },
    <>
      <h1>{t("คุณออฟไลน์อยู่", "You're offline")}</h1>
      <p class="muted">
        {t("ไม่มีอินเทอร์เน็ต ต่อเน็ตได้แล้วค่อยลองใหม่นะ", "There's no internet connection. Try again when you're back online.")}
      </p>
      <section id="offline-next-list" class="offline-next-list" hidden aria-labelledby="offline-next-h">
        <h2 id="offline-next-h" class="h3">
          <span aria-hidden="true">🎟️</span> {t("นัดที่บันทึกไว้ในเครื่องนี้", "Saved on this phone")}
        </h2>
        <p class="muted">{t("เปิดดูเวลา สถานที่ และบัตรเข้างานได้แม้ไม่มีสัญญาณ", "Time, place and your pass, readable without signal.")}</p>
        <ul class="plain-list" />
      </section>
      <p>
        <LinkButton href="/">{t("ลองใหม่", "Try again")}</LinkButton>
      </p>
      <Card>
        <h2 style="margin-top:0">{t("ต้องการความช่วยเหลือเร่งด่วน?", "Need urgent help?")}</h2>
        <p>
          {t("เหตุด่วนเหตุร้าย แจ้งตำรวจ: ", "Police emergency: ")}
          <a href="tel:191">191</a>
        </p>
        <p>
          {t("เจ็บป่วยฉุกเฉิน: ", "Medical emergency: ")}
          <a href="tel:1669">1669</a>
        </p>
      </Card>
      <script dangerouslySetInnerHTML={{ __html: SAVED_LIST_JS }} />
    </>,
  );
});
