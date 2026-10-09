import { Hono } from "hono";
import type { AppEnv } from "../../lib/env";

export const adminInsights = new Hono<AppEnv>();
