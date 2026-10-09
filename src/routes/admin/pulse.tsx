import { Hono } from "hono";
import type { AppEnv } from "../../lib/env";

export const adminPulse = new Hono<AppEnv>();
