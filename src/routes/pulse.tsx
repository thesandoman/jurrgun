import { Hono } from "hono";
import type { AppEnv } from "../lib/env";

export const pulseRoutes = new Hono<AppEnv>();
