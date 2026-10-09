import { Hono } from "hono";
import type { AppEnv } from "../../lib/env";

export const adminModeration = new Hono<AppEnv>();
