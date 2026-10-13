/**
 * Content rules for the hand-written quiz bank (src/vibe/bank/*.ts). Used by
 * test/bank.test.ts and by scripts/check-bank.ts while writing new scenarios.
 */
import { DISTRICTS } from "../lib/constants";
import type { Scenario } from "./scenarios";

const CODES = [
  "BDMN", "BDMH", "BDSN", "BDSH", "BFMN", "BFMH", "BFSN", "BFSH",
  "CDMN", "CDMH", "CDSN", "CDSH", "CFMN", "CFMH", "CFSN", "CFSH",
];
const FLIP: Record<string, string> = { B: "C", C: "B", D: "F", F: "D", M: "S", S: "M", N: "H", H: "N" };
const opposite = (c: string) => c.split("").map((ch) => FLIP[ch]).join("");

const CONTEXTS = new Set(["friends", "family", "date", "solo", "coworkers", "party", "meetup"]);
const KINDS = new Set(["core", "rhythm", "plan"]);
const TONES = new Set(["dawn", "morning", "afternoon", "evening", "night", "rain"]);
export const DISTRICT_KEYS = new Set(DISTRICTS.map((d) => d.value));

/** Civic, political and religious-practice words (same list as the old quiz). */
export const BANNED_EN =
  /policy|policies|government|politic|vote|voting|election|ballot|budget|tax\b|taxes|rules?\b|regulat|law\b|cctv|surveillance|police|security guard|expert|resident|public money|subsid|campaign|party (?:member|leader|line|politics)|ideolog|religio|worship|monk|alms|merit|pray|LGBT|gender|income|salary|protest|candidate|parliament|minister|governor|BMA\b/i;
export const BANNED_TH = /การเมือง|เลือกตั้ง|โหวต|ลงคะแนน|ภาษี(?!เจริญ)|งบประมาณ|ตำรวจ|กล้องวงจรปิด|ศาสนา|ไหว้พระ|ตักบาตร|ทำบุญ|พรรค|รัฐบาล|นโยบาย|กฎหมาย|ผู้ว่า|ประท้วง|รายได้|เงินเดือน/;
/** Gendered words: every answer has to work for anyone. */
export const GENDERED_EN = /\b(he|she|him|her|his|hers|himself|herself|boyfriend|girlfriend|husband|wife|guys|girls|boys|ladies|gentlemen|mom|dad|mum)\b/i;
export const GENDERED_TH = /ครับ|ค่ะ|แฟนหนุ่ม|แฟนสาว|สามี|ภรรยา|หนุ่ม ๆ|สาว ๆ/;
/** Family friendly: no alcohol, drugs, gambling or anything adult. */
export const ADULT_EN = /\b(beer|beers|wine|cocktails?|booze|alcohol|drunk|drinks?|drinking|shots?|hangover|sexy|hook ?up|casino|bet|betting|gambl\w*|weed|cannabis|smoking|cigarettes?|vape)\b/i;
export const ADULT_TH = /เบียร์|ไวน์|เหล้า|ค็อกเทล|เมา|แอลกอฮอล์|กัญชา|บุหรี่|พนัน|คาสิโน/;

export type BankCheck = { errors: string[]; districts: { counts: Map<string, number>; missing: string[] } };

export function checkScenarios(list: Scenario[], opts: { requireEveryDistrict?: boolean } = {}): BankCheck {
  const errors: string[] = [];
  const ids = new Set<string>();
  const seenEn = new Set<string>();
  const counts = new Map<string, number>();
  const text = (where: string, en: string, th: string) => {
    if (!en?.trim()) errors.push(`${where}: empty English`);
    if (!th?.trim()) errors.push(`${where}: empty Thai`);
    for (const [re, what] of [
      [/[–—]/, "em or en dash"],
      [BANNED_EN, "civic/political/religious word"],
      [GENDERED_EN, "gendered word"],
      [ADULT_EN, "not family friendly"],
    ] as const) {
      const m = re.exec(en ?? "");
      if (m) errors.push(`${where}: ${what} "${m[0]}" in EN: ${en}`);
    }
    for (const [re, what] of [
      [/[–—]/, "em or en dash"],
      [BANNED_TH, "civic/political/religious word"],
      [GENDERED_TH, "gendered word"],
      [ADULT_TH, "not family friendly"],
    ] as const) {
      const m = re.exec(th ?? "");
      if (m) errors.push(`${where}: ${what} "${m[0]}" in TH: ${th}`);
    }
  };
  for (const sc of list) {
    const w = `scenario ${sc.id}`;
    if (!sc.id || ids.has(sc.id)) errors.push(`${w}: missing or duplicate id`);
    ids.add(sc.id);
    if (!KINDS.has(sc.kind)) errors.push(`${w}: bad kind ${sc.kind}`);
    if (!CONTEXTS.has(sc.context)) errors.push(`${w}: bad context ${sc.context}`);
    if (!TONES.has(sc.tone)) errors.push(`${w}: bad tone ${sc.tone}`);
    if (!sc.icon) errors.push(`${w}: no icon`);
    text(`${w} prompt`, sc.prompt?.en, sc.prompt?.th);
    const keys = Object.keys(sc.answers ?? {});
    if (keys.length !== 16 || !CODES.every((c) => keys.includes(c))) errors.push(`${w}: needs exactly the 16 type codes, has ${keys.join(",")}`);
    for (const code of CODES) {
      const a = sc.answers?.[code as keyof typeof sc.answers];
      if (!a) continue;
      const aw = `${w} ${code}`;
      text(aw, a.en, a.th);
      if (!a.icon) errors.push(`${aw}: no icon`);
      if (!DISTRICT_KEYS.has(a.district)) errors.push(`${aw}: unknown district "${a.district}"`);
      counts.set(a.district, (counts.get(a.district) ?? 0) + 1);
      const key = a.en?.toLowerCase().trim();
      if (seenEn.has(key)) errors.push(`${aw}: duplicate answer text`);
      seenEn.add(key);
      if (sc.kind === "core" && a.flavour !== undefined) errors.push(`${aw}: core answers have no flavour`);
      if (sc.kind !== "core") {
        if (a.flavour !== 1 && a.flavour !== -1) errors.push(`${aw}: ${sc.kind} answers need flavour 1 or -1`);
        const opp = sc.answers?.[opposite(code) as keyof typeof sc.answers];
        if (opp && a.flavour !== undefined && opp.flavour === a.flavour) errors.push(`${aw}: flavour must be the opposite of ${opposite(code)}'s`);
      }
    }
  }
  for (const sc of list) {
    if (sc.twin && !list.some((x) => x.id === sc.twin) && opts.requireEveryDistrict === undefined) errors.push(`scenario ${sc.id}: twin ${sc.twin} not found`);
  }
  const missing = opts.requireEveryDistrict ? [...DISTRICT_KEYS].filter((d) => !counts.has(d)) : [];
  return { errors, districts: { counts, missing } };
}
