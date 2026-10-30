/**
 * Thai words split mid-word at 200% text on onboarding (ต่าง|ประเทศ, ช่วง|หนึ่ง, คละ|คนในโต๊ะ,
 * ไม่|แสดงให้ใครเห็น). No CSS caused it: the browser's Thai dictionary allows a break inside those
 * compounds. keepThaiWords puts an invisible word joiner (U+2060) there, on flow hints, answer cards
 * and option pills, and leaves English alone.
 */
import { describe, expect, it } from "vitest";
import { AnswerCard, FlowStep, keepThaiWords, THAI_KEEP } from "../src/ui/flow";
import { OptRadios } from "../src/ui/profile-form";
import { BKK_STORY } from "../src/content/profile";
import { STYLES } from "../src/ui/styles";
import { A11Y_CSS } from "../src/ui/a11y-css";
import { NATIVE_CSS } from "../src/ui/native";
import { TYPE_CSS } from "../src/ui/fonts";
import { LAYOUT_CSS } from "../src/ui/layout";

const WJ = "⁠";
const html = async (el: unknown) => String(await (el as { toString(): string | Promise<string> }).toString());
const view = (lang: "th" | "en") => ({ lang, t: (th: string, en: string) => (lang === "th" ? th : en) }) as never;

describe("keepThaiWords", () => {
  it("joins the compounds that split on onboarding", () => {
    expect(keepThaiWords("คนไทยกลับจากต่างประเทศ")).toBe(`คนไทยกลับจากต่าง${WJ}ประเทศ`);
    expect(keepThaiWords("มาอยู่กรุงเทพฯ ช่วงหนึ่ง")).toBe(`มาอยู่กรุงเทพฯ ช่วง${WJ}หนึ่ง`);
    expect(keepThaiWords("เราใช้เพื่อคละคนในโต๊ะ")).toBe(`เราใช้เพื่อคละ${WJ}คนในโต๊ะ`);
    expect(keepThaiWords("วันเกิดใช้เช็กว่าอายุ 18+ ไม่แสดงให้ใครเห็น")).toBe(`วันเกิดใช้เช็กว่าอายุ 18+ ไม่${WJ}แสดงให้ใครเห็น`);
    // Every pair, more than once in a string.
    for (const [a, b] of THAI_KEEP) expect(keepThaiWords(`${a}${b} ${a}${b}`)).toBe(`${a}${WJ}${b} ${a}${WJ}${b}`);
  });

  it("leaves English and other Thai untouched", () => {
    for (const s of ["Thai, back from abroad", "We use it to mix your table. Optional.", "ยินดีต้อนรับทุกคน"]) expect(keepThaiWords(s)).toBe(s);
  });

  it("is applied to flow hints, answer cards and option pills", async () => {
    expect(await html(<FlowStep title="t" hint="เราใช้เพื่อคละคนในโต๊ะ" />)).toContain(`คละ${WJ}คน`);
    expect(await html(<FlowStep title="t" hint="ไม่แสดงให้ใครเห็น" info={<p>i</p>} />)).toContain(`ไม่${WJ}แสดง`);
    expect(await html(<AnswerCard name="a" value="b" label="ต่างประเทศ" />)).toContain(`ต่าง${WJ}ประเทศ`);
    const th = await html(<OptRadios v={view("th")} name="story" options={BKK_STORY} />);
    expect(th).toContain(`ต่าง${WJ}ประเทศ`);
    expect(th).toContain(`ช่วง${WJ}หนึ่ง`);
    expect(th).not.toContain("ต่างประเทศ");
    const en = await html(<OptRadios v={view("en")} name="story" options={BKK_STORY} />);
    expect(en).not.toContain(WJ);
    expect(en).toContain("Thai, back from abroad");
  });
});

describe("flow text CSS", () => {
  it("has no rule that lets the flow's hints, answers or pills break anywhere", () => {
    const css = [STYLES, A11Y_CSS, NATIVE_CSS, TYPE_CSS, LAYOUT_CSS].join("\n");
    const rules = css.match(/[^{}]+\{[^{}]*\}/g) ?? [];
    const loose = rules.filter((r) => /(overflow-wrap|word-wrap)\s*:\s*(anywhere|break-word)|word-break\s*:\s*break-(all|word)|hyphens\s*:\s*auto/.test(r));
    const hits = loose.filter((r) => /\.flow|\.pill|\.answer|(^|[\s,}])(body|html|\*|:root)\s*[,{]/.test(r.split("{")[0]));
    expect(hits).toEqual([]);
  });
});
