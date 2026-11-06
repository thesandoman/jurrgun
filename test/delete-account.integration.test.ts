/**
 * Owner card S2 (App Store 5.1.1): the Privacy centre offers one "Delete account", whose
 * promises come from the retention constants, so the copy can't drift from what the code does.
 */
import { describe, expect, it } from "vitest";
import { HAS_DB, createMember, req } from "./helpers";
import { DEACTIVATED_RETENTION_DAYS, SAFETY_RETENTION_DAYS } from "../src/services/retention";

describe.skipIf(!HAS_DB)("delete account", () => {
  it("shows Delete account with the retention facts and one confirm step", async () => {
    const m = await createMember();
    const html = await (await req("/settings/privacy?lang=en", { cookie: m.cookie })).text();
    expect(html).toContain(">Delete account</summary>");
    expect(html).toContain(`deleted within ${DEACTIVATED_RETENTION_DAYS} days.`);
    expect(html).toContain(`for ${SAFETY_RETENTION_DAYS / 365} years. If a report`);
    expect(html).toContain('href="/settings/privacy/export"');
    expect(html).toContain("Delete for good");
    expect(html).toContain("Keep my account");
    expect(html).not.toContain("Deactivate account");
  });

  it("without the tick, comes back with the delete step open", async () => {
    const m = await createMember();
    const r = await req("/settings/deactivate?lang=en", { cookie: m.cookie, method: "POST", form: { exitNote: "" } });
    expect(r.status).toBe(400);
    const html = await r.text();
    expect(html).toContain("Please tick the box to confirm deleting your account.");
    expect(html).toMatch(/<details class="delete-account" id="deactivate" open/);
  });
});
