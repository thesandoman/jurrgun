import { Hono } from "hono";
import type { AppEnv } from "../lib/env";

export const inviteRoutes = new Hono<AppEnv>();
