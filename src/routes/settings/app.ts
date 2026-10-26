/** The settings router; every part under ./ registers its routes on it. */
import { Hono } from "hono";
import type { AppEnv } from "../../lib/env";
import { requireMember } from "../../lib/session";

export const settingsRoutes = new Hono<AppEnv>();
settingsRoutes.use("/settings", requireMember);
settingsRoutes.use("/settings/*", requireMember);
