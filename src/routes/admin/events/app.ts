/** The staff events router; every part under ./ registers its routes on it. */
import { Hono } from "hono";
import type { AppEnv } from "../../../lib/env";
import { requireRole } from "../../../lib/session";

export const adminEvents = new Hono<AppEnv>();
// Moderators host events too: they see and operate only the events they host (scopeWhere / canSee).
adminEvents.use("*", requireRole("host", "partner_admin", "circle_head"));
