/**
 * The phone app's home-screen widget, "Your next table" (owner card S4, App Store 4.2).
 *
 * GET /api/app/next-table answers for the signed-in member, read by the app from inside its web
 * view (the session cookie), never with a token. Privacy rules (owner, after the panel):
 *   - no event title, ever: the widget says "Jurrgun table";
 *   - the place only if the member turned it on in the app, and never for 💘 (open to more) or
 *     women-only tables, which always stay plain, as on lock screens;
 *   - never the host's name or the pass QR;
 *   - the table drops off once it has ended; a cancelled one is marked so the widget can say so.
 */
import { Hono } from "hono";
import { and, asc, eq, gt } from "drizzle-orm";
import { getDb } from "../db";
import type { AppEnv } from "../lib/env";
import { label, DISTRICTS } from "../lib/constants";
import { requireMember } from "../lib/session";
import { OPEN_TO_MORE_TAG, WOMEN_ONLY_TAG } from "../domain/rules";
import { events, registrations } from "../schema";

export const appWidgetRoutes = new Hono<AppEnv>();

export type NextTable = {
  startsAt: string;
  endsAt: string;
  cancelled: boolean;
  /** Venue and district, only for tables that may show a place; the app still asks the member first. */
  place: string | null;
  pass: string;
};

appWidgetRoutes.get("/api/app/next-table", requireMember, async (c) => {
  const user = c.var.user!;
  const lang = c.req.query("lang") === "en" ? "en" : "th";
  const [row] = await getDb(c.env)
    .select({ id: events.id, startsAt: events.startsAt, endsAt: events.endsAt, status: events.status, tags: events.tags, venueName: events.venueName, district: events.district })
    .from(registrations)
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(and(eq(registrations.accountId, user.account.id), eq(registrations.status, "confirmed"), gt(events.endsAt, new Date())))
    .orderBy(asc(events.startsAt))
    .limit(1);
  c.header("cache-control", "no-store");
  if (!row) return c.json({ table: null });
  const plain = row.tags.includes(OPEN_TO_MORE_TAG) || row.tags.includes(WOMEN_ONLY_TAG);
  const table: NextTable = {
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    cancelled: row.status === "cancelled",
    place: plain ? null : `${row.venueName} · ${label(DISTRICTS, row.district, lang)}`,
    pass: `/me/events/${row.id}/pass`,
  };
  return c.json({ table });
});
