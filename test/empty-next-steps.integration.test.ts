/**
 * Empty states end in one next step (owner, W1), and Learn has a plain hosting link (owner, W3).
 */
import { describe, expect, it } from "vitest";
import { HAS_DB, createMember, req } from "./helpers";

const html = async (path: string, cookie: string) => (await req(path, { cookie: `${cookie}; lang=en` })).text();

describe.skipIf(!HAS_DB)("empty states: one next step", () => {
  it("Discover with filters that match nothing offers to clear them", async () => {
    const m = await createMember();
    const page = await html("/?view=list&q=zzqxnomatch", m.cookie);
    expect(page).toContain("No events match these filters yet.");
    expect(page).not.toContain("Check back soon");
    expect(page).toContain("Clear filters and see every event");
  });

  it("a host with nothing hosted yet is pointed at ideas for a first event", async () => {
    const host = await createMember({ role: "host" });
    const page = await html("/host", host.cookie);
    expect(page).toContain("You haven&#39;t hosted anything yet.");
    expect(page).toContain('<a href="/host/ideas">See ideas for a first event →</a>');
  });

  it("Learn links to hosting: ideas for hosts, how a Regular Table works for everyone else", async () => {
    const m = await createMember();
    const host = await createMember({ role: "host" });
    expect(await html("/learn", m.cookie)).toMatch(/<a href="\/circles\/lead" class="feature"[^>]*>[\s\S]*?Thinking of hosting a table\? See how it works/);
    expect(await html("/learn", host.cookie)).toMatch(/<a href="\/host\/ideas" class="feature"[^>]*>[\s\S]*?Thinking of hosting a table\?/);
  });
});
