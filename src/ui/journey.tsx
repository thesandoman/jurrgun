/**
 * One progress bar for the whole first-time journey (owner, D1 2026-10-16):
 * welcome, the Bangkok Type quiz (its follow-ups included), the type reveal,
 * basics, privacy, the private settings and the first-time guide all fill the
 * same bar, in four named chapters. Each screen has a fixed place, so the bar
 * only ever moves forward, and a skipped screen (a follow-up nobody needed,
 * the optional wellbeing step) just jumps it ahead.
 */
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { MAX_FOLLOW_UPS } from "../vibe/adaptive";
import type { View } from "./kit";

/** friends | dating, chosen on the welcome screen before a profile exists. */
export const INTENT_COOKIE = "bkk_intent";

/** Where a page's screens sit: its first screen is number `from + 1` of `total`. */
export type Journey = { from: number; total: number; chapter: number };

export const CHAPTERS: [th: string, en: string][] = [
  ["ไทป์กรุงเทพฯ ของคุณ", "Your Bangkok Type"],
  ["ข้อมูลพื้นฐาน", "The basics"],
  ["ความเป็นส่วนตัว", "Privacy"],
  ["ก่อนเริ่มใช้งาน", "Before you start"],
];

export type JourneyStep = "welcome" | "dating" | "heard" | "quiz" | "type" | "basics" | "privacy" | "connections" | "wellbeing" | "guide";

/** The quiz's 16 questions; follow-ups (up to MAX_FOLLOW_UPS) come straight after. */
export const QUIZ_MAIN = 16;
const DATING_STEPS = 7;
const GUIDE_STEPS = 6;

/** Dating members get the two dating questions (and preferences), a "we hear you" screen and the 💘 step. */
export function journeyAt(step: JourneyStep, dating: boolean): Journey {
  const order: [JourneyStep, number, number][] = [
    ["welcome", 1, 1],
    ["dating", dating ? DATING_STEPS : 0, 1],
    ["heard", dating ? 1 : 0, 1],
    ["quiz", QUIZ_MAIN + MAX_FOLLOW_UPS, 1],
    ["type", 1, 1],
    ["basics", 1, 2],
    ["privacy", 1, 3],
    ["connections", dating ? 2 : 1, 3],
    ["wellbeing", 1, 3],
    ["guide", GUIDE_STEPS, 4],
  ];
  let from = 0;
  let at: Journey | undefined;
  for (const [s, n, chapter] of order) {
    if (s === step) at = { from, total: 0, chapter };
    from += n;
  }
  return { ...at!, total: from };
}

export function isDatingIntent(c: Context): boolean {
  const raw = getCookie(c, INTENT_COOKIE);
  return raw === "dating" || raw === "dating_only";
}

export const journeyFor = (c: Context, step: JourneyStep) => journeyAt(step, isDatingIntent(c));

export const journeyPct = (j: Journey, screen = 0) => Math.min(100, Math.round(((j.from + screen + 1) / j.total) * 100));

/**
 * The chapter name, "Part 2 of 4" and the bar. Flow pages pass `flow` so the
 * inline flow script moves the bar screen by screen.
 */
export function JourneyTop(props: { v: View; j: Journey; close?: string }) {
  const { t } = props.v;
  const pct = journeyPct(props.j);
  const [th, en] = CHAPTERS[props.j.chapter - 1];
  return (
    <div class="flow-top journey-top">
      <p class="journey-label">
        <b>{t(th, en)}</b>
        <span>{t(`ส่วนที่ ${props.j.chapter} จาก ${CHAPTERS.length}`, `Part ${props.j.chapter} of ${CHAPTERS.length}`)}</span>
      </p>
      <div class="flow-progress" role="progressbar" aria-label={t(th, en)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <i style={`width:${pct}%`} />
      </div>
      {props.close ? (
        <a href={props.close} class="flow-close" aria-label={t("ปิด", "Close")}>
          ✕
        </a>
      ) : null}
    </div>
  );
}
