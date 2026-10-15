/**
 * How removal works, in plain words. Shown on the code of conduct and in the
 * first-time guide; enforced in routes/admin/moderation.tsx with
 * domain/rules.ts removalAllowed (a named rule broken, or 3 flags).
 */
export const FAIR_PROCESS: [string, string][] = [
  ["ทุกรายงานมีทีมงานตรวจเอง แค่ถูกรายงานอย่างเดียวไม่ทำให้ใครโดนเชิญออก", "A person on our team reviews every report. A report alone never removes anyone."],
  ["เรื่องเล็กจะได้คำเตือน คำเตือนที่ยืนยันแล้วนับเป็น 1 ธง และมีผล 1 ปี", "Smaller issues get a warning. Each upheld warning is a flag, and a flag counts for a year."],
  [
    "จะถูกระงับหรือแบนก็ต่อเมื่อละเมิดข้อกำหนดหรือหลักปฏิบัติอย่างชัดเจน หรือมีครบ 3 ธง ธงที่ 3 หมายถึงระงับ 30 วัน",
    "You're only suspended or banned for clearly breaking a rule in our Terms or this code, or for reaching 3 flags. The third flag means a 30-day suspension.",
  ],
  [
    "การไม่มาหรือยกเลิกช้า (ภายใน 24 ชม.) นับเป็น strike ของกิจกรรม จะพักสิทธิ์ลงทะเบียนชั่วคราว แต่ไม่ปิดบัญชีของคุณ",
    "No-shows and late cancels (under 24 hours) are event strikes. They pause RSVPs for a while, but never remove your account.",
  ],
  ["เราจะแจ้งคุณทุกครั้งที่มีคำเตือนหรือการระงับ", "We always tell you when you get a warning or a suspension."],
];
