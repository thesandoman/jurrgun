import type { Text } from "../content";

/**
 * Segment flavour (D7): the same scenario, answers and types, asked through
 * the member's own Bangkok story. Only the prompt changes, so a newcomer and a
 * local who pick the same answer get the same letters.
 *
 * Rule for a variant: every one of the scenario's 16 answers must still read
 * right after it. Familiar answers say "your usual", so a variant never says
 * "your first week" or "you don't know the city yet". Scenarios without a
 * variant for a segment keep their own prompt.
 */
export type SegmentPrompts = Partial<Record<"local" | "newcomer" | "international", Text>>;

const t = (en: string, th: string): Text => ({ en, th });

export const SEGMENT_PROMPTS: Record<string, SegmentPrompts> = {
  saturday: {
    local: t("A free Saturday afternoon in the city you grew up in. Where do you end up?", "บ่ายวันเสาร์ว่าง ๆ ในเมืองที่คุณโตมา สุดท้ายไปโผล่ที่ไหน?"),
    newcomer: t("A free Saturday afternoon, a few months after you moved to Bangkok. Where do you end up?", "บ่ายวันเสาร์ว่าง ๆ หลังย้ายมากรุงเทพฯ ได้ไม่กี่เดือน สุดท้ายไปโผล่ที่ไหน?"),
    international: t("A free Saturday afternoon in your new home city. Where do you end up?", "บ่ายวันเสาร์ว่าง ๆ ในเมืองใหม่ที่คุณมาอยู่ สุดท้ายไปโผล่ที่ไหน?"),
  },
  visitor: {
    local: t("A friend who moved away is back for one day and you're the guide. The plan?", "เพื่อนที่ย้ายไปอยู่ที่อื่นกลับมาเยี่ยมวันเดียว คุณเป็นไกด์ จะพาไปไหน?"),
    newcomer: t("A friend from your hometown visits for one day and you're the guide. The plan?", "เพื่อนจากบ้านเกิดมาเที่ยวกรุงเทพฯ วันเดียว คุณเป็นไกด์ จะพาไปไหน?"),
    international: t("A friend from back home flies in for one day and you're the guide. The plan?", "เพื่อนจากประเทศบ้านเกิดบินมาวันเดียว คุณเป็นไกด์ จะพาไปไหน?"),
  },
  parentsvisit: {
    newcomer: t("Your parents come to Bangkok to see your new life and leave the whole plan to you…", "พ่อแม่มาเยี่ยมชีวิตใหม่ของคุณที่กรุงเทพฯ แล้วให้คุณจัดแพลนทั้งหมด…"),
    international: t("Your parents fly in to see where you live now and leave the whole plan to you…", "พ่อแม่บินมาดูว่าตอนนี้คุณอยู่ที่ไหน แล้วให้คุณจัดแพลนทั้งหมด…"),
  },
  story: {
    newcomer: t("After a great Bangkok day, what are you telling everyone back home about?", "หลังจากวันดี ๆ ในกรุงเทพฯ คุณเล่าเรื่องอะไรให้คนที่บ้านฟัง?"),
    international: t("After a great Bangkok day, what are you messaging friends back home about?", "หลังจากวันดี ๆ ในกรุงเทพฯ คุณส่งข้อความเล่าอะไรให้เพื่อนที่ประเทศบ้านเกิดฟัง?"),
  },
  "stranger-dinner": {
    local: t("Dinner with five people who are new to the city, and you're the local at the table. Which table do you hope for?", "มื้อเย็นกับคน 5 คนที่เพิ่งมาอยู่กรุงเทพฯ และคุณเป็นคนกรุงเทพฯ คนเดียวในโต๊ะ อยากได้โต๊ะแบบไหน?"),
    newcomer: t("Still finding your people in Bangkok, you book dinner with five strangers through the app. Which table do you hope for?", "ยังหาคนรู้จักในกรุงเทพฯ อยู่ เลยจองมื้อเย็นกับคน 5 คนที่ไม่เคยเจอผ่านแอป อยากได้โต๊ะแบบไหน?"),
    international: t("Dinner with five people you've never met, some Thai and some from abroad, booked through the app. Which table do you hope for?", "มื้อเย็นที่จองผ่านแอปกับคน 5 คนที่ไม่เคยเจอ มีทั้งคนไทยและคนต่างชาติ อยากได้โต๊ะแบบไหน?"),
  },
  "new-group": {
    newcomer: t("New in town and you want a regular group to meet people. Which one?", "เพิ่งมาอยู่กรุงเทพฯ อยากหากลุ่มที่นัดเจอกันประจำ เลือกกลุ่มไหน?"),
    international: t("You want a regular group in Bangkok with friends from here and from abroad. Which one?", "อยากหากลุ่มที่นัดเจอกันประจำในกรุงเทพฯ ได้เพื่อนทั้งคนไทยและต่างชาติ เลือกกลุ่มไหน?"),
  },
  "know-one": {
    newcomer: t("Your one good friend in Bangkok invites you to an event full of their friends. What do you hope it is?", "เพื่อนสนิทคนเดียวในกรุงเทพฯ ชวนไปงานที่มีแต่เพื่อนของเขา อยากให้เป็นงานแบบไหน?"),
    international: t("A Thai friend invites you to an event where you only know them. What do you hope it is?", "เพื่อนคนไทยชวนไปงานที่คุณรู้จักแค่เขาคนเดียว อยากให้เป็นงานแบบไหน?"),
  },
  "new-coworker": {
    local: t("A coworker just moved to Bangkok and it's their first week. Where do you take them for lunch?", "เพื่อนร่วมงานคนใหม่เพิ่งย้ายมากรุงเทพฯ เป็นอาทิตย์แรก จะพาไปกินมื้อเที่ยงที่ไหน?"),
  },
  "weekday-off": {
    newcomer: t("A random weekday off in your new city, just you. How do you spend it?", "จู่ ๆ ได้หยุดวันธรรมดาในเมืองใหม่ มีแค่คุณคนเดียว จะใช้วันนี้ยังไง?"),
    international: t("A Thai public holiday you'd never heard of, just you. How do you spend it?", "วันหยุดราชการไทยที่คุณเพิ่งรู้ว่ามี มีแค่คุณคนเดียว จะใช้วันนี้ยังไง?"),
  },
};
