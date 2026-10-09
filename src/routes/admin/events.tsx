import { Hono } from "hono";
import type { AppEnv } from "../../lib/env";

export const adminEvents = new Hono<AppEnv>();
