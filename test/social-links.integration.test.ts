/**
 * Social links on profiles (owner, 2026-10-16), against local Postgres:
 * edited under /settings/profile, shown only to mutual connections while the
 * owner's switch is on, never across a block, never to guests or on the
 * member's own preview, removed on deactivation and deletion, and in the export.
 */
import { describe, expect, it } from "vitest";
import { and, desc, eq } from "drizzle-orm";
import { ENV, HAS_DB, createMember, db, req, type Member } from "./helpers";
import { newId, randomToken } from "../src/lib/crypto";
import { accounts, connections, consents, events, profileLinks, registrations } from "../src/schema";
import { runRetention } from "../src/services/retention";

const base = { nickname: "Ploy", district: "bang_rak", languages: ["th", "en"], interests: ["food"], intents: ["friends"], locale: "th" };
const th = (m: Member) => `${m.cookie}; lang=th`;
const rand = () => randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, "x");

/** Post the profile form with a links section. */
function saveLinks(m: Member, links: Record<string, string>, on: boolean) {
  const form: Record<string, string | string[]> = { ...base, links_present: "1" };
  for (const [k, v] of Object.entries(links)) form[`link_${k}`] = v;
  if (on) form.linksOn = "1";
  return req("/settings/profile", { cookie: th(m), form });
}

async function connect(a: Member, b: Member) {
  const id = newId();
  const [x, y] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
  await db().insert(connections).values({ id, aAccount: x, bAccount: y, level: "friend", eventId: newId() });
  return id;
}

async function rows(m: Member) {
  return db().select().from(profileLinks).where(eq(profileLinks.accountId, m.id));
}

const page = async (m: Member, path: string) => (await req(path, { cookie: m.cookie })).text();

/** A member with links on, and the handle to look for. */
async function owner() {
  const a = await createMember({ nickname: "Ploy" });
  const handle = `ploy${rand()}`;
  const r = await saveLinks(a, { instagram: `@${handle}`, website: `${handle}.example/menu` }, true);
  expect(r.status).toBe(302);
  return { a, handle };
}

describe.skipIf(!HAS_DB)("social links: editing", () => {
  it("normalises what was typed, stores one row per network and the switch as a consent row", async () => {
    const m = await createMember();
    const h = `p${rand()}`;
    const r = await saveLinks(m, { instagram: `https://www.instagram.com/${h.toUpperCase()}/`, tiktok: `@${h}_tt`, x: `twitter.com/${h}`, linkedin: `linkedin.com/in/${h}-s`, website: "ploy.example/me" }, true);
    expect(r.status).toBe(302);
    const got = Object.fromEntries((await rows(m)).map((x) => [x.network, x.value]));
    expect(got).toEqual({ instagram: h, tiktok: `${h}_tt`, x: h, linkedin: `${h}-s`, website: "https://ploy.example/me" });
    const [c] = await db().select().from(consents).where(and(eq(consents.accountId, m.id), eq(consents.category, "profile_links"))).orderBy(desc(consents.createdAt)).limit(1);
    expect(c.granted).toBe(true);

    // The form shows them back as typed, with the switch on.
    const form = await page(m, "/settings/profile");
    expect(form).toContain(`value="@${h}"`);
    expect(form).toMatch(/name="linksOn" value="1" checked/);
    expect(form).toContain("เห็นได้เฉพาะคนที่เลือกกันทั้งสองฝ่าย");

    // Clearing a field removes its row; switching off appends a new consent row (latest wins).
    expect((await saveLinks(m, { instagram: h, website: "" }, false)).status).toBe(302);
    expect((await rows(m)).map((x) => x.network)).toEqual(["instagram"]);
    const history = await db().select().from(consents).where(and(eq(consents.accountId, m.id), eq(consents.category, "profile_links")));
    expect(history.map((x) => x.granted).sort()).toEqual([false, true]);

    // A profile post without the links section leaves them alone.
    expect((await req("/settings/profile", { cookie: m.cookie, form: base })).status).toBe(302);
    expect((await rows(m)).length).toBe(1);
  });

  it("the switch is off by default", async () => {
    const m = await createMember();
    const form = await page(m, "/settings/profile");
    expect(form).toMatch(/name="linksOn" value="1"\s*\/?>/);
    expect(form).not.toMatch(/name="linksOn" value="1" checked/);
  });

  it("refuses javascript:, data:, http:, other sites and over-long links, in Thai first, and saves nothing", async () => {
    const m = await createMember();
    const cases: [string, string, string][] = [
      ["website", "javascript:alert(1)", "ใช้ได้เฉพาะลิงก์ที่ขึ้นต้นด้วย https://"],
      ["link", "data:text/html,<b>hi</b>", "ใช้ได้เฉพาะลิงก์ที่ขึ้นต้นด้วย https://"],
      ["website", "http://ploy.example", "ใช้ได้เฉพาะลิงก์ที่ขึ้นต้นด้วย https://"],
      ["link", `https://ploy.example/${"a".repeat(200)}`, "ลิงก์ยาวได้ไม่เกิน 200 ตัวอักษร"],
      ["instagram", "javascript:alert(1)", "Instagram"],
      ["instagram", "https://evil.example/ploy", "ลิงก์นี้ไม่ใช่ของ Instagram"],
      ["x", "not a handle!", "ชื่อผู้ใช้ X (Twitter) นี้ไม่ถูกต้อง"],
    ];
    for (const [key, value, message] of cases) {
      const r = await saveLinks(m, { [key]: value }, true);
      expect(r.status, `${key} ${value}`).toBe(400);
      const html = await r.text();
      expect(html).toContain(message);
      expect(html).toContain('aria-invalid="true"');
      expect(html).not.toContain('href="javascript:');
    }
    expect(await rows(m)).toEqual([]);
  });
});

