/**
 * How removal works, in plain words. Shown on the code of conduct and in the
 * first-time guide; enforced in routes/admin/moderation.tsx with
 * domain/rules.ts removalAllowed (a named rule broken, or 3 flags).
 */
export const FAIR_PROCESS: [string, string][] = [
  ["ทีมงานตรวจทุกรายงานด้วยตัวเอง การถูกรายงานอย่างเดียวจะไม่ทำให้ใครถูกเชิญออก", "A person on our team reviews every report. A report alone never removes anyone."],
  ["เรื่องเล็กจะได้รับคำเตือน คำเตือนที่ยืนยันแล้วแต่ละครั้งนับเป็น 1 ธง และธงจะนับอยู่ 1 ปี", "Smaller issues get a warning. Each upheld warning is a flag, and a flag counts for a year."],
  [
    "คุณจะถูกระงับหรือแบนก็ต่อเมื่อละเมิดกฎในข้อกำหนดการใช้งานหรือหลักปฏิบัตินี้อย่างชัดเจน หรือมีธงครบ 3 ธง ธงที่ 3 หมายถึงถูกระงับ 30 วัน",
    "You're only suspended or banned for clearly breaking a rule in our Terms or this code, or for reaching 3 flags. The third flag means a 30-day suspension.",
  ],
  [
    "การไม่มาตามนัดหรือยกเลิกช้า (น้อยกว่า 24 ชั่วโมงก่อนเริ่ม) นับเป็น strike ของกิจกรรม ซึ่งจะพักสิทธิ์ลงทะเบียนชั่วคราว แต่จะไม่ทำให้บัญชีของคุณถูกปิด",
    "No-shows and late cancels (under 24 hours) are event strikes. They pause RSVPs for a while, but never remove your account.",
  ],
  ["เราจะแจ้งคุณทุกครั้งที่คุณได้รับคำเตือนหรือถูกระงับ", "We always tell you when you get a warning or a suspension."],
];
