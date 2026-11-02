import { describe, expect, it } from "vitest";
import app from "../src/index";
import { SIGNUP_TRAP_FIELD } from "../src/routes/auth";

const post = (form: Record<string, string>) =>
  app.request("https://jurrgun.apps.sv-academy.org/signup?lang=en", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form).toString() }, {} as never);

describe("card F5: the sign-up trap field", () => {
  it("is out of tab order, autofill and the accessibility tree, on sign-up only", async () => {
    const html = await (await app.request("https://jurrgun.apps.sv-academy.org/signup", {}, {} as never)).text();
    const trap = html.match(new RegExp(`<div class="sr-only" aria-hidden="true"><label>[^<]*<input[^>]*name="${SIGNUP_TRAP_FIELD}"[^>]*>`))?.[0] ?? "";
    expect(trap).toContain('tabindex="-1"');
    expect(trap).toContain('autocomplete="off"');
    expect(await (await app.request("https://jurrgun.apps.sv-academy.org/login", {}, {} as never)).text()).not.toContain(SIGNUP_TRAP_FIELD);
  });

  it("filled in: a visible error, nothing created, and the form comes back with it empty", async () => {
    const r = await post({ username: "botty", password: "longenough1", confirm: "longenough1", terms: "1", [SIGNUP_TRAP_FIELD]: "http://spam.example" });
    expect(r.status).toBe(400);
    const html = await r.text();
    expect(html).toContain("A field that should stay empty was filled in");
    expect(html).not.toContain("spam.example");
    expect(r.headers.get("set-cookie") ?? "").not.toContain("bkk_sid");
  });
});
