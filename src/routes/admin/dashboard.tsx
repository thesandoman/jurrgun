import { Hono } from "hono";
import type { AppEnv } from "../../lib/env";

export const adminDashboard = new Hono<AppEnv>();
