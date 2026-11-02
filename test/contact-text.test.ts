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
  it("keeps refusing letters-only handles the old filter caught (QA's cases)", () => {
    for (const s of ["ig sando", "ไอจี sando", "instagram sandosit", "my facebook is sandosit", "my line is sandosit", "ไลน์ผม sando99", "my insta is sando99", "line id: sunny", "ig: sunny", "ไลน์ คือ sando"]) {
      expect(hasContact(s), s).toBe(true);
    }
  });
  it("still leaves ordinary mentions alone", () => {
    for (const s of ["Instagram sometimes", "my line is busy", "on TikTok daily", "Facebook groups are fun", "Love IG stories", "I'm on Instagram mostly", "line cook for 3 years", "signal is bad here", "I saw it on TikTok yesterday", "I saw it on Instagram yesterday", "ig last week", "I use Facebook marketplace", "Love my telegram channel"]) {
      expect(hasContact(s), s).toBe(false);
    }
  });
  it("hides only the detail, keeping the sentence", () => {
    expect(maskContacts("ทักมาได้ LINE: sando99 นะ")).toBe("ทักมาได้ LINE: •••• นะ");
    expect(maskContacts("โทร 081-234-5678 หรือ ig sando_99")).toBe("โทร •••• หรือ ig ••••");
    expect(maskContacts("I post on Instagram sometimes")).toBe("I post on Instagram sometimes");
  });
});
