/**
 * City Pulse home content (owner decisions D62 to D66). Thai first
 * (design/reference/thai-voice.md). Every answer here is a coded option:
 * members never see anyone's words.
 */
import { CHANGES } from "./reflections";

type Opt = { value: string; th: string; en: string };

/** At most this many City Pulse answers a week (D64). The quiz's change reflection doesn't count. */
export const WEEK_CAP = 3;
/** Results show only once this many people answered; any answer picked by fewer is hidden (same as the BMA's k). */
export const HEARD_SHOWN = 3;
export const SUGGEST_MAX = 200;

/** After-table place check (D66): two optional tapped questions. */
export const PLACE_REACH: Opt[] = [
  { value: "easy", th: "ง่าย เดินหรือนั่งรถไฟฟ้ามาถึงสบาย", en: "Easy, an easy walk or train ride" },
  { value: "ok", th: "พอได้ ต่อรถหน่อย", en: "Fine, one or two changes" },
  { value: "hard", th: "ยาก หาทางมาลำบาก", en: "Hard to get to" },
];
export const PLACE_COMFORT: Opt[] = [
  { value: "yes", th: "มีร่มเงาหรือที่นั่งพอ", en: "Enough shade or seats" },
  { value: "some", th: "มีบ้าง ไม่พอ", en: "Some, not enough" },
  { value: "no", th: "ไม่มีเลย", en: "None" },
];

/** Topics a moderator sorts each suggested question into (D66). */
export const SUGGEST_TOPICS: Opt[] = [
  ...CHANGES.map(({ value, th, en }) => ({ value, th, en })),
  { value: "safety", th: "ความปลอดภัย", en: "Safety" },
  { value: "places", th: "สถานที่สาธารณะและกิจกรรม", en: "Public places and things to do" },
  { value: "cost", th: "ค่าครองชีพ", en: "Cost of living" },
  { value: "other", th: "อื่น ๆ", en: "Something else" },
];
