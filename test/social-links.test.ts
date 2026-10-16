/**
 * Social links: what a member types becomes a canonical handle or an https
 * URL, and every link is rebuilt from a fixed template (src/content/social-links.ts).
 */
import { describe, expect, it } from "vitest";
import { linkHref, linkInputValue, linkText, normaliseLink } from "../src/content/social-links";

const ok = (key: string, raw: string) => {
  const r = normaliseLink(key, raw);
  if (!r.ok) throw new Error(`${key} ${raw}: ${r.error.en}`);
  return r.value;
};
const refused = (key: string, raw: string) => {
  const r = normaliseLink(key, raw);
  return r.ok ? null : r.error;
};

describe("normaliseLink: handles", () => {
  it("accepts @name, name or a full profile URL and stores one canonical handle", () => {
    for (const raw of ["@Ploy.Eats", "ploy.eats", "https://www.instagram.com/ploy.eats/", "instagram.com/Ploy.Eats?igsh=abc", "http://m.instagram.com/ploy.eats"]) {
      expect(ok("instagram", raw)).toBe("ploy.eats");
    }
    expect(ok("tiktok", "https://www.tiktok.com/@ploy_tt?lang=en")).toBe("ploy_tt");
    expect(ok("x", "twitter.com/PloyX")).toBe("ployx");
    expect(ok("x", "https://x.com/ployx/status/1")).toBe("ployx");
    expect(ok("threads", "https://www.threads.net/@ploy.eats")).toBe("ploy.eats");
    expect(ok("linkedin", "https://www.linkedin.com/in/ploy-s/")).toBe("ploy-s");
    expect(ok("facebook", "https://www.facebook.com/profile.php?id=100012345678")).toBe("100012345678");
    expect(ok("facebook", "fb.com/ploy.s")).toBe("ploy.s");
  });

  it("an empty field means remove", () => {
    expect(ok("instagram", "   ")).toBeNull();
  });

  it("refuses other schemes, other sites and names outside the network's pattern", () => {
    expect(refused("instagram", "javascript:alert(1)")).toBeTruthy();
    expect(refused("instagram", "data:text/html,hi")).toBeTruthy();
    expect(refused("instagram", "https://evil.example/ploy")).toEqual({ th: "ลิงก์นี้ไม่ใช่ของ Instagram", en: "That link isn't from Instagram." });
    expect(refused("instagram", "https://instagram.com.evil.example/ploy")).toBeTruthy();
    expect(refused("instagram", "ploy eats")).toBeTruthy();
    expect(refused("instagram", "<script>")).toBeTruthy();
    expect(refused("instagram", "a".repeat(31))).toBeTruthy();
    expect(refused("x", "a".repeat(16))).toBeTruthy();
    expect(refused("linkedin", "https://www.linkedin.com/company/acme")).toBeTruthy();
    expect(refused("tiktok", "https://www.tiktok.com/ploy")).toBeTruthy();
    expect(refused("nope", "ploy")).toBeTruthy();
  });
});

describe("normaliseLink: website and other link", () => {
  it("keeps https URLs and reads a bare domain as https", () => {
    expect(ok("website", "https://ploy.example/menu")).toBe("https://ploy.example/menu");
    expect(ok("link", "ploy.example")).toBe("https://ploy.example/");
  });

  it("refuses http, javascript:, data:, credentials, IPs and anything over 200 characters", () => {
    expect(refused("website", "http://ploy.example")?.th).toBe("ใช้ได้เฉพาะลิงก์ที่ขึ้นต้นด้วย https://");
    expect(refused("website", "javascript:alert(1)")).toBeTruthy();
    expect(refused("website", "JavaScript:alert(1)")).toBeTruthy();
    expect(refused("link", "data:text/html;base64,PHNjcmlwdD4=")).toBeTruthy();
    expect(refused("link", "https://user:pw@ploy.example")).toBeTruthy();
    expect(refused("link", "https://127.0.0.1/x")).toBeTruthy();
    expect(refused("link", "https://localhost/x")).toBeTruthy();
    expect(refused("link", "https://ploy.example/a b")).toBeTruthy();
    expect(refused("link", `https://ploy.example/${"a".repeat(200)}`)?.th).toBe("ลิงก์ยาวได้ไม่เกิน 200 ตัวอักษร");
  });
});

describe("linkHref and linkText", () => {
  it("builds the link from the fixed template and shows @name", () => {
    expect(linkHref("instagram", "ploy.eats")).toBe("https://www.instagram.com/ploy.eats/");
    expect(linkHref("tiktok", "ploy_tt")).toBe("https://www.tiktok.com/@ploy_tt");
    expect(linkHref("x", "ployx")).toBe("https://x.com/ployx");
    expect(linkText("instagram", "ploy.eats")).toBe("@ploy.eats");
    expect(linkText("linkedin", "ploy-s")).toBe("ploy-s");
    expect(linkText("website", "https://www.ploy.example/menu")).toBe("ploy.example/menu");
    expect(linkInputValue("threads", "ploy")).toBe("@ploy");
  });

  it("never turns a bad stored value into a link", () => {
    expect(linkHref("instagram", "javascript:alert(1)")).toBeNull();
    expect(linkHref("website", "javascript:alert(1)")).toBeNull();
    expect(linkHref("website", "http://ploy.example/")).toBeNull();
    expect(linkHref("unknown", "x")).toBeNull();
  });
});