describe.skipIf(!HAS_DB)("social links: who sees them", () => {
  it("a mutual connection with the switch on sees them, on the profile and in the My people sheet", async () => {
    const { a, handle } = await owner();
    const b = await createMember();
    await connect(a, b);
    const profile = await page(b, `/people/${a.id}`);
    expect(profile).toContain(`@${handle}`);
    expect(profile).toContain(`href="https://www.instagram.com/${handle}/"`);
    expect(profile).toContain(`href="https://${handle}.example/menu"`);
    expect(profile).toContain('rel="noopener noreferrer nofollow" target="_blank"');
    const people = await page(b, "/connections");
    expect(people).toContain(`@${handle}`);
  });

  it("a member who met them but isn't a mutual connection never sees them", async () => {
    const { a, handle } = await owner();
    const c = await createMember();
    // A shared, checked-in event lets c open the card, but they never chose each other.
    const ev = newId();
    await db().insert(events).values({ id: ev, title: "งาน", startsAt: new Date(Date.now() - 4 * 3_600_000), endsAt: new Date(Date.now() - 2 * 3_600_000), venueName: "Lumphini Park", district: "pathum_wan", capacity: 20, status: "published", createdBy: "test" });
    for (const m of [a, c]) await db().insert(registrations).values({ id: newId(), eventId: ev, accountId: m.id, status: "confirmed", passToken: randomToken(), checkedInAt: new Date(Date.now() - 3 * 3_600_000) });
    const res = await req(`/people/${a.id}`, { cookie: c.cookie });
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain(handle);
    expect(await page(c, "/connections")).not.toContain(handle);
  });

  it("the switch off hides them, even from mutual connections", async () => {
    const { a, handle } = await owner();
    const b = await createMember();
    await connect(a, b);
    expect(await page(b, `/people/${a.id}`)).toContain(handle);
    expect((await saveLinks(a, { instagram: handle }, false)).status).toBe(302);
    expect(await page(b, `/people/${a.id}`)).not.toContain(handle);
    expect(await page(b, "/connections")).not.toContain(handle);
  });

  it("removing the connection hides them at once", async () => {
    const { a, handle } = await owner();
    const b = await createMember();
    const conn = await connect(a, b);
    expect(await page(b, "/connections")).toContain(handle);
    expect((await req(`/connections/${conn}/remove`, { cookie: b.cookie, method: "POST" })).status).toBe(302);
    expect(await page(b, "/connections")).not.toContain(handle);
    expect(await page(b, `/people/${a.id}`)).not.toContain(handle);
  });

  it("a block in either direction hides them, even if a connection row comes back", async () => {
    for (const blockerIsOwner of [true, false]) {
      const { a, handle } = await owner();
      const b = await createMember();
      await connect(a, b);
      expect(await page(b, `/people/${a.id}`)).toContain(handle);
      const [blocker, blocked] = blockerIsOwner ? [a, b] : [b, a];
      expect((await req(`/block/${blocked.id}`, { cookie: blocker.cookie, method: "POST", form: { back: "/connections" } })).status).toBe(302);
      expect(await page(b, "/connections")).not.toContain(handle);
      // Even a fresh connection row (say, a later mutual choice) shows nothing while the block stands.
      await connect(a, b);
      expect(await page(b, "/connections")).not.toContain(handle);
      expect(await page(b, `/people/${a.id}`)).not.toContain(handle);
    }
  });

  it("never on the member's own preview, or to guests on public pages", async () => {
    const { a, handle } = await owner();
    expect(await page(a, "/me/profile")).not.toContain(handle);
    for (const path of ["/", "/events", "/events?view=list", "/privacy", `/people/${a.id}`]) {
      const res = await req(path);
      expect(await res.text(), path).not.toContain(handle);
    }
    // The privacy notice says who can see them.
    expect(await (await req("/privacy")).text()).toContain("ลิงก์โซเชียลในโปรไฟล์ของคุณ เห็นได้เฉพาะคนที่เลือกกันทั้งสองฝ่าย");
    expect(await (await req("/privacy?lang=en")).text()).toContain("visible only to mutual connections");
  });
});

describe.skipIf(!HAS_DB)("social links: export and removal", () => {
  it("the data export includes the member's own links", async () => {
    const { a, handle } = await owner();
    const res = await req("/settings/privacy/export", { cookie: a.cookie });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { socialLinks: { network: string; value: string; shownAs: string }[]; consents: { category: string; granted: boolean }[] };
    expect(data.socialLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ network: "instagram", value: handle, shownAs: `@${handle}` }),
        expect.objectContaining({ network: "website", value: `https://${handle}.example/menu` }),
      ]),
    );
    expect(data.consents.find((c) => c.category === "profile_links")?.granted).toBe(true);
  });

  it("deactivating deletes the rows at once", async () => {
    const { a, handle } = await owner();
    const b = await createMember();
    await connect(a, b);
    expect((await rows(a)).length).toBe(2);
    const r = await req("/settings/deactivate", { cookie: a.cookie, form: { confirm: "1" } });
    expect(r.status).toBe(302);
    expect(await rows(a)).toEqual([]);
    expect(await page(b, "/connections")).not.toContain(handle);
  });

  it("account deletion (retention) deletes any rows left", async () => {
    const m = await createMember();
    await db().insert(profileLinks).values({ id: newId(), accountId: m.id, network: "x", value: `gone${rand()}` });
    await db()
      .update(accounts)
      .set({ status: "deactivated", deactivatedAt: new Date(Date.now() - 31 * 86_400_000) })
      .where(eq(accounts.id, m.id));
    await runRetention(ENV);
    expect(await rows(m)).toEqual([]);
  });
});
