/**
 * The phone app's switches on Me: the Face ID or fingerprint lock appears only inside the Jurrgun
 * app, and the notifications switch shows whether this app session already has push on.
 */
import { describe, expect, it } from "vitest";
import { HAS_DB, createMember, req } from "./helpers";

const APP = { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 JurrgunApp/1.0" };

describe.skipIf(!HAS_DB)("app switches on Me", () => {
  it("shows the app lock switch only inside the app", async () => {
    const m = await createMember();
    const web = await (await req("/settings?lang=en", { cookie: m.cookie })).text();
    expect(web).not.toContain('id="app-lock"');
    const app = await (await req("/settings?lang=en", { cookie: m.cookie, headers: APP })).text();
    expect(app).toContain('id="app-lock"');
    expect(app).toContain("Lock the app with Face ID or fingerprint");
    expect(app).toContain("Show the place on the widget");
    expect(web).not.toContain('id="widget-place"');
  });

  it("marks push on for this app session after the app registers its Expo token", async () => {
    const m = await createMember();
    const before = await (await req("/settings?lang=en", { cookie: m.cookie, headers: APP })).text();
    if (!before.includes('id="push"')) return; // no VAPID keys in this environment: no switch at all
    expect(before).toContain('data-app-on="0"');
    const r = await req("/settings/push", { cookie: m.cookie, json: { expoToken: "ExponentPushToken[abcdefghijklmnopqrstuv]" } });
    expect(r.status).toBe(200);
    const after = await (await req("/settings?lang=en", { cookie: m.cookie, headers: APP })).text();
    expect(after).toContain('data-app-on="1"');
  });
});
