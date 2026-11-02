import { describe, expect, it } from "vitest";
import { HAS_DB, createMember, db, req } from "./helpers";
import { events } from "../src/schema";
import { newId } from "../src/lib/crypto";

describe.skipIf(!HAS_DB)("card F6 on the event page", () => {
  it("says which site the payment link goes to before the member leaves", async () => {
    const m = await createMember();
    const id = newId();
    const startsAt = new Date(Date.now() + 72 * 3_600_000);
    await db().insert(events).values({ id, title: `PAY-${id.slice(0, 8)}`, startsAt, endsAt: new Date(startsAt.getTime() + 7_200_000), venueName: "Cafe", district: "bang_rak", capacity: 8, costThb: 200, paymentUrl: "https://www.ticketmelon.com/e/abc", status: "published", createdBy: "test" });
    const en = await (await req(`/events/${id}?lang=en`, { cookie: m.cookie })).text();
    expect(en).toContain("Going to ticketmelon.com. Check before you pay.");
    const th = await (await req(`/events/${id}?lang=th`, { cookie: m.cookie })).text();
    expect(th).toContain("กำลังออกไปที่ ticketmelon.com เช็กก่อนจ่าย");
  });
});
