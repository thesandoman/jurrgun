/**
 * Expo push tokens for the phone app: stored beside the browsers' subscriptions, sent to
 * by the same sender with only a generic line, and gone with their session (Privacy & Security).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ENV, HAS_DB, createMember, db, req } from "./helpers";
import app from "../src/index";
import { isExpoToken, sendExpo } from "../src/lib/expo-push";
import { pushToAccount } from "../src/services/push";
import { pushSubscriptions } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";

const token = () => `ExponentPushToken[${randomToken(16)}]`;
const msg = { title: "Jurrgun", body: "Tomorrow 7pm", url: "/events/x", tag: "reminder:x" };
const tickets = (...t: object[]) => vi.fn(async () => new Response(JSON.stringify({ data: t }), { status: 200 }));

afterEach(() => vi.unstubAllGlobals());

describe("Expo tokens", () => {
  it("recognises the token shapes Expo hands out", () => {
    expect(isExpoToken("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]")).toBe(true);
    expect(isExpoToken("ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]")).toBe(true);
    expect(isExpoToken("https://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isExpoToken("ExponentPushToken[<script>]")).toBe(false);
  });

  it("sends one request and reads each ticket", async () => {
    const f = tickets({ status: "ok" }, { status: "error", details: { error: "DeviceNotRegistered" } });
    vi.stubGlobal("fetch", f);
    const r = await sendExpo(["ExponentPushToken[aaaaaaaaaaaa]", "ExponentPushToken[bbbbbbbbbbbb]"], msg.url, "en", 3600);
    expect(r.map((x) => [x.ok, x.gone])).toEqual([[true, false], [false, true]]);
    const sent = JSON.parse(String((f.mock.calls[0] as unknown[])[1] && ((f.mock.calls[0] as unknown[])[1] as RequestInit).body));
    expect(sent[0]).toMatchObject({ to: "ExponentPushToken[aaaaaaaaaaaa]", title: "Jurrgun", body: "You have something new in Jurrgun", data: { url: "/events/x" }, ttl: 3600 });
  });
});

describe.skipIf(!HAS_DB)("Expo tokens on an account", () => {
  it("are saved through the push switch and turned off the same way", async () => {
    const m = await createMember();
    const t = token();
    expect((await req("/settings/push", { cookie: m.cookie, json: { expoToken: "nope" } })).status).toBe(400);
    expect((await req("/settings/push", { cookie: m.cookie, json: { expoToken: t } })).status).toBe(200);
    const [row] = await db().select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, t));
    expect(row.accountId).toBe(m.id);
    expect((await req("/settings/push/off", { cookie: m.cookie, json: { endpoint: t } })).status).toBe(200);
    expect(await db().select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, t))).toEqual([]);
  });

  it("get pushes without VAPID keys, and a dropped device's token is removed", async () => {
    const m = await createMember();
    const [live, dead] = [token(), token()];
    await req("/settings/push", { cookie: m.cookie, json: { expoToken: live } });
    // A second phone signed in to the same account (one row per session, so added directly).
    const [own] = await db().select({ sessionId: pushSubscriptions.sessionId }).from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, live));
    await db().insert(pushSubscriptions).values({ id: newId(), accountId: m.id, endpoint: dead, p256dh: "", auth: "", sessionId: own.sessionId });
    const f = vi.fn(async (_url: string, init: RequestInit) => {
      const to = (JSON.parse(String(init.body)) as { to: string }[]).map((x) => x.to);
      return new Response(JSON.stringify({ data: to.map((x) => (x === dead ? { status: "error", details: { error: "DeviceNotRegistered" } } : { status: "ok" })) }), { status: 200 });
    });
    vi.stubGlobal("fetch", f);
    const { NO_EXTERNAL: _off, ...live_env } = ENV;
    expect(await pushToAccount(live_env, db(), m.id, { ...msg, title: "Nok's table", body: "Somtam at Ari, 7pm" }, 3600)).toBe(1);
    expect(f).toHaveBeenCalledTimes(1);
    // Expo reads payloads in plain text: none of the message's own words go there.
    const sentBody = String((f.mock.calls[0][1] as RequestInit).body);
    expect(sentBody).not.toMatch(/Nok|Somtam|Ari/);
    expect(sentBody).toContain("มีอะไรใหม่สำหรับคุณใน Jurrgun");
    const left = await db().select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions).where(eq(pushSubscriptions.accountId, m.id));
    expect(left.map((x) => x.endpoint)).toEqual([live]);
  });

  it("are deleted at sign-out, on a refreshed token, and when reminders consent is withdrawn", async () => {
    const m = await createMember();
    const rows = () => db().select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions).where(eq(pushSubscriptions.accountId, m.id));
    const [first, second] = [token(), token()];
    await req("/settings/push", { cookie: m.cookie, json: { expoToken: first } });
    await req("/settings/push", { cookie: m.cookie, json: { expoToken: second } });
    expect((await rows()).map((x) => x.endpoint)).toEqual([second]);

    await req("/settings/consents", { cookie: m.cookie, form: { consent_notifications: "0" } });
    const afterConsent = await rows();
    await req("/settings/push", { cookie: m.cookie, json: { expoToken: first } });
    await app.request("/logout", { method: "POST", headers: { cookie: m.cookie } }, ENV);
    expect({ afterConsent, afterLogout: await rows() }).toEqual({ afterConsent: [], afterLogout: [] });
  });
});
