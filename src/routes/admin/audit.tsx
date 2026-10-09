import { Hono } from "hono";
import type { AppEnv } from "../../lib/env";

export const adminAudit = new Hono<AppEnv>();
