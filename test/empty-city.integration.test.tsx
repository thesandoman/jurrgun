/**
 * Owner card 3 (2026-10-27): an honest empty city. With nothing coming up,
 * Discover's empty state (the map's sheet and the list view share
 * NoEventsYet) says how a Table works in three lines and lists up to 3 real
 * Regular Tables still taking people. With none, that section is not there
 * at all. Suggest an event stays the primary action, the district alert
 * stays under it, and there are no sample events.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { tr } from "../src/lib/i18n";
import { newId, randomToken } from "../src/lib/crypto";
import { blocks, profiles, regularTableMembers, regularTables } from "../src/schema";
import { MAX_MEMBERS } from "../src/domain/regular-tables";
import { formingTables } from "../src/services/regular-tables";
import { NoEventsYet, type FormingTable } from "../src/ui/discover-map";
import { HAS_DB, createMember, db } from "./helpers";

const en = tr("en");
const th = tr("th");
const alert = { state: "off" as const, district: "bang_rak", settingsHref: "/settings#push" };
const four: FormingTable[] = [
  { id: "tA", name: "Sunday Park Walkers", place: "Khlong Toei" },
  { id: "tB", name: "Ari Coffee Table", place: "Phaya Thai" },
  { id: "tC", name: "Old Town Sketchers", place: "Phra Nakhon" },
  { id: "tD", name: "Fourth One", place: "Bang Rak" },
];

describe("the empty city", () => {
  it("says how a Table works in exactly three lines, Thai first", () => {
    const html = String(<NoEventsYet t={th} filtered={false} clearHref="/" alert={alert} />);
    expect(html).toContain("โต๊ะที่ Jurrgun เป็นแบบนี้");
    const how = html.slice(html.indexOf('class="fd-how"'), html.indexOf("</ol>"));
    expect(how.match(/<li>/g)).toHaveLength(3);
    expect(how).toContain("4 ถึง 6 คน");
    expect(how).toContain("72 ชั่วโมง");
    const enHtml = String(<NoEventsYet t={en} filtered={false} clearHref="/" />);
    expect(enHtml).toContain("How a Table works");
    expect(enHtml).toContain("4 to 6 people at a real Bangkok place, with a host.");
    expect(enHtml).toContain("You connect only if it&#39;s mutual.");
  });

  it("has no Regular Tables section when none are forming: no heading, no placeholder, no 0", () => {
    for (const tables of [undefined, []]) {
      const html = String(<NoEventsYet t={en} filtered={false} clearHref="/" alert={alert} tables={tables} />);
      expect(html).not.toContain("fd-forming");
      expect(html).not.toContain("Regular Tables forming now");
      expect(html).not.toContain("/tables/");
      expect(html).not.toMatch(/>\s*0\s*</);
    }
  });

  it("lists up to 3 real tables, each a link to its own page", () => {
    const html = String(<NoEventsYet t={en} filtered={false} clearHref="/" alert={alert} tables={four} />);
    expect(html).toContain("Regular Tables forming now");
    expect(html.match(/href="\/tables\//g)).toHaveLength(3);
    expect(html).toContain('href="/tables/tA"');
    expect(html).toContain("Sunday Park Walkers");
    expect(html).toContain("Khlong Toei");
    expect(html).not.toContain("Fourth One");
    expect(String(<NoEventsYet t={th} filtered={false} clearHref="/" tables={four} />)).toContain("โต๊ะประจำที่กำลังรวมคน");
  });

  it("keeps Suggest an event the one primary action, with the district alert right under it", () => {
    const html = String(<NoEventsYet t={en} filtered={false} clearHref="/" alert={alert} tables={four} />);
    expect(html.match(/btn primary/g)).toHaveLength(1);
    expect(html).toContain('class="btn primary" href="/host/new"');
    const suggest = html.indexOf("/host/new");
    const optIn = html.indexOf("/events/district-alert");
    expect(optIn).toBeGreaterThan(suggest);
    expect(html.indexOf("fd-how")).toBeGreaterThan(optIn);
    expect(html.indexOf("fd-forming")).toBeGreaterThan(html.indexOf("fd-how"));
  });

  it("shows no sample events, and the filtered state is unchanged", () => {
    const html = String(<NoEventsYet t={en} filtered={false} clearHref="/" alert={alert} tables={four} />);
    expect(html).not.toMatch(/href="\/events\//);
    expect(html).not.toContain("ev-card");
    expect(html).not.toMatch(/[–—]/);
    const filtered = String(<NoEventsYet t={en} filtered clearHref="/" tables={four} />);
    expect(filtered).not.toContain("fd-how");
    expect(filtered).not.toContain("fd-forming");
  });

  it("the list view renders the same empty state (map sheet and list share NoEventsYet)", () => {
    const src = readFileSync("src/routes/events/discover.tsx", "utf8");
    expect(src.match(/<NoEventsYet[^>]*tables=\{forming\}/g)).toHaveLength(2);
  });
});

async function table(host: string, opts: { name?: string; womenOnly?: boolean; archived?: boolean; at?: Date } = {}) {
  const id = newId();
  await db()
    .insert(regularTables)
    .values({
      id,
      hostAccountId: host,
      name: opts.name ?? `Table ${id.slice(0, 4)}`,
      district: "khlong_toei",
      joinToken: randomToken(18),
      womenOnly: opts.womenOnly ?? false,
      archivedAt: opts.archived ? new Date() : null,
      createdAt: opts.at ?? new Date(),
    });
  return id;
}

describe.skipIf(!HAS_DB)("formingTables, the real Regular Tables still taking people", () => {
  it("newest first, at most 3, and only tables the viewer could open and join", async () => {
    const viewer = await createMember();
    await db().update(profiles).set({ gender: "man" }).where(eq(profiles.accountId, viewer.id));
    const host = await createMember({ role: "circle_head" });
    const now = Date.now(); // newer than any table made before this test
    const older = await table(host.id, { at: new Date(now + 1000) });
    const newer = await table(host.id, { at: new Date(now + 2000) });
    const newest = await table(host.id, { at: new Date(now + 3000) });
    const fourth = await table(host.id, { at: new Date(now + 500) });
    const got = await formingTables(db(), viewer.id, { gender: "man" });
    expect(got.map((x) => x.id)).toEqual([newest, newer, older]);
    expect(got.map((x) => x.id)).not.toContain(fourth);
    expect(got[0]).toEqual({ id: newest, name: expect.any(String), district: "khlong_toei" });
  });

  it("leaves out closed, full, women-only (for a man), blocked-host and the viewer's own tables", async () => {
    const viewer = await createMember();
    const host = await createMember({ role: "circle_head" });
    const at = new Date(Date.now() + 10_000);
    const closed = await table(host.id, { archived: true, at });
    const women = await table(host.id, { womenOnly: true, at });
    const full = await table(host.id, { at });
    const filler = await Promise.all(Array.from({ length: MAX_MEMBERS }, () => createMember()));
    await db().insert(regularTableMembers).values(filler.map((m) => ({ id: newId(), tableId: full, accountId: m.id })));
    const seated = await table(host.id, { at });
    await db().insert(regularTableMembers).values({ id: newId(), tableId: seated, accountId: viewer.id });
    const own = await table(viewer.id, { at });
    const blockedHost = await createMember({ role: "circle_head" });
    const behindBlock = await table(blockedHost.id, { at });
    await db().insert(blocks).values({ id: newId(), blocker: blockedHost.id, blocked: viewer.id });
    const ok = await table(host.id, { at });
    const got = (await formingTables(db(), viewer.id, { gender: "man" }, 20)).map((x) => x.id);
    expect(got).toContain(ok);
    for (const id of [closed, women, full, seated, own, behindBlock]) expect(got).not.toContain(id);
    // A woman sees the women-only table.
    expect((await formingTables(db(), viewer.id, { gender: "woman" }, 20)).map((x) => x.id)).toContain(women);
  });
});
