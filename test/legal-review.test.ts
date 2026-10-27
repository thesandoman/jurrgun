/**
 * The safe fixes from the legal review (owner, 16 Oct 2026), without a
 * database: the Terms box at sign-up, coded (not anonymous) research, the
 * service and safety rows as "not a consent", a consequence for every
 * withdrawable consent, the new notice and Terms lines, and the split list of
 * outside services.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import app from "../src/index";
import {
  APPEAL_REPLY_DAYS,
  CONSENT_CATEGORIES,
  NOTICE_DATE,
  NOTICE_ISO,
  PROCESSORS,
  RETENTION,
  TERMS_CONSENT,
  TERMS_VERSION,
} from "../src/content/privacy";
import { CONSENT_VERSION } from "../src/services/consent";

const get = async (path: string, lang: "th" | "en") => (await app.request(path, { headers: { cookie: `lang=${lang}` } }, {})).text();
const words = (html: string) =>
  html
    .slice(html.indexOf("<main"), html.indexOf("</main>"))
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\u2060/g, "")
    .replace(/\s+/g, " ");

describe("the Terms box at sign-up", () => {
  it("is a required box, never pre-ticked, with the Terms and notice opening in place", async () => {
    for (const lang of ["th", "en"] as const) {
      const html = await get("/signup", lang);
      const box = /<input[^>]*name="terms"[^>]*>/.exec(html)?.[0] ?? "";
      expect(box).toContain("required");
      expect(box).not.toContain("checked");
      expect(words(html)).toContain(lang === "th" ? "ฉันยอมรับข้อกำหนดการใช้งานและรับทราบนโยบายความเป็นส่วนตัว" : "I agree to the Terms of service and have read the privacy notice");
      // Both open in a sheet on the same page (no link away from the form).
      expect(html.match(/<details class="sheet[^"]*terms-sheet/g)).toHaveLength(2);
      const form = html.slice(html.indexOf('action="/signup"'), html.indexOf("</form>", html.indexOf('action="/signup"')));
      expect(form).not.toMatch(/<a href="\/(terms|privacy)"/);
    }
  });

  it("refuses a sign-up without the box ticked, before any account is made", async () => {
    const body = new URLSearchParams({ username: "no_terms_here", password: "longenough1", confirm: "longenough1" }).toString();
    const r = await app.request("/signup", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: "lang=en" }, body });
    expect(r.status).toBe(400);
    expect(await r.text()).toContain("Please agree to the Terms of service to sign up.");
  });

  it("the Terms version and every consent row's version follow the notice date", () => {
    expect(TERMS_VERSION).toBe(`terms-${NOTICE_ISO}`);
    expect(CONSENT_VERSION).toContain(NOTICE_ISO);
    const [y, m, d] = NOTICE_ISO.split("-").map(Number);
    expect(NOTICE_DATE.en).toBe(`${d} ${new Date(Date.UTC(y, m - 1, d)).toLocaleString("en-GB", { month: "long", timeZone: "UTC" })} ${y}`);
    expect(NOTICE_DATE.th).toContain(String(y + 543));
    expect(CONSENT_CATEGORIES.find((c) => c.key === TERMS_CONSENT)?.control).toBe("record");
  });
});

describe("City Pulse is coded, not anonymous", () => {
  const files = readdirSync("src", { recursive: true, encoding: "utf8" })
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("vendor/"))
    .map((f) => ({ path: `src/${f}`, text: readFileSync(`src/${f}`, "utf8") }));

  it("no line about City Pulse or research calls it anonymous, in either language", () => {
    const bad: string[] = [];
    for (const f of files) {
      f.text.split("\n").forEach((line, i) => {
        if (/City Pulse|research|pulse|วิจัย|wellbeing/i.test(line) && /anonym|ไม่ระบุตัวตน/i.test(line)) bad.push(`${f.path}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it("the notice, consent centre wording and onboarding say 'under a code, not your name' and name the wellbeing questions", async () => {
    const research = CONSENT_CATEGORIES.find((c) => c.key === "research")!;
    expect(research.hint.en).toContain("under a code, not your name");
    expect(research.hint.th).toContain("ใช้รหัสแทนชื่อ");
    expect(research.hint.en).toMatch(/wellbeing questions, such as how lonely you feel/);
    expect(research.hint.th).toContain("ความเหงา");
    const en = words(await get("/privacy", "en"));
    expect(en).toContain("under a code, not your name");
    expect(en).not.toMatch(/anonymous/i);
    expect(words(await get("/privacy", "th"))).not.toContain("ไม่ระบุตัวตน");
    expect(readFileSync("src/routes/onboarding.tsx", "utf8")).toContain("RESEARCH_HINT");
  });
});

describe("consents: what isn't a consent, and what switching off does", () => {
  it("service and safety are needed to run the app, never a switch", () => {
    for (const key of ["service", "safety"]) {
      const cat = CONSENT_CATEGORIES.find((c) => c.key === key)!;
      expect(cat.control).toBe("required");
      expect(cat.withdraw).toBeUndefined();
    }
  });

  it("every consent that can be switched off or withdrawn says what that does", () => {
    for (const cat of CONSENT_CATEGORIES.filter((c) => c.control === "toggle" || c.control === "withdraw")) {
      expect(cat.withdraw?.th, cat.key).toBeTruthy();
      expect(cat.withdraw?.en, cat.key).toMatch(/^If you (turn it off|withdraw)/);
    }
  });

  it("gender and relationship status can be withdrawn on the consent centre", () => {
    expect(CONSENT_CATEGORIES.find((c) => c.key === "gender_data")?.control).toBe("withdraw");
    expect(CONSENT_CATEGORIES.find((c) => c.key === "relationship_data")?.control).toBe("withdraw");
    expect(CONSENT_CATEGORIES.find((c) => c.key === "gender_data")?.withdraw?.en).toContain("you can't choose women-only tables");
  });
});

describe("the new notice and Terms lines", () => {
  it("the notice has the sign-up must-haves, disclosure to officials, the change clause, its date and the cookie line", async () => {
    const en = words(await get("/privacy", "en"));
    for (const line of [
      "nickname, birth date, district and how you're in Bangkok right now are needed to sign up; without them you can't join.",
      "We may disclose data to officials where the law requires it, for example on a court or official order.",
      "If we change this notice we'll tell you in the app, and we'll ask again before using data for a new purpose.",
      `This version applies from ${NOTICE_DATE.en}`,
      "The app's cookies are needed to run it, plus one, jg_src, that counts which campaign or partner link brought you.",
      "with your name and details removed",
    ]) {
      expect(en).toContain(line);
    }
    expect(en).not.toContain("We only use cookies the app needs");
    expect(en).not.toContain("nothing that identifies you");
    const th = words(await get("/privacy", "th"));
    for (const line of [
      "จำเป็นต่อการสมัคร ถ้าไม่ให้ จะสมัครไม่ได้",
      "เราอาจเปิดเผยข้อมูลให้เจ้าหน้าที่ตามที่กฎหมายกำหนด เช่น ตามคำสั่งศาลหรือพนักงานเจ้าหน้าที่",
      "ถ้าเราเปลี่ยนนโยบายนี้ เราจะแจ้งในแอป และถ้าจะใช้ข้อมูลเพื่อจุดประสงค์ใหม่ เราจะขอความยินยอมใหม่",
      `ฉบับนี้ใช้ตั้งแต่ ${NOTICE_DATE.th}`,
      "โดยลบชื่อและรายละเอียดของคุณออก",
    ]) {
      expect(th).toContain(line);
    }
    expect(RETENTION.find((r) => r.what.en === "Closed accounts")?.keep.en).toContain("with your name and details removed");
  });

  it("the Terms have the savings line, Thai courts and the OCPB, and an appeal through Report with a reply time", async () => {
    const en = words(await get("/terms", "en"));
    expect(en).toContain("This doesn't limit your legal rights, and doesn't exclude our liability for our own intent or negligence.");
    expect(en).toContain("Disputes go to Thai courts, and you can complain to the Office of the Consumer Protection Board (OCPB).");
    expect(en).toContain("tap Report on the event");
    expect(en).toContain(`We aim to reply within ${APPEAL_REPLY_DAYS} days.`);
    expect(APPEAL_REPLY_DAYS).toBe(7);
    expect(en).not.toContain("contact us below and we'll look again");
    const th = words(await get("/terms", "th"));
    expect(th).toContain("ข้อนี้ไม่จำกัดสิทธิของคุณตามกฎหมาย และไม่ยกเว้นความรับผิดของเราที่เกิดจากความจงใจหรือประมาทเลินเล่อของเรา");
    expect(th).toContain("ข้อพิพาทอยู่ในเขตอำนาจศาลไทย และคุณร้องเรียนสำนักงานคณะกรรมการคุ้มครองผู้บริโภค (สคบ.) ได้");
    // The savings line sits under Meeting in person.
    expect(en.indexOf("This doesn't limit")).toBeGreaterThan(en.indexOf("Meeting in person"));
    expect(en.indexOf("This doesn't limit")).toBeLessThan(en.indexOf("Closing an account"));
  });

  it("outside services are split into those that work for us and those with their own policies", async () => {
    const forUs = PROCESSORS.filter((p) => p.group === "for_us").map((p) => p.name).join(" · ");
    const own = PROCESSORS.filter((p) => p.group === "own").map((p) => p.name).join(" · ");
    for (const n of ["SV Cloud", "Cloudflare", "Resend", "Postmark", "Apple", "Mozilla", "Microsoft"]) expect(forUs).toContain(n);
    for (const n of ["Google · LINE", "Esri", "OpenStreetMap", "jsDelivr", "Google Maps", "Open-Meteo"]) expect(own).toContain(n);
    const en = words(await get("/privacy", "en"));
    expect(en).toContain("Work for us");
    expect(en).toContain("Their own services, under their own policies");
    expect(words(await get("/privacy", "th"))).toContain("บริการของเขาเอง ภายใต้นโยบายของเขา");
  });

  it("the page shell loads no outside fonts or stylesheets (card S2: fonts are self-hosted)", () => {
    const kit = readFileSync("src/ui/kit.tsx", "utf8");
    expect(kit).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    expect(kit).not.toMatch(/<link[^>]+rel="stylesheet"[^>]+href="https?:/);
  });
});
