/**
 * Placement tracking (admin only): which link first brought someone in.
 *
 * A public landing (/, /new, /international, /types/:slug, /signup, /quiz) or
 * an event page (/events/:id, even when it sends a signed-out visitor to sign
 * in first) opened with
 * `?src=` (or `utm_source`, with `utm_campaign` appended) remembers that value
 * in a first-touch cookie for 30 days. At sign-up it is copied onto
 * identity_accounts.signup_source. City Insight shows sign-ups and first RSVPs
 * by source as totals of 10 or more only.
 *
 * No personal data: the value is cut to a short lower-case slug, and anything
 * with a long run of digits (a phone or id number) is dropped. The first value
 * wins; later links don't overwrite it.
 */
import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "./env";

export const SOURCE_COOKIE = "jg_src";
export const SOURCE_MAX_AGE = 30 * 86_400;
const PART_MAX = 32;

/** Paths whose query may carry a placement source. */
const LANDING = /^\/(?:new|international|signup|quiz|types\/[^/]+|events\/[^/]+)?\/?$/;

function slug(raw: string | undefined | null): string {
  if (!raw) return "";
  const s = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, PART_MAX);
  // A run of 6+ digits looks like a phone, card or id number: never keep it.
  return /\d{6,}/.test(s) ? "" : s;
}

/** The source a landing URL names, or null. `src` wins over utm_source. */
export function sourceFromQuery(q: { src?: string; utm_source?: string; utm_campaign?: string }): string | null {
  const source = slug(q.src) || slug(q.utm_source);
  if (!source) return null;
  const campaign = q.src ? "" : slug(q.utm_campaign);
  return campaign ? `${source}/${campaign}` : source;
}

/** A stored or cookie value checked again before it reaches the database. */
export function cleanSource(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const [a, b] = raw.split("/", 2);
  const source = slug(a);
  if (!source) return null;
  const campaign = slug(b);
  return campaign ? `${source}/${campaign}` : source;
}

/** Remembers the first placement source seen on a public landing (GET only). */
export const captureSource: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  if (c.req.method !== "GET" || !LANDING.test(c.req.path) || c.res.status >= 400) return;
  if (getCookie(c, SOURCE_COOKIE)) return;
  const source = sourceFromQuery({ src: c.req.query("src"), utm_source: c.req.query("utm_source"), utm_campaign: c.req.query("utm_campaign") });
  if (!source) return;
  setCookie(c, SOURCE_COOKIE, source, {
    path: "/",
    maxAge: SOURCE_MAX_AGE,
    sameSite: "Lax",
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
  });
};

/** The source to store on a new account, from the first-touch cookie. */
export function signupSource(c: Context<AppEnv>): string | null {
  return cleanSource(getCookie(c, SOURCE_COOKIE));
}
