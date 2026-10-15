/**
 * Partner (Kaipa) event pages.
 *
 *   GET /partner-events/kaipa/:id   details, prices and a "Get tickets on Kaipa" link
 *
 * Only public, upcoming events Kaipa itself returns are shown; anything else
 * is a 404, so we never link buyers to a removed event.
 */
import { Hono } from "hono";
import type { AppEnv } from "../lib/env";
import { requireMember } from "../lib/session";
import { kaipaEvent } from "../services/kaipa";
import { Empty, page, view } from "../ui/kit";
import { PartnerDetail } from "../ui/partner-events";

export const partnerRoutes = new Hono<AppEnv>();

/** Background work after the response (Workers), or nothing in tests. */
export function deferFor(c: { executionCtx: { waitUntil(p: Promise<unknown>): void } }): (p: Promise<unknown>) => void {
  return (p) => {
    try {
      c.executionCtx.waitUntil(p);
    } catch {
      // No execution context (tests, scripts): the promise just runs on.
    }
  };
}

partnerRoutes.get("/partner-events/kaipa/:id", requireMember, async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const raw = c.req.param("id");
  const id = /^\d{1,9}$/.test(raw) ? Number(raw) : NaN;
  const e = Number.isInteger(id) ? await kaipaEvent(c.env, id, { defer: deferFor(c) }) : null;
  if (!e) {
    return page(
      c,
      { title: t("ไม่พบกิจกรรม", "Event not found"), tab: "events", status: 404 },
      <>
        <h1>{t("ไม่พบกิจกรรมนี้", "We can't find this event")}</h1>
        <Empty>{t("อาจจบไปแล้วหรือถูกนำออกจาก Kaipa", "It may have ended or been taken down on Kaipa.")}</Empty>
        <p>
          <a href="/events">{t("กลับไปค้นหากิจกรรม", "Back to Discover")}</a>
        </p>
      </>,
    );
  }
  return page(c, { title: e.name, tab: "events" }, <PartnerDetail e={e} t={t} lang={lang} />);
});
