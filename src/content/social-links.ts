/**
 * Social links on a member's own profile (owner, 2026-10-16). Shown only to
 * mutual connections, and only while the member's "show my links to my
 * people" switch (consent category profile_links) is on. LINE is not here: it
 * stays in the per-person contact share on My people.
 *
 * Safety: a known network stores a canonical handle that matches a strict
 * pattern, and the link is always built from a fixed https template, so a
 * stored value can never become a javascript:, data: or off-site link.
 * Website and Other link store an https URL only (200 characters at most).
 * Plain emoji or text icons only, never brand logos.
 */
export type Text = { th: string; en: string };

export const PROFILE_LINKS_CONSENT = "profile_links";
export const LINK_URL_MAX = 200;

export type NetworkKey = "instagram" | "facebook" | "linkedin" | "tiktok" | "x" | "threads" | "website" | "link";

type HandleNetwork = {
  key: Exclude<NetworkKey, "website" | "link">;
  kind: "handle";
  th: string;
  en: string;
  icon: string;
  /** Hosts a pasted profile URL may come from (www. and m. are allowed too). */
  hosts: string[];
  pattern: RegExp;
  /** Handles are case-insensitive on these networks, so they are stored lowercase. */
  lower: boolean;
  /** Shown as "@name" (true) or as the bare name (Facebook, LinkedIn). */
  at: boolean;
  /** The only way a stored handle becomes a link. */
  url: (h: string) => string;
  /** Pulls the handle out of a pasted URL's path. */
  fromPath: (path: string[], search: URLSearchParams) => string | null;
};

type UrlNetwork = { key: "website" | "link"; kind: "url"; th: string; en: string; icon: string };

export type Network = HandleNetwork | UrlNetwork;

const first = (path: string[]) => path[0] ?? null;
const atFirst = (path: string[]) => (path[0]?.startsWith("@") ? path[0].slice(1) : null);

export const NETWORKS: Network[] = [
  {
    key: "instagram",
    kind: "handle",
    th: "Instagram",
    en: "Instagram",
    icon: "📸",
    hosts: ["instagram.com", "instagr.am"],
    pattern: /^(?!.*\.\.)(?!\.)(?!.*\.$)[a-z0-9._]{1,30}$/,
    lower: true,
    at: true,
    url: (h) => `https://www.instagram.com/${h}/`,
    fromPath: first,
  },
  {
    key: "facebook",
    kind: "handle",
    th: "Facebook",
    en: "Facebook",
    icon: "👥",
    hosts: ["facebook.com", "fb.com"],
    pattern: /^(?!\.)(?!.*\.$)[a-z0-9.]{3,50}$/,
    lower: true,
    at: false,
    url: (h) => `https://www.facebook.com/${h}`,
    // facebook.com/name, or facebook.com/profile.php?id=123 (stored as the number, which the template opens too).
    fromPath: (path, search) => (path[0] === "profile.php" ? search.get("id") : path[0] === "people" ? (path[2] ?? null) : first(path)),
  },
  {
    key: "linkedin",
    kind: "handle",
    th: "LinkedIn",
    en: "LinkedIn",
    icon: "💼",
    hosts: ["linkedin.com"],
    pattern: /^(?!-)(?!.*-$)[a-z0-9-]{3,100}$/,
    lower: true,
    at: false,
    url: (h) => `https://www.linkedin.com/in/${h}/`,
    fromPath: (path) => (path[0] === "in" ? (path[1] ?? null) : null),
  },
  {
    key: "tiktok",
    kind: "handle",
    th: "TikTok",
    en: "TikTok",
    icon: "🎵",
    hosts: ["tiktok.com"],
    pattern: /^(?!.*\.$)[a-z0-9._]{2,24}$/,
    lower: true,
    at: true,
    url: (h) => `https://www.tiktok.com/@${h}`,
    fromPath: atFirst,
  },
  {
    key: "x",
    kind: "handle",
    th: "X (Twitter)",
    en: "X (Twitter)",
    icon: "💬",
    hosts: ["x.com", "twitter.com"],
    pattern: /^[a-z0-9_]{1,15}$/,
    lower: true,
    at: true,
    url: (h) => `https://x.com/${h}`,
    fromPath: first,
  },
  {
    key: "threads",
    kind: "handle",
    th: "Threads",
    en: "Threads",
    icon: "🧵",
    hosts: ["threads.com", "threads.net"],
    pattern: /^(?!.*\.\.)(?!\.)(?!.*\.$)[a-z0-9._]{1,30}$/,
    lower: true,
    at: true,
    url: (h) => `https://www.threads.com/@${h}`,
    fromPath: atFirst,
  },
  { key: "website", kind: "url", th: "เว็บไซต์", en: "Website", icon: "🌐" },
  { key: "link", kind: "url", th: "ลิงก์อื่น ๆ", en: "Other link", icon: "🔗" },
];

export const NETWORK_KEYS = NETWORKS.map((n) => n.key);
export const networkOf = (key: string): Network | undefined => NETWORKS.find((n) => n.key === key);

export type LinkResult = { ok: true; value: string | null } | { ok: false; error: Text };

const bad = (th: string, en: string): LinkResult => ({ ok: false, error: { th, en } });

/** Is this host one of the network's (also with www. or m. in front)? */
function hostMatches(host: string, hosts: string[]): boolean {
  const h = host.toLowerCase().replace(/^(www|m|mobile)\./, "");
  return hosts.includes(h);
}

