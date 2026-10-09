/**
 * Prototype username/password sessions.
 *
 * The cookie holds a random token; the database stores only its SHA-256, so a
 * leaked sessions table cannot be replayed. Cookies are HttpOnly, SameSite=Lax
 * and Secure. Combined with the Origin check in `sameOrigin`, that covers CSRF
 * for form posts.
 */
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, profiles, sessions, type Role } from "../schema";
import { randomToken, sha256 } from "./crypto";
import type { AppEnv } from "./env";
import { pickLang } from "./i18n";

export const SESSION_COOKIE = "bkk_sid";
const SESSION_DAYS = 30;

export async function startSession(c: Context<AppEnv>, accountId: string): Promise<void> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await getDb(c.env)
    .insert(sessions)
    .values({ id: await sha256(token), accountId, expiresAt });
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function endSession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await getDb(c.env).delete(sessions).where(eq(sessions.id, await sha256(token)));
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/**
 * Loads `c.var.user` and `c.var.lang`. No cookie → no database trip, which
 * keeps public pages (and tests) free of database calls.
 */
export const loadUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("user", null);
  c.set("lang", pickLang(c.req.query("lang") ?? getCookie(c, "lang")));
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const db = getDb(c.env);
    const rows = await db
      .select({ account: accounts, profile: profiles })
      .from(sessions)
      .innerJoin(accounts, eq(accounts.id, sessions.accountId))
      .leftJoin(profiles, eq(profiles.accountId, accounts.id))
      .where(and(eq(sessions.id, await sha256(token)), gt(sessions.expiresAt, new Date())))
      .limit(1);
    const row = rows[0];
    if (row && accountUsable(row.account)) {
      c.set("user", { account: row.account, profile: row.profile });
      // An explicit ?lang= or language cookie wins; otherwise use the profile's.
      if (!c.req.query("lang") && !getCookie(c, "lang") && row.profile) c.set("lang", pickLang(row.profile.locale));
    } else {
      deleteCookie(c, SESSION_COOKIE, { path: "/" });
    }
  }
  await next();
};

export function accountUsable(a: { status: string; suspendedUntil: Date | null }, now = new Date()): boolean {
  if (a.status === "banned" || a.status === "deactivated") return false;
  if (a.status === "suspended" && a.suspendedUntil && a.suspendedUntil.getTime() > now.getTime()) return false;
  return true;
}

function loginRedirect(c: Context<AppEnv>) {
  const url = new URL(c.req.url);
  if (url.pathname.startsWith("/api/")) return c.json({ error: "Sign in required" }, 401);
  return c.redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
}

/** Signed in (onboarding may be unfinished). */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.var.user) return loginRedirect(c);
  await next();
};

/** Signed in AND onboarded — every member page. */
export const requireMember: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.var.user;
  if (!user) return loginRedirect(c);
  if (!user.profile?.onboardedAt) return c.redirect("/onboarding");
  await next();
};

export function hasRole(role: Role, allowed: readonly Role[]): boolean {
  return role === "bma_admin" || allowed.includes(role);
}

/** Staff areas. bma_admin passes every check. */
export function requireRole(...allowed: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.var.user;
    if (!user) return loginRedirect(c);
    if (!hasRole(user.account.role, allowed)) return c.text("Forbidden", 403);
    await next();
  };
}

/**
 * Rejects cross-site form posts. Browsers send Origin on every cross-origin
 * POST; a mismatch is refused. Requests with neither header (curl, tests) pass.
 */
export const sameOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    const host = new URL(c.req.url).host;
    const origin = c.req.header("origin") ?? c.req.header("referer");
    if (origin) {
      let ok = false;
      try {
        ok = new URL(origin).host === host;
      } catch {
        ok = false;
      }
      if (!ok) return c.text("Cross-site request refused", 403);
    }
  }
  await next();
};
