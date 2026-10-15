/**
 * Community hosting (Phase 1): members propose events, the team reviews them,
 * trusted hosts publish directly, private events open only by their link.
 */
import { describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { accounts, circleHeadRequests, events, notifications, profiles, registrations } from "../src/schema";
import { canView, checkProposal } from "../src/domain/hosting";

const bkk = (daysAhead: number, hour: number) => {
  const d = new Date(Date.now() + daysAhead * 86_400_000 + 7 * 3_600_000);
  return `${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00`;
};
const proposal = (over: Record<string, string | string[]> = {}) => ({
  title: "Sunday board games",
  description: "Bring a favourite game or learn a new one. Beginners welcome!",
  startsAt: bkk(5, 14),
  endsAt: bkk(5, 17),
  venueName: "Kafe Meeple",
  district: "bang_rak",
  capacity: "8",
  ageMin: "18",
  ageMax: "99",
  languages: ["th", "en"],
  costThb: "0",
  intensity: "social",
  groupMin: "4",
  groupMax: "6",
  visibility: "public",
  ...over,
});
const allowed = { districts: ["bang_rak"], languages: ["th", "en"], intensity: ["social"], tags: ["games"] };

describe("hosting rules", () => {
  it("checks a proposal: future start, sensible size, no payment details on a free event, https links only", () => {
    const base = { ...proposal(), titleEn: "", venueAddress: "", mapUrl: "", paymentNote: "", paymentUrl: "", plusOneAllowed: false, tags: [], accessibility: "", safetyInfo: "" } as never;
    expect(checkProposal(base, allowed).errors).toEqual([]);
    const bad = (over: object) => checkProposal({ ...(base as object), ...over } as never, allowed).errors.length;
    expect(bad({ startsAt: bkk(-1, 10), endsAt: bkk(-1, 12) })).toBeGreaterThan(0);
    expect(bad({ capacity: "100" })).toBeGreaterThan(0);
    expect(bad({ paymentUrl: "https://pay.example" })).toBeGreaterThan(0); // free
    expect(bad({ costThb: "300", paymentUrl: "http://pay.example" })).toBeGreaterThan(0);
    expect(bad({ costThb: "300", paymentUrl: "https://pay.example" })).toBe(0);
  });

  it("lets only the right people see each kind of event", () => {
    const e = { status: "published", visibility: "private", hostAccountId: "h", createdBy: "h", partnerOrgId: null, privateToken: "secret-token" };
    const member = { id: "m", role: "user", partnerOrgId: null };
    expect(canView(e, member)).toBe(false);
    expect(canView(e, member, { token: "secret-token" })).toBe(true);
    expect(canView(e, member, { token: "secret-tokeX" })).toBe(false);
    expect(canView(e, member, { registered: true })).toBe(true);
    expect(canView(e, { id: "h", role: "user", partnerOrgId: null })).toBe(true);
    expect(canView({ ...e, status: "pending", visibility: "public" }, member)).toBe(false);
    expect(canView({ ...e, status: "pending", visibility: "public" }, { id: "x", role: "moderator", partnerOrgId: null })).toBe(true);
  });
});

describe.skipIf(!HAS_DB)("community hosting", () => {
  const latest = async (accountId: string) => {
    const [e] = await db().select().from(events).where(eq(events.createdBy, accountId)).limit(1);
    return e;
  };

  it("a circle head proposes; it waits hidden until a moderator approves", async () => {
    const [m, other, mod] = await Promise.all([createMember({ role: "circle_head" }), createMember(), createMember({ role: "moderator" })]);
    const r = await req("/host/new", { cookie: m.cookie, form: proposal() });
    expect(r.headers.get("location")).toBe("/host?notice=submitted");
    const e = await latest(m.id);
    expect(e.status).toBe("pending");
    expect(e.hostAccountId).toBe(m.id);
    expect(await (await req("/events?view=list", { cookie: other.cookie })).text()).not.toContain(`/events/${e.id}"`);
    expect((await req(`/events/${e.id}`, { cookie: other.cookie })).status).toBe(404);
    expect((await req(`/events/${e.id}`, { cookie: m.cookie })).status).toBe(200);

    expect((await req("/admin/review", { cookie: m.cookie })).status).toBe(403);
    expect(await (await req("/admin/review", { cookie: mod.cookie })).text()).toContain("Sunday board games");
    expect((await req(`/admin/review/${e.id}/approve`, { cookie: mod.cookie, method: "POST", form: {} })).headers.get("location")).toBe("/admin/review?notice=approved");
    const [after] = await db().select().from(events).where(eq(events.id, e.id));
    expect(after.status).toBe("published");
    const [acct] = await db().select({ role: accounts.role, trusted: accounts.trustedHost }).from(accounts).where(eq(accounts.id, m.id));
    expect(acct).toEqual({ role: "circle_head", trusted: false });
    expect(await db().select().from(notifications).where(and(eq(notifications.accountId, m.id), eq(notifications.kind, "host_approved")))).toHaveLength(1);
    expect(await (await req("/events?view=list", { cookie: other.cookie })).text()).toContain(`/events/${e.id}"`);
  });

  it("sending back needs a note; the host sees it, edits, and resubmits", async () => {
    const [m, mod] = await Promise.all([createMember({ role: "circle_head" }), createMember({ role: "moderator" })]);
    await req("/host/new", { cookie: m.cookie, form: proposal() });
    const e = await latest(m.id);
    expect((await req(`/admin/review/${e.id}/reject`, { cookie: mod.cookie, form: { note: "" } })).headers.get("location")).toBe("/admin/review?notice=need_note");
    await req(`/admin/review/${e.id}/reject`, { cookie: mod.cookie, form: { note: "Please add the meeting point." } });
    expect(await (await req("/host", { cookie: `${m.cookie}; lang=en` })).text()).toContain("Please add the meeting point.");
    const r = await req(`/host/${e.id}/edit`, { cookie: m.cookie, form: proposal({ safetyInfo: "Meet at the front counter." }) });
    expect(r.headers.get("location")).toBe("/host?notice=submitted");
    const [after] = await db().select().from(events).where(eq(events.id, e.id));
    expect(after.status).toBe("pending");
    expect(after.reviewNote).toBeNull();
    expect(after.safetyInfo).toBe("Meet at the front counter.");
  });

  it("refuses bad proposals, more than 3 waiting, and edits by someone else", async () => {
    const [m, other] = await Promise.all([createMember({ role: "circle_head" }), createMember({ role: "circle_head" })]);
    expect((await req("/host/new", { cookie: m.cookie, form: proposal({ startsAt: bkk(-2, 10), endsAt: bkk(-2, 12) }) })).status).toBe(400);
    for (let i = 0; i < 3; i++) await req("/host/new", { cookie: m.cookie, form: proposal({ title: `Games night ${i}` }) });
    expect((await req("/host/new", { cookie: m.cookie, form: proposal({ title: "One too many" }) })).status).toBe(400);
    const e = await latest(m.id);
    await req(`/host/${e.id}/edit`, { cookie: other.cookie, form: proposal({ title: "Hijacked" }) });
    const [same] = await db().select({ title: events.title }).from(events).where(eq(events.id, e.id));
    expect(same.title).not.toBe("Hijacked");
    await req(`/host/${e.id}/withdraw`, { cookie: m.cookie, method: "POST" });
    const [w] = await db().select({ status: events.status }).from(events).where(eq(events.id, e.id));
    expect(w.status).toBe("draft");
  });

  it("trusted hosts publish straight away", async () => {
    const [m, mod] = await Promise.all([createMember({ role: "circle_head" }), createMember({ role: "moderator" })]);
    await req("/host/new", { cookie: m.cookie, form: proposal() });
    const first = await latest(m.id);
    await req(`/admin/review/${first.id}/approve`, { cookie: mod.cookie, form: { trust: "1" } });
    const r = await req("/host/new", { cookie: m.cookie, form: proposal({ title: "Second meet-up" }) });
    expect(r.headers.get("location")).toBe("/host?notice=published");
    const [second] = await db().select().from(events).where(and(eq(events.createdBy, m.id), eq(events.title, "Second meet-up")));
    expect(second.status).toBe("published");
  });

  it("only admins, verified partners and circle heads host; members are pointed to lead a circle", async () => {
    const [mod, admin, partnerHost, member, head] = await Promise.all([
      createMember({ role: "moderator" }),
      createMember({ role: "bma_admin" }),
      createMember({ role: "host" }),
      createMember(),
      createMember({ role: "circle_head" }),
    ]);
    // Admins and verified partners may never have done member onboarding, and publish directly.
    await db().update(profiles).set({ onboardedAt: null }).where(inArray(profiles.accountId, [admin.id, partnerHost.id]));
    for (const staff of [admin, partnerHost]) {
      expect((await req("/host/new", { cookie: staff.cookie })).status).toBe(200);
      const r = await req("/host/new", { cookie: staff.cookie, form: proposal({ title: `Staff meet-up ${staff.id.slice(0, 4)}` }) });
      expect(r.headers.get("location")).toBe("/host?notice=published");
    }
    // Members and moderators can't host.
    for (const who of [member, mod]) {
      expect((await req("/host/new", { cookie: who.cookie })).headers.get("location")).toBe("/circles/lead");
      await req("/host/new", { cookie: who.cookie, form: proposal({ title: `Nope ${who.id.slice(0, 4)}` }) });
      expect(await db().select().from(events).where(eq(events.createdBy, who.id))).toHaveLength(0);
    }
    // A circle head's private hangout publishes directly; a public event waits for review.
    expect((await req("/host/new", { cookie: head.cookie, form: proposal({ title: "Circle picnic", visibility: "private" }) })).headers.get("location")).toBe("/host?notice=published");
    expect((await req("/host/new", { cookie: head.cookie, form: proposal({ title: "Open picnic" }) })).headers.get("location")).toBe("/host?notice=submitted");
    // Circle heads run check-in for their own events.
    const [mine] = await db().select({ id: events.id }).from(events).where(eq(events.createdBy, head.id));
    expect((await req("/admin/events", { cookie: head.cookie })).status).toBe(200);
    expect((await req(`/admin/events/${mine.id}`, { cookie: head.cookie })).status).toBe(200);
  });

  it("a member asks to lead a circle; a moderator approves; they can host", async () => {
    const [m, mod] = await Promise.all([createMember(), createMember({ role: "moderator" })]);
    expect(await (await req("/circles/lead", { cookie: `${m.cookie}; lang=en` })).text()).toContain("Lead your own circle");
    await req("/circles/lead", { cookie: m.cookie, form: { circleName: "Ari coffee walkers", plan: "Saturday coffee walks", agree: "1" } });
    await req("/circles/lead", { cookie: m.cookie, form: { circleName: "Twice", agree: "1" } });
    const reqs = await db().select().from(circleHeadRequests).where(eq(circleHeadRequests.accountId, m.id));
    expect(reqs).toHaveLength(1);
    expect(await (await req("/admin/review", { cookie: mod.cookie })).text()).toContain("Ari coffee walkers");
    expect((await req(`/admin/review/circle/${reqs[0].id}/approve`, { cookie: mod.cookie, method: "POST", form: {} })).headers.get("location")).toBe("/admin/review?notice=circle_approved");
    const [acct] = await db().select({ role: accounts.role }).from(accounts).where(eq(accounts.id, m.id));
    expect(acct.role).toBe("circle_head");
    expect((await req("/host/new", { cookie: m.cookie })).status).toBe(200);
  });

  it("declining needs a note the member sees", async () => {
    const [m, mod] = await Promise.all([createMember(), createMember({ role: "moderator" })]);
    await req("/circles/lead", { cookie: m.cookie, form: { circleName: "Night owls", agree: "1" } });
    const [r] = await db().select().from(circleHeadRequests).where(eq(circleHeadRequests.accountId, m.id));
    expect((await req(`/admin/review/circle/${r.id}/decline`, { cookie: mod.cookie, form: { note: "" } })).headers.get("location")).toBe("/admin/review?notice=need_note");
    await req(`/admin/review/circle/${r.id}/decline`, { cookie: mod.cookie, form: { note: "Please host one public event first." } });
    expect(await (await req("/circles/lead", { cookie: `${m.cookie}; lang=en` })).text()).toContain("Please host one public event first.");
    const [acct] = await db().select({ role: accounts.role }).from(accounts).where(eq(accounts.id, m.id));
    expect(acct.role).toBe("user");
  });

  it("nobody approves their own proposal", async () => {
    const m = await createMember({ role: "circle_head" });
    await req("/host/new", { cookie: m.cookie, form: proposal({ title: "My own idea" }) });
    const e = await latest(m.id);
    await db().update(accounts).set({ role: "moderator" }).where(eq(accounts.id, m.id));
    const r = await req(`/admin/review/${e.id}/approve`, { cookie: m.cookie, method: "POST", form: {} });
    expect(r.headers.get("location")).toBe("/admin/review?notice=own");
    const [still] = await db().select({ status: events.status }).from(events).where(eq(events.id, e.id));
    expect(still.status).toBe("pending");
  });

  it("private events: never listed, open with the link, RSVP through it, and a reset retires old links", async () => {
    const [host, guest, stranger, late] = await Promise.all([createMember({ role: "bma_admin" }), createMember(), createMember(), createMember()]);
    // The Jurrgun team publishes directly.
    await req("/host/new", { cookie: host.cookie, form: proposal({ title: "Private supper club", visibility: "private", costThb: "450", paymentNote: "PromptPay", paymentUrl: "https://pay.example/supper" }) });
    const e = await latest(host.id);
    expect(e.status).toBe("published");
    expect(e.privateToken).toMatch(/^[\w-]{40,}$/);
    expect(await (await req("/events?view=list", { cookie: stranger.cookie })).text()).not.toContain("Private supper club");
    expect((await req(`/events/${e.id}`, { cookie: stranger.cookie })).status).toBe(404);

    const open = await req(`/events/${e.id}?t=${encodeURIComponent(e.privateToken!)}`, { cookie: `${guest.cookie}; lang=en` });
    expect(open.status).toBe(200);
    const html = await open.text();
    expect(html).toContain("Private event");
    expect(html).toContain('href="https://pay.example/supper"');
    const remembered = (open.headers.get("set-cookie") ?? "").split(";")[0];
    expect(remembered).toContain(`bkk_pev_${e.id}=`);

    const rsvp = await req(`/events/${e.id}/rsvp`, { cookie: `${guest.cookie}; ${remembered}`, method: "POST", form: {} });
    expect(rsvp.headers.get("location")).toContain("rsvp_confirmed");

    const old = e.privateToken!;
    await req(`/host/${e.id}/private-link/reset`, { cookie: host.cookie, method: "POST" });
    expect((await req(`/events/${e.id}?t=${encodeURIComponent(old)}`, { cookie: late.cookie })).status).toBe(404);
    // Someone already signed up keeps access.
    expect((await req(`/events/${e.id}`, { cookie: guest.cookie })).status).toBe(200);
    const [reg] = await db().select().from(registrations).where(and(eq(registrations.eventId, e.id), eq(registrations.accountId, guest.id)));
    expect(reg.status).toBe("confirmed");
  });
});
