import { Hono } from "hono";
import type { AppEnv } from "../lib/env";

export const quizRoutes = new Hono<AppEnv>();
