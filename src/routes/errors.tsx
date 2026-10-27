/**
 * Friendly pages for a missing page or a server error. Browsers get the
 * normal layout (header, menu, a way back); API calls and anything that
 * doesn't ask for HTML still get JSON.
 */
import type { Context } from "hono";
import type { AppEnv } from "../lib/env";
import { LinkButton, page, view } from "../ui/kit";

type Ctx = Context<AppEnv>;

/** True for a browser page load (not /api, and the client accepts HTML). */
export function wantsHtml(c: Ctx): boolean {
  return !c.req.path.startsWith("/api/") && (c.req.header("accept") ?? "").includes("text/html");
}

/** Home is / for everyone: members get Discover there, visitors the landing. */
function home(_c: Ctx): string {
  return "/";
}

export function notFoundPage(c: Ctx) {
  const { t } = view(c);
  return page(
    c,
    { title: t("ไม่พบหน้านี้", "Page not found"), status: 404 },
    <section class="err-page">
      <p class="err-mark" aria-hidden="true">🧭</p>
      <h1>{t("ไม่พบหน้านี้", "We couldn't find that page")}</h1>
      <p class="muted">{t("ลิงก์อาจเก่าหรือพิมพ์ผิด ลองกลับไปหน้าหลัก", "The link may be old or mistyped. Try going back to the start.")}</p>
      <div class="row">
        <LinkButton href={home(c)}>{t("กลับหน้าหลัก", "Go to the start")}</LinkButton>
        <LinkButton href="/faq" kind="ghost">
          {t("คำถามที่พบบ่อย", "FAQ")}
        </LinkButton>
      </div>
    </section>,
  );
}

export function errorPage(c: Ctx) {
  const { t } = view(c);
  return page(
    c,
    { title: t("เกิดข้อผิดพลาด", "Something went wrong"), status: 500 },
    <section class="err-page">
      <p class="err-mark" aria-hidden="true">🛠️</p>
      <h1>{t("ขออภัย ระบบขัดข้อง", "Something went wrong on our side")}</h1>
      <p class="muted">
        {t("ไม่ใช่ความผิดของคุณ ลองโหลดหน้านี้ใหม่อีกครั้งในอีกสักครู่", "It's not something you did. Try loading the page again in a moment.")}
      </p>
      <div class="row">
        <LinkButton href={c.req.path}>{t("ลองอีกครั้ง", "Try again")}</LinkButton>
        <LinkButton href={home(c)} kind="ghost">
          {t("กลับหน้าหลัก", "Go to the start")}
        </LinkButton>
      </div>
    </section>,
  );
}

/** Last resort when even the layout can't render (no database, say). */
export function plainErrorHtml(c: Ctx) {
  return c.html(
    `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jurrgun</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 20px;line-height:1.6"><h1>ขออภัย ระบบขัดข้อง · Something went wrong</h1><p>ลองโหลดหน้านี้ใหม่อีกครั้ง · Please try again in a moment.</p><p><a href="/">กลับหน้าหลัก · Go to the start</a></p></body></html>`,
    500,
  );
}
