import { describe, expect, it } from "vitest";
import { hasContact, maskContacts } from "../src/domain/contact-text";

describe("card F2: finding contact details", () => {
  it("catches what the old chat filter missed (panel's cases)", () => {
    for (const s of ["ไลน์ sando99", "LINE: sando99", "line sando_99", "ไอดีไลน์ sando", "telegram: sando", "tg sando99", "Telegram @sando", "๐๘๑ ๒๓๔ ๕๖๗๘", "wechat: sando", "ติดต่อ wa.me/66812345678", "mail me sando@gmail.com"]) {
      expect(hasContact(s), s).toBe(true);
    }
  });
  it("leaves ordinary sentences alone (panel's false positives)", () => {
    for (const s of ["I post on Instagram sometimes", "Worked at Agoda.com", "LINE MAN rider for two years", "ชอบเล่น TikTok ตอนเย็น", "ทำงานที่ line มา 3 ปี", "Born 1995", "2019-2023 at Chula", "big fan of snapback hats", "Signal Hill hiker"]) {
      expect(hasContact(s), s).toBe(false);
    }
  });
  it("still catches what the chat filter caught", () => {
    for (const s of ["see www.example.com", "https://x.co/a", "call 081 234 5678", "my line id: sunny_99", "add me @sunny.bkk", "ig: sunny99", "shop.co/deal"]) expect(hasContact(s), s).toBe(true);
  });
  it("hides only the detail, keeping the sentence", () => {
    expect(maskContacts("ทักมาได้ LINE: sando99 นะ")).toBe("ทักมาได้ LINE: •••• นะ");
    expect(maskContacts("โทร 081-234-5678 หรือ ig sando_99")).toBe("โทร •••• หรือ ig ••••");
    expect(maskContacts("I post on Instagram sometimes")).toBe("I post on Instagram sometimes");
  });
});
