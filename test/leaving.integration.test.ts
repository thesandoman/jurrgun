/** Leaving: LINE/Google members can deactivate without a password; why they left is stored anonymously. */
import { describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import { createMember, db, HAS_DB, req } from "./helpers";
import { newId } from "../src/lib/crypto";
import { accounts, exitReasons, oauthLinks } from "../src/schema";

describe.skipIf(!HAS_DB)("leaving", () => {
  it("a LINE member deactivates with reasons; the sign-in is unlinked; reasons have no account id", async () => {
    const m = await createMember();
    const username = `line_${newId().slice(0, 10)}`;
    await db().update(accounts).set({ username }).where(eq(accounts.id, m.id));
    await db().insert(oauthLinks).values({ id: newId(), accountId: m.id, provider: "line", subject: `sub-${newId()}` });
    const page = await (await req("/settings/privacy", { cookie: `${m.cookie}; lang=en` })).text();
    expect(page).toContain("Why are you leaving?");
    expect(page).toContain("Take a break instead");
    const r = await req("/settings/deactivate", { cookie: m.cookie, form: { confirm: "1", reasons: ["made_friends", "too_busy", "bogus"], exitNote: "Thanks!" } });
    expect(r.headers.get("location")).toBe("/?notice=deactivated");
    const [acct] = await db().select().from(accounts).where(eq(accounts.id, m.id));
    expect(acct.status).toBe("deactivated");
    expect(await db().select().from(oauthLinks).where(eq(oauthLinks.accountId, m.id))).toHaveLength(0);
    const [row] = await db().select().from(exitReasons).orderBy(desc(exitReasons.createdAt)).limit(1);
    expect(row.reasons).toEqual(["made_friends", "too_busy"]);
    expect(row.note).toBe("Thanks!");
    expect(Object.keys(row)).not.toContain("accountId");
  });
});
