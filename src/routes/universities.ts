/**
 * GET /universities/search?q=chula → the top matches for the education
 * picker, as JSON. The ~10,000-name list stays on the server; the browser
 * only ever receives these few rows.
 */
import { Hono } from "hono";
import type { AppEnv } from "../lib/env";
import { requireUser } from "../lib/session";
import { searchUniversities, universityName } from "../content/universities";

export const universityRoutes = new Hono<AppEnv>();

universityRoutes.get("/universities/search", requireUser, (c) => {
  const lang = c.var.lang;
  const q = (c.req.query("q") ?? "").slice(0, 80);
  let country: Intl.DisplayNames | null = null;
  try {
    country = new Intl.DisplayNames([lang === "th" ? "th" : "en"], { type: "region" });
  } catch {
    country = null;
  }
  const rows = searchUniversities(q, 8).map((u) => {
    const name = universityName(u, lang);
    const other = name === u.name ? u.th : u.name;
    return { id: u.id, name, sub: [country?.of(u.cc) ?? u.cc, other].filter(Boolean).join(" · ") };
  });
  // Names follow the reader's language (a cookie), so caches must key on it.
  c.header("cache-control", "private, max-age=300");
  c.header("vary", "Cookie");
  return c.json(rows);
});
