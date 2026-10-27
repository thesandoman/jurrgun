/** Discover lives at / for signed-in members; /events redirects there (owner, 2026-10-27). */
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { createMember, ENV, HAS_DB, req } from "./helpers";

describe.skipIf(!HAS_DB)("Discover at /", () => {
  it("a signed-in member gets Discover at / with no redirect, and the logo and Discover tab point at /", async () => {
    const m = await createMember();
    const res = await req("/?view=list&lang=en", { cookie: m.cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('action="/"');
    expect(html).toMatch(/<a href="\/" class="brand"|<a href="\/" class="fd-logo"/);
    expect(html).not.toMatch(/href="\/events"[^>]*>/);
  });

  it("old /events links redirect to / and keep their query", async () => {
    const m = await createMember();
    const res = await req("/events?view=list&notice=welcome", { cookie: m.cookie });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/?view=list&notice=welcome");
    expect((await req("/events", { cookie: m.cookie })).headers.get("location")).toBe("/");
  });

  it("signed out, /events still asks to sign in first, and / is the visitor landing (the intro is optional)", async () => {
    expect((await req("/events")).headers.get("location")).toBe("/login?next=%2Fevents");
    const res = await req("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('href="/intro"');
  });

  it("the installed app starts at /", async () => {
    const res = await app.request("/manifest.webmanifest", {}, ENV);
    expect(((await res.json()) as { start_url: string }).start_url).toBe("/");
  });
});
