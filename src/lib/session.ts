/**
 * Prototype username/password sessions.
 *
 * The cookie holds a random token; the database stores only its SHA-256, so a
 * leaked sessions table cannot be replayed. Cookies are HttpOnly, SameSite=Lax
 * and Secure. Combined with the Origin check in `sameOrigin`, that covers CSRF
 * for form posts.
 */
import { DEMO_CHAT_LINKS } from "../services/demo";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, events, notifications, profiles, sessions, type Role } from "../schema";
import { CHAT_KIND } from "../domain/chat";
import { DIGEST_KINDS } from "../domain/digest";

/**
 * The bell's "วันนี้ / Today" (mobile card 5): an unread, urgent notification about an event that
 * happens today in Bangkok. Urgent means any kind the evening summary does not hold back
 * (domain/digest.ts; urgentForToday is the same rule in plain code). The event id is read from the
 * link ("/events/<id>", "/events/<id>/live", "/events/<id>?notice=..."), so it is one primary-key lookup.
 */
const URGENT_TODAY = sql<boolean>`exists (select 1 from ${notifications} inner join ${events} on ${events.id} = split_part(split_part(split_part(substr(${notifications.link}, 9), '/', 1), '?', 1), '#', 1) where ${notifications.accountId} = ${accounts.id} and ${notifications.readAt} is null and ${notifications.createdAt} <= now() and ${notifications.link} like '/events/%' and ${notifications.kind} <> ${CHAT_KIND} and ${notifications.kind} not in (${sql.join(
  Object.keys(DIGEST_KINDS).map((k) => sql`${k}`),
  sql`, `,
)}) and (${events.startsAt} at time zone 'Asia/Bangkok')::date = (now() at time zone 'Asia/Bangkok')::date)`;
import { randomToken, sha256 } from "./crypto";
import { secureCookie } from "./deployed";
import type { AppEnv } from "./env";
import { langFromHeader, pickLang } from "./i18n";

export const SESSION_COOKIE = "bkk_sid";
export const SESSION_DAYS = 30;

export async function startSession(c: Context<AppEnv>, accountId: string): Promise<void> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await getDb(c.env)
    .insert(sessions)
    .values({ id: await sha256(token), accountId, expiresAt });
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookie(c),
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
  const chosen = c.req.query("lang") ?? getCookie(c, "lang");
  c.set("lang", chosen ? pickLang(chosen) : langFromHeader(c.req.header("accept-language")));
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const db = getDb(c.env);
    const rows = await db
      .select({
        account: accounts,
        profile: profiles,
        // Unread count for the bell, in the same trip (no extra query per page).
        // Chats count on their own (the My people tab and the Chats chip): one waiting
        // "new message" notification per chat, read when that chat is opened.
        unread: sql<number>`(select count(*) from ${notifications} where ${notifications.accountId} = ${accounts.id} and ${notifications.readAt} is null and ${notifications.createdAt} <= now() and ${notifications.kind} <> ${CHAT_KIND})`.mapWith(Number),
        // A real member's count leaves out chats with a demo account (owner C2); demo viewers keep theirs.
        chatUnread: sql<number>`(select count(distinct ${notifications.link}) from ${notifications} where ${notifications.accountId} = ${accounts.id} and ${notifications.readAt} is null and ${notifications.createdAt} <= now() and ${notifications.kind} = ${CHAT_KIND} and (${accounts.isDemo} or ${notifications.link} not in ${DEMO_CHAT_LINKS}))`.mapWith(Number),
        urgentToday: URGENT_TODAY,
      })
      .from(sessions)
      .innerJoin(accounts, eq(accounts.id, sessions.accountId))
      .leftJoin(profiles, eq(profiles.accountId, accounts.id))
      .where(and(eq(sessions.id, await sha256(token)), gt(sessions.expiresAt, new Date())))
      .limit(1);
    const row = rows[0];
    if (row && accountUsable(row.account)) {
      c.set("user", { account: row.account, profile: row.profile, unread: Number(row.unread ?? 0), chatUnread: Number(row.chatUnread ?? 0), urgentToday: row.urgentToday === true });
      // An explicit ?lang= or language cookie wins; otherwise use the profile's.
      if (!c.req.query("lang") && !getCookie(c, "lang") && row.profile) c.set("lang", pickLang(row.profile.locale));
    } else {
      deleteCookie(c, SESSION_COOKIE, { path: "/" });
    }
  }
  await next();
};

export function accountUsable(a: { status: string; suspendedUntil: Date | null }, now = new Date()): boolean {
  if (a.status === "banned" || a.status === "deactivated" || a.status === "deleted") return false;
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
