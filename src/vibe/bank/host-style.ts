import type { StyleScenario } from "../styles";

/**
 * Table Host: 10 short scenarios, only for members who host a Regular Table.
 * Each answer is a value of its dimension (welcome, include, plan; see
 * styles.ts); none of them moves the Bangkok Type.
 */
const a = (icon: string, value: string, en: string, th: string) => ({ icon, value, en, th });

export const HOST_STYLE: StyleScenario[] = [
  // ---------------------------------------------------------- welcome --
  {
    id: "hs-welcome-first",
    set: "host",
    dimension: "welcome",
    prompt: { en: "Six people at your Regular Table, two of them new. How do you start?", th: "โต๊ะประจำของคุณมา 6 คน มีคนใหม่ 2 คน คุณเริ่มยังไง?" },
    icon: "🍽️",
    tone: "evening",
    answers: [
      a("🎲", "game", "A two-minute name game so nobody forgets a name", "เกมจำชื่อ 2 นาที จะได้ไม่มีใครลืมชื่อใคร"),
      a("🥟", "food", "Order plates to share before anyone has to talk", "สั่งอาหารมาแบ่งกันก่อน ยังไม่ต้องคุยก็ได้"),
      a("🧺", "task", "Give everyone a small job, like picking a dish", "ให้ทุกคนมีงานเล็ก ๆ เช่น เลือกเมนูคนละจาน"),
      a("👋", "hello", "Greet each person at the door by name", "ทักทุกคนที่หน้าร้านพร้อมเรียกชื่อ"),
    ],
  },
  {
    id: "hs-welcome-late",
    set: "host",
    dimension: "welcome",
    prompt: { en: "Someone new arrives 20 minutes late, looking unsure. You:", th: "คนใหม่มาสาย 20 นาที ท่าทางไม่แน่ใจ คุณ…" },
    icon: "🚪",
    tone: "evening",
    answers: [
      a("🎲", "game", "Pull them into the game the table is playing", "ชวนเข้ามาเล่นเกมที่โต๊ะกำลังเล่นอยู่"),
      a("🍢", "food", "Slide the best plate their way", "เลื่อนจานที่อร่อยที่สุดไปให้"),
      a("📸", "task", "Ask them to take the group photo", "ขอให้ช่วยถ่ายรูปกลุ่ม"),
      a("🙂", "hello", "Stand up, say hello and introduce everyone", "ลุกไปทัก แล้วแนะนำทุกคนให้รู้จัก"),
    ],
  },
  {
    id: "hs-welcome-icebreak",
    set: "host",
    dimension: "welcome",
    prompt: { en: "The first ten minutes feel stiff. Your move:", th: "สิบนาทีแรกยังเกร็ง ๆ คุณจะทำยังไง?" },
    icon: "🧊",
    tone: "afternoon",
    answers: [
      a("🃏", "game", "A quick card game everyone can learn in a minute", "เกมไพ่ง่าย ๆ ที่เรียนรู้ได้ในหนึ่งนาที"),
      a("🧋", "food", "A round of Thai tea for the table", "สั่งชาไทยให้ทั้งโต๊ะ"),
      a("🗺️", "task", "Hand out a mini quest to do in pairs", "แจกเควสต์เล็ก ๆ ให้ทำเป็นคู่"),
      a("💬", "hello", "Go round and ask each person one easy question", "ถามทีละคน คนละคำถามง่าย ๆ"),
    ],
  },
  {
    id: "hs-welcome-regulars",
    set: "host",
    dimension: "welcome",
    prompt: { en: "Your regulars all know each other. A newcomer joins. You make sure:", th: "ขาประจำรู้จักกันหมดแล้ว มีคนใหม่มาร่วม คุณจะดูให้…" },
    icon: "🌱",
    tone: "afternoon",
    answers: [
      a("🎲", "game", "The first activity is a game with no inside jokes", "กิจกรรมแรกเป็นเกมที่ไม่มีมุกวงใน"),
      a("🍲", "food", "They choose the first dish to order", "เขาได้เลือกเมนูแรก"),
      a("🧭", "task", "They lead one small part of the plan", "เขาได้นำส่วนเล็ก ๆ ของแพลน"),
      a("🤝", "hello", "You sit them next to your friendliest regular", "ให้นั่งข้างขาประจำที่เป็นกันเองที่สุด"),
    ],
  },
  // ---------------------------------------------------------- include --
  {
    id: "hs-include-quiet",
    set: "host",
    dimension: "include",
    prompt: { en: "One person hasn't said much all evening. You:", th: "มีคนหนึ่งแทบไม่ได้พูดเลยทั้งคืน คุณ…" },
    icon: "🤫",
    tone: "evening",
    answers: [
      a("❓", "ask", "Ask them an easy question about their week", "ถามเรื่องง่าย ๆ เกี่ยวกับอาทิตย์นี้ของเขา"),
      a("🤝", "pair", "Pair them with someone who shares an interest", "จับคู่ให้คุยกับคนที่ชอบอะไรเหมือนกัน"),
      a("🎯", "job", "Ask them to keep score in the game", "ให้ช่วยนับแต้มในเกม"),
      a("🪑", "beside", "Move your seat next to them for a while", "ย้ายไปนั่งข้าง ๆ สักพัก"),
    ],
  },
  {
    id: "hs-include-loud",
    set: "host",
    dimension: "include",
    prompt: { en: "Two people are doing all the talking. To open it up:", th: "สองคนพูดอยู่ฝ่ายเดียว จะเปิดวงยังไงดี?" },
    icon: "📣",
    tone: "night",
    answers: [
      a("🙋", "ask", "Turn the topic into a question for the whole table", "เปลี่ยนเรื่องที่คุยเป็นคำถามให้ทั้งโต๊ะ"),
      a("🔀", "pair", "Swap seats so new pairs can talk", "สลับที่นั่งให้ได้คุยคู่ใหม่"),
      a("🎤", "job", "Give the quieter ones a turn to pick the next topic", "ให้คนที่เงียบกว่าได้เลือกหัวข้อต่อไป"),
      a("🪑", "beside", "Sit with the quieter end of the table", "ไปนั่งฝั่งโต๊ะที่เงียบกว่า"),
    ],
  },
  {
    id: "hs-include-language",
    set: "host",
    dimension: "include",
    prompt: { en: "Someone at your Table is more at home in another language. You:", th: "มีคนในโต๊ะถนัดอีกภาษามากกว่า คุณ…" },
    icon: "🗣️",
    tone: "afternoon",
    answers: [
      a("❓", "ask", "Ask them something they can answer in a few words", "ถามเรื่องที่ตอบได้ด้วยคำไม่กี่คำ"),
      a("🤝", "pair", "Pair them with someone who speaks both", "จับคู่กับคนที่พูดได้ทั้งสองภาษา"),
      a("📸", "job", "Make them the Table's photographer", "ให้เป็นช่างภาพประจำโต๊ะ"),
      a("🪑", "beside", "Sit beside them and translate the funny bits", "นั่งข้าง ๆ แล้วแปลมุกตลกให้ฟัง"),
    ],
  },
  // ------------------------------------------------------------- plan --
  {
    id: "hs-plan-month",
    set: "host",
    dimension: "plan",
    prompt: { en: "Planning next month for your Regular Table. You:", th: "วางแผนเดือนหน้าให้โต๊ะประจำ คุณ…" },
    icon: "🗓️",
    tone: "morning",
    answers: [
      a("📋", "detail", "Book every place and time weeks ahead", "จองที่และเวลาไว้ทุกนัดล่วงหน้าหลายอาทิตย์"),
      a("🌊", "loose", "Set the dates and decide places nearer the day", "กำหนดวันไว้ แล้วค่อยเลือกที่ใกล้ ๆ วัน"),
      a("🗳️", "vote", "Post a poll and let the Table choose", "ตั้งโพลให้คนในโต๊ะเลือก"),
      a("🔁", "ritual", "Keep the same day and the same spot", "วันเดิม ที่เดิม"),
    ],
  },
  {
    id: "hs-plan-rain",
    set: "host",
    dimension: "plan",
    prompt: { en: "Rain on the day of your outdoor Table. You:", th: "ฝนตกในวันที่โต๊ะนัดกันกลางแจ้ง คุณ…" },
    icon: "🌧️",
    tone: "rain",
    answers: [
      a("☂️", "detail", "Switch to the indoor backup you planned already", "เปลี่ยนไปที่ในร่มที่เตรียมไว้แล้ว"),
      a("🌊", "loose", "Find somewhere dry nearby on the spot", "หาที่หลบฝนใกล้ ๆ ตอนนั้นเลย"),
      a("🗳️", "vote", "Ask the Table chat what they'd like instead", "ถามในแชตโต๊ะว่าอยากไปไหนแทน"),
      a("🔁", "ritual", "Move to the café you always fall back on", "ย้ายไปคาเฟ่ที่ไปประจำเวลาฝนตก"),
    ],
  },
  {
    id: "hs-plan-new",
    set: "host",
    dimension: "plan",
    prompt: { en: "Your Table wants to try something new. You:", th: "คนในโต๊ะอยากลองอะไรใหม่ ๆ คุณ…" },
    icon: "✨",
    tone: "afternoon",
    answers: [
      a("📋", "detail", "Research it, book it and share the full plan", "หาข้อมูล จองให้ แล้วแชร์แพลนทั้งหมด"),
      a("🧭", "loose", "Pick a neighbourhood and wander together", "เลือกย่านหนึ่ง แล้วเดินสำรวจด้วยกัน"),
      a("🗳️", "vote", "Let each person suggest one idea, then vote", "ให้ทุกคนเสนอคนละไอเดีย แล้วโหวต"),
      a("🔁", "ritual", "Add one new thing to your usual night", "เพิ่มอย่างใหม่หนึ่งอย่างในนัดประจำ"),
    ],
  },
];
