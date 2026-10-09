/**
 * PWA plumbing (PRD §16): the service worker and the offline page.
 *
 * The worker caches only three public, member-free files: /offline,
 * /icon.svg and /manifest.webmanifest. Every other page and API response
 * goes straight to the network and is never stored on the device, because
 * pages carry member data (names, events, connections).
 */
import { Hono } from "hono";
import type { AppEnv } from "../lib/env";
import { Card, LinkButton, page, view } from "../ui/kit";

export const pwaRoutes = new Hono<AppEnv>();

/** Bump when the precached files or this script's logic change. */
export const SW_VERSION = "bkk-social-v1";

const SW = `/* Jurrgun service worker. Caches only public shell files, never member pages. */
const CACHE = ${JSON.stringify(SW_VERSION)};
const PRECACHE = ["/offline", "/icon.svg", "/manifest.webmanifest"];

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
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Pages: always the network; the cached offline page only when it fails.
  // The response itself is never cached.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match("/offline").then((r) => r || new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } }))
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
`;

pwaRoutes.get("/sw.js", (c) =>
  c.body(SW, 200, {
    "content-type": "application/javascript; charset=utf-8",
    "cache-control": "no-cache",
    // Lets the worker control the whole origin even though it lives at /sw.js.
    "service-worker-allowed": "/",
  }),
);

pwaRoutes.get("/offline", (c) => {
  const { t } = view(c);
  return page(
    c,
    { title: t("ออฟไลน์", "Offline") },
    <>
      <h1>{t("คุณออฟไลน์อยู่", "You're offline")}</h1>
      <p class="muted">
        {t("ไม่มีการเชื่อมต่ออินเทอร์เน็ต ลองใหม่อีกครั้งเมื่อกลับมาออนไลน์", "There's no internet connection. Try again when you're back online.")}
      </p>
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
    </>,
  );
});
