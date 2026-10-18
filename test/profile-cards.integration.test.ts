/** Owner cards on profile pages: the edit page's shortcuts and folded interests, the duplicates gone, safety actions behind More. */
import { describe, expect, it } from "vitest";
import { HAS_DB, createMember, req } from "./helpers";

describe.skipIf(!HAS_DB)("profile page cards", () => {
  it("profile edit has basics first, folded interest groups, and no duplicate questions", async () => {
    const m = await createMember();
    const html = await (await req("/settings/profile?lang=en", { cookie: m.cookie })).text();
    // The jump bar went with "More (optional)": its rows are the shortcuts now.
    expect(html).not.toContain('class="pf-jump"');
    expect(html).toContain('id="pe-more-h"');
    expect(html).not.toMatch(/<details class="ip-group" open/);
    expect(html).not.toContain('name="eventStyle"');
    expect(html).not.toContain('value="small_group"');
    expect(html).toContain('name="groupSize"');
    expect(html).toContain('name="times"');
  });
});
