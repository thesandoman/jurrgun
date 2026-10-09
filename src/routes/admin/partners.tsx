import { Hono } from "hono";
import type { AppEnv } from "../../lib/env";

export const adminPartners = new Hono<AppEnv>();
