import { Hono } from "hono";
import type { AppEnv } from "../lib/env";

export const peopleRoutes = new Hono<AppEnv>();
