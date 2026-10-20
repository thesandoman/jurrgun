/**
 * The one way Jurrgun reads an outside page or feed (D46): a pasted event
 * link, or an admin-added calendar feed.
 *
 *   - https only, on the default port, no user name or password in the URL
 *   - public host names only: no IP addresses, no localhost, no single-label
 *     or internal names (.local, .internal, .lan, .home, .arpa), and never
 *     this platform's own domain
 *   - at most 3 redirects, each one checked again
 *   - a time limit, and a size limit read as the body arrives (the body is
 *     cut off, never buffered whole)
 *   - robots.txt is honoured for pasted pages (feeds are published to be read)
 *
 * Only text comes back. Nothing a member typed is sent: the request carries
 * no cookies and no referrer, and names itself as JurrgunBot.
 */
export const USER_AGENT = "JurrgunBot/1.0 (+https://jurrgun.apps.sv-academy.org/)";
export const PAGE_MAX_BYTES = 768 * 1024;
export const FEED_MAX_BYTES = 2 * 1024 * 1024;
const ROBOTS_MAX_BYTES = 64 * 1024;
const MAX_REDIRECTS = 3;

export type FetchError = "bad_url" | "blocked_host" | "timeout" | "too_large" | "not_text" | "robots" | "network" | `http_${number}`;
export type Fetched = { ok: true; url: string; text: string; contentType: string } | { ok: false; error: FetchError };

/** Tests swap this for a fake; the app always uses the platform's fetch. */
let doFetch: (req: Request) => Promise<Response> = (req) => fetch(req);
export function setOutsideFetch(f: ((req: Request) => Promise<Response>) | null) {
  doFetch = f ?? ((req) => fetch(req));
}

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".arpa", ".intranet", ".corp", ".test", ".invalid", ".example", "sv-academy.org"];

/** A URL Jurrgun may fetch, normalised (no fragment), or null. */
export function checkOutsideUrl(raw: string): URL | null {
  const s = raw.trim();
  if (!s || s.length > 1000) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".")) return null;
  // IP literals: v4 (also the short and hex forms URL may normalise to dots) and v6.
  if (/^[\d.]+$/.test(host) || /^0x/i.test(host) || host.includes(":") || host.startsWith("[")) return null;
  if (host === "localhost" || BLOCKED_SUFFIXES.some((x) => host === x.replace(/^\./, "") || host.endsWith(x.startsWith(".") ? x : `.${x}`))) return null;
  if (!/^[a-z0-9.-]+$/.test(host) || host.split(".").some((p) => !p || p.length > 63)) return null;
  u.hash = "";
  return u;
}

async function readCapped(res: Response, max: number): Promise<string | null> {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > max) return null;
  if (!res.body) return "";
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.byteLength;
  }
  return new TextDecoder("utf-8").decode(all);
}

/** GET a checked URL with redirects re-checked, a time limit and a size limit. */
export async function outsideGet(raw: string, opts: { maxBytes: number; timeoutMs?: number; accept: string; textTypes: RegExp }): Promise<Fetched> {
  const first = checkOutsideUrl(raw);
  if (!first) return { ok: false, error: "bad_url" };
  let url: URL = first;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 6000);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await doFetch(
        new Request(url.toString(), { method: "GET", redirect: "manual", signal, headers: { "user-agent": USER_AGENT, accept: opts.accept, "accept-language": "th,en;q=0.8" } }),
      );
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location");
        await res.body?.cancel().catch(() => {});
        const resolved: URL | null = next ? checkOutsideUrl(new URL(next, url).toString()) : null;
        if (!resolved) return { ok: false, error: "blocked_host" };
        url = resolved;
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        return { ok: false, error: `http_${res.status}` };
      }
      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      if (contentType && !opts.textTypes.test(contentType)) {
        await res.body?.cancel().catch(() => {});
        return { ok: false, error: "not_text" };
      }
      const text = await readCapped(res, opts.maxBytes);
      if (text === null) return { ok: false, error: "too_large" };
      return { ok: true, url: url.toString(), text, contentType };
    }
    return { ok: false, error: "blocked_host" };
  } catch (err) {
    const name = (err as { name?: string })?.name;
    return { ok: false, error: name === "TimeoutError" || name === "AbortError" ? "timeout" : "network" };
  }
}

/**
 * Does the site's robots.txt let JurrgunBot read `path`? Groups for
 * "jurrgunbot" win over "*"; the longest matching rule wins, Allow on a tie.
 * No robots.txt (4xx) means yes; a server error means no, for now.
 */
export function robotsAllows(robots: string, path: string, agent = "jurrgunbot"): boolean {
  type Rule = { allow: boolean; path: string };
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const line of robots.split(/\r?\n/)) {
    const clean = line.replace(/#.*/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(clean);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && current) {
      lastWasAgent = false;
      if (value) current.rules.push({ allow: key === "allow", path: value });
    } else {
      lastWasAgent = false;
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && agent.includes(a)));
  const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
  const matches = (rule: string) => {
    const anchored = rule.endsWith("$");
    const body = (anchored ? rule.slice(0, -1) : rule).split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    return new RegExp(`^${body}${anchored ? "$" : ""}`).test(path);
  };
  let best: Rule | null = null;
  for (const r of rules) {
    if (!matches(r.path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}

export async function robotsPermit(url: URL): Promise<boolean> {
  const res = await outsideGet(`${url.origin}/robots.txt`, { maxBytes: ROBOTS_MAX_BYTES, timeoutMs: 3000, accept: "text/plain", textTypes: /text\/|^$/ });
  if (!res.ok) return /^http_4\d\d$/.test(res.error) || res.error === "too_large" || res.error === "not_text";
  return robotsAllows(res.text, url.pathname + url.search);
}
