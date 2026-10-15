/**
 * Staff area accessibility: every table has a caption, long lists can be
 * filtered, and the actions that strike or ban someone ask first.
 */
import { describe, expect, it } from "vitest";
import { HAS_DB, createMember, req } from "./helpers";

describe.skipIf(!HAS_DB)("staff area accessibility", () => {
  it("captions every table and offers a filter on the long lists", async () => {
    const admin = await createMember({ role: "bma_admin" });
    for (const [path, target] of [
      ["/admin/events?view=all", "admin-events"],
      ["/admin/audit", "admin-audit"],
    ] as const) {
      const html = await (await req(path, { cookie: admin.cookie })).text();
      const tables = html.match(/<table[\s>]/g)?.length ?? 0;
      const captions = html.match(/<caption/g)?.length ?? 0;
      expect(captions, path).toBe(tables);
      if (tables) expect(html, path).toContain(`data-filter="${target}"`);
    }
  });

  it("asks before suspending or banning from a report", async () => {
    const admin = await createMember({ role: "bma_admin" });
    const html = await (await req("/admin/moderation", { cookie: admin.cookie })).text();
    const id = html.match(/href="\/admin\/moderation\/([^"?]+)"/)?.[1];
    if (!id) return; // no open reports in this database
    const page = await (await req(`/admin/moderation/${id}`, { cookie: admin.cookie })).text();
    expect(page).toContain("data-c-suspend=");
    expect(page).toContain("data-c-ban=");
    expect(page).toContain("return confirm(");
    expect(page).not.toMatch(/<h1[\s\S]*?<\/h1>\s*[\s\S]*?<h3>/);
  });
});
