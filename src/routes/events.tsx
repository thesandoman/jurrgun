import { Hono } from "hono";
import type { AppEnv } from "../lib/env";

export const eventRoutes = new Hono<AppEnv>();
