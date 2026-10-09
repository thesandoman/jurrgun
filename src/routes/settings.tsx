import { Hono } from "hono";
import type { AppEnv } from "../lib/env";

export const settingsRoutes = new Hono<AppEnv>();
