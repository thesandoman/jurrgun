/** Circle chats: polls and votes, photos from the day, served only to members; the host badge. */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import app from "../src/index";
import { createMember, db, ENV, HAS_DB, req, type Member } from "./helpers";
import { newId, randomToken } from "../src/lib/crypto";
import { chatMessages, chatVotes, circleHeadRequests, events, registrations } from "../src/schema";

/** A tiny in-memory stand-in for the R2 bucket the app writes photos to. */
function memBucket() {
  const store = new Map<string, { data: ArrayBuffer; type?: string }>();
  const obj = (key: string, v: { data: ArrayBuffer; type?: string }) => ({
    key, size: v.data.byteLength, uploaded: new Date(), httpEtag: "x", httpMetadata: { contentType: v.type },
    body: new Response(v.data).body,
  });
  return {
    store,
    async put(key: string, data: ArrayBuffer, o?: { httpMetadata?: { contentType?: string } }) { const v = { data, type: o?.httpMetadata?.contentType }; store.set(key, v); return obj(key, v); },
    async get(key: string) { const v = store.get(key); return v ? obj(key, v) : null; },
    async head(key: string) { const v = store.get(key); return v ? obj(key, v) : null; },
    async delete(keys: string | string[]) { for (const k of Array.isArray(keys) ? keys : [keys]) store.delete(k); },
  };
}

async function hangout(host: Member, guests: Member[], started: boolean) {
  const id = newId();
  const startsAt = new Date(Date.now() + (started ? -3600_000 : 86_400_000));
  await db().insert(events).values({ id, title: "Picnic", startsAt, endsAt: new Date(startsAt.getTime() + 3 * 3600_000), venueName: "Park", district: "khlong_toei", capacity: 8, status: "published", createdBy: host.id, hostAccountId: host.id, visibility: "private", privateToken: randomToken(12) });
  for (const g of guests) await db().insert(registrations).values({ id: newId(), eventId: id, accountId: g.id, status: "confirmed", passToken: randomToken(16) });
  return `circle:${id}`;
}

describe.skipIf(!HAS_DB)("circle chat extras", () => {
  it("polls: post, vote, change vote; totals only; outsiders get 404", async () => {
    const [host, a, b, outsider] = await Promise.all([createMember(), createMember(), createMember(), createMember()]);
    const key = await hangout(host, [a, b], false);
    expect((await req(`/chat/${key}/poll`, { cookie: host.cookie, form: { question: "Which Sunday?", options: ["18th", "25th", ""] } })).status).toBe(302);
    const [poll] = await db().select().from(chatMessages).where(eq(chatMessages.thread, key));
    expect(poll.kind).toBe("poll");
    expect(poll.pollOptions).toEqual(["18th", "25th"]);
    await req(`/chat/${key}/vote/${poll.id}`, { cookie: a.cookie, form: { option: "0" } });
    await req(`/chat/${key}/vote/${poll.id}`, { cookie: b.cookie, form: { option: "1" } });
    await req(`/chat/${key}/vote/${poll.id}`, { cookie: a.cookie, form: { option: "1" } });
    await req(`/chat/${key}/vote/${poll.id}`, { cookie: a.cookie, form: { option: "9" } });
    const votes = await db().select().from(chatVotes).where(eq(chatVotes.messageId, poll.id));
    expect(votes.map((v) => v.option).sort()).toEqual([1, 1]);
    expect((await req(`/chat/${key}/vote/${poll.id}`, { cookie: outsider.cookie, form: { option: "0" } })).status).toBe(404);
    const html = await (await req(`/chat/${key}`, { cookie: `${a.cookie}; lang=en` })).text();
    expect(html).toContain("Which Sunday?");
    expect(html).toContain("2 votes");
    expect(html).toContain("👑 Host");
  });

  it("polls are refused in one-to-one chats", async () => {
    const [x, y] = await Promise.all([createMember(), createMember()]);
    const key = await hangout(x, [y], false);
    const conn = key.replace("circle:", "conn:");
    expect((await req(`/chat/${conn}/poll`, { cookie: x.cookie, form: { question: "Q", options: ["a", "b"] } })).status).toBe(404);
  });

  it("photos: only after the hangout starts, stored privately, served only to members", async () => {
    const BUCKET = memBucket();
    const env = { ...ENV, BUCKET };
    const [host, guest, outsider] = await Promise.all([createMember(), createMember(), createMember()]);
    const send = (key: string, who: Member, file: File) => {
      const fd = new FormData();
      fd.append("photo", file);
      fd.append("caption", "Picnic crew 🧺");
      return app.request(`/chat/${key}/photo`, { method: "POST", headers: { cookie: who.cookie }, body: fd }, env);
    };
    const png = () => new File([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], "p.png", { type: "image/png" });
    const before = await hangout(host, [guest], false);
    expect((await send(before, guest, png())).status).toBe(400);
    const key = await hangout(host, [guest], true);
    expect((await send(key, guest, new File(["gif"], "a.gif", { type: "image/gif" }))).status).toBe(400);
    expect((await send(key, guest, png())).status).toBe(302);
    const [m] = await db().select().from(chatMessages).where(eq(chatMessages.thread, key));
    expect(m.kind).toBe("photo");
    expect(m.body).toBe("Picnic crew 🧺");
    expect(BUCKET.store.has(m.photoKey!)).toBe(true);
    const mine = await app.request(`/chat/${key}/photo/${m.id}`, { headers: { cookie: host.cookie } }, env);
    expect(mine.status).toBe(200);
    expect(mine.headers.get("content-type")).toBe("image/png");
    expect((await app.request(`/chat/${key}/photo/${m.id}`, { headers: { cookie: outsider.cookie } }, env)).status).toBe(404);
  });

  it("an approved circle head's messages carry their circle's name", async () => {
    const [host, guest, third] = await Promise.all([createMember(), createMember(), createMember()]);
    await db().insert(circleHeadRequests).values({ id: newId(), accountId: host.id, status: "approved", circleName: "Sunday Park Walkers" });
    const key = await hangout(host, [guest, third], false);
    await req(`/chat/${key}`, { cookie: host.cookie, form: { body: "Picnic is on!" } });
    const html = await (await req(`/chat/${key}`, { cookie: `${guest.cookie}; lang=en` })).text();
    expect(html).toContain("👑 Sunday Park Walkers");
  });
});