/** An https URL for Website / Other link, or the reason it can't be one. */
function normaliseUrl(raw: string): LinkResult {
  if (raw.length > LINK_URL_MAX) return bad(`ลิงก์ยาวได้ไม่เกิน ${LINK_URL_MAX} ตัวอักษร`, `Links can be at most ${LINK_URL_MAX} characters.`);
  if (/\s/.test(raw)) return bad("ลิงก์ต้องไม่มีช่องว่าง", "Links can't contain spaces.");
  // A bare "example.com" is read as https; anything that names another scheme is refused.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw);
  if (hasScheme && !/^https:\/\//i.test(raw)) return bad("ใช้ได้เฉพาะลิงก์ที่ขึ้นต้นด้วย https://", "Only links starting with https:// work here.");
  let u: URL;
  try {
    u = new URL(hasScheme ? raw : `https://${raw}`);
  } catch {
    return bad("ลิงก์นี้ไม่ถูกต้อง ลองคัดลอกมาใหม่", "That link doesn't look right. Try copying it again.");
  }
  if (u.protocol !== "https:") return bad("ใช้ได้เฉพาะลิงก์ที่ขึ้นต้นด้วย https://", "Only links starting with https:// work here.");
  if (u.username || u.password) return bad("ลิงก์นี้ไม่ถูกต้อง ลองคัดลอกมาใหม่", "That link doesn't look right. Try copying it again.");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname) || /^[0-9.]+$/.test(u.hostname)) {
    return bad("ลิงก์นี้ไม่ถูกต้อง ลองคัดลอกมาใหม่", "That link doesn't look right. Try copying it again.");
  }
  const href = u.href;
  if (href.length > LINK_URL_MAX) return bad(`ลิงก์ยาวได้ไม่เกิน ${LINK_URL_MAX} ตัวอักษร`, `Links can be at most ${LINK_URL_MAX} characters.`);
  return { ok: true, value: href };
}

/** A handle from "@name", "name" or a full profile URL on that network. */
function normaliseHandle(n: HandleNetwork, raw: string): LinkResult {
  if (raw.length > LINK_URL_MAX) return bad(`ยาวได้ไม่เกิน ${LINK_URL_MAX} ตัวอักษร`, `It can be at most ${LINK_URL_MAX} characters.`);
  let handle: string | null = raw;
  const looksLikeUrl = /^[a-z][a-z0-9+.-]*:/i.test(raw) || /^(www\.|m\.)?[a-z0-9-]+\.[a-z]{2,}\//i.test(raw) || raw.includes("/");
  if (looksLikeUrl) {
    const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw);
    if (hasScheme && !/^https?:\/\//i.test(raw)) return bad(`ใส่ชื่อผู้ใช้ ${n.th} หรือลิงก์โปรไฟล์ ${n.th}`, `Enter your ${n.en} username or profile link.`);
    let u: URL;
    try {
      u = new URL(hasScheme ? raw : `https://${raw}`);
    } catch {
      return bad(`ใส่ชื่อผู้ใช้ ${n.th} หรือลิงก์โปรไฟล์ ${n.th}`, `Enter your ${n.en} username or profile link.`);
    }
    if (!hostMatches(u.hostname, n.hosts)) return bad(`ลิงก์นี้ไม่ใช่ของ ${n.th}`, `That link isn't a ${n.en} link.`);
    const path = u.pathname.split("/").filter(Boolean).map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
    handle = n.fromPath(path, u.searchParams);
  }
  if (!handle) return bad(`ไม่พบชื่อผู้ใช้ในลิงก์ ${n.th} นี้`, `We couldn't find a username in that ${n.en} link.`);
  handle = handle.trim().replace(/^@/, "");
  if (n.lower) handle = handle.toLowerCase();
  if (!n.pattern.test(handle)) return bad(`ชื่อผู้ใช้ ${n.th} นี้ไม่ถูกต้อง`, `That ${n.en} username doesn't look right.`);
  return { ok: true, value: handle };
}

/**
 * Normalise what a member typed for one network. Empty means "remove it"
 * (value null). Never throws.
 */
export function normaliseLink(key: string, input: string): LinkResult {
  const n = networkOf(key);
  if (!n) return bad("ไม่รู้จักช่องทางนี้", "Unknown network.");
  const raw = input.trim();
  if (!raw) return { ok: true, value: null };
  return n.kind === "url" ? normaliseUrl(raw) : normaliseHandle(n, raw);
}

/**
 * The link to open, rebuilt from the stored value every time. A value that no
 * longer passes the rules (edited by hand, an old row) gives null and is not shown.
 */
export function linkHref(key: string, value: string): string | null {
  const n = networkOf(key);
  if (!n) return null;
  if (n.kind === "url") {
    const r = normaliseUrl(value);
    return r.ok && r.value === value ? value : null;
  }
  return n.pattern.test(value) ? n.url(value) : null;
}

/** What the member sees: "@name" for handle networks, the host and path for a website. */
export function linkText(key: string, value: string): string {
  const n = networkOf(key);
  if (!n) return value;
  if (n.kind === "handle") return n.at ? `@${value}` : value;
  try {
    const u = new URL(value);
    const rest = `${u.pathname === "/" ? "" : u.pathname}${u.search}`;
    return `${u.hostname.replace(/^www\./, "")}${rest}`;
  } catch {
    return value;
  }
}

/** The value to show back in the edit form: what the member would type ("@name" or the URL). */
export function linkInputValue(key: string, value: string): string {
  const n = networkOf(key);
  return n?.kind === "handle" && n.at ? `@${value}` : value;
}
