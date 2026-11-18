/**
 * The secret that keys the hashes of IPs, sign-in usernames and anonymous talk questions (privacy R10, R11;
 * JG-3). IP_HASH_SECRET, falling back to EMAIL_HASH_SALT. Without either the key is public and those hashes
 * can be recomputed, so a deployed app logs it (once per worker) until the owner sets IP_HASH_SECRET.
 *
 * Changing the value later is safe for these hashes (sign-in counts and per-talk question caps reset once),
 * but not for EMAIL_HASH_SALT, which keys stored email sign-in links: set that once and never change it.
 */
import type { Context } from "hono";
import type { AppEnv, Bindings } from "./env";
import { isDeployed } from "./deployed";
import { createLogger } from "../logger";

/** Shorter than this is treated as missing. */
export const MIN_HASH_SECRET = 16;

export function hashKey(env: Bindings): string {
  const s = env.IP_HASH_SECRET || env.EMAIL_HASH_SALT || "";
  return s.length >= MIN_HASH_SECRET ? s : "";
}

let warned = false;

/** hashKey, and on a deployed host with no secret, one error log per worker so it shows in the error list. */
export function hashKeyFor(c: Context<AppEnv>): string {
  const k = hashKey(c.env);
  if (!k && !warned && isDeployed(c)) {
    warned = true;
    createLogger(c.env).error("hash_secret_missing", { set: "IP_HASH_SECRET" });
  }
  return k;
}
