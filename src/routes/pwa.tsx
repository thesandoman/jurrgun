import { Hono } from "hono";
import type { AppEnv } from "../lib/env";

export const pwaRoutes = new Hono<AppEnv>();
