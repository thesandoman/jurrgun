/**
 * The home-screen line on Me (Mobile App card M2): when the quiet card shows,
 * and that it never shows once installed or dismissed. The script runs
 * against a tiny fake page (no browser needed).
 */
import { describe, expect, it } from "vitest";
import vm from "node:vm";
import { INSTALL_DISMISS_KEY, INSTALL_LINE_JS } from "../src/ui/install-line";

type Opts = { ua?: string; standalone?: boolean; dismissed?: boolean; push?: boolean };

function run(o: Opts = {}) {
  const store = new Map<string, string>(o.dismissed ? [[INSTALL_DISMISS_KEY, "1"]] : []);
  const el = (attrs: Record<string, string> = {}) => {
    const clicks: (() => void)[] = [];
    return { hidden: false, attrs, getAttribute: (k: string) => attrs[k] ?? null, addEventListener: (_: string, f: () => void) => clicks.push(f), click: () => clicks.forEach((f) => f()) };
  };
  const strongA = el({ "data-for": "android" }), strongI = el({ "data-for": "ios" }), add = el({ "data-for": "android" }), off = el();
  strongI.hidden = true;
  const box = {
    hidden: true,
    querySelector: (q: string) => (q === "[data-act=off]" ? off : add),
    querySelectorAll: () => [strongA, strongI, add],
  };
  const win: Record<string, (e: unknown) => void> = {};
  const ctx = vm.createContext({
    document: { readyState: "complete", addEventListener() {}, getElementById: (id: string) => (id === "install-line" ? box : id === "push" && o.push ? {} : null) },
    navigator: { userAgent: o.ua ?? "Mozilla/5.0 (Linux; Android 14) Chrome/130", platform: "Linux armv8l", maxTouchPoints: 5, standalone: undefined },
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    matchMedia: () => ({ matches: !!o.standalone }),
    addEventListener: (type: string, f: (e: unknown) => void) => (win[type] = f),
    Promise,
  });
  ctx.window = ctx;
  vm.runInContext(INSTALL_LINE_JS, ctx);
  return { box, win, store, off, strongA, strongI };
}

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1";

describe("install line on Me", () => {
  it("Android: stays hidden until the browser offers to install, then shows the Android line", () => {
    const r = run();
    expect(r.box.hidden).toBe(true);
    r.win.beforeinstallprompt({ preventDefault() {}, prompt() {}, userChoice: Promise.resolve({ outcome: "dismissed" }) });
    expect(r.box.hidden).toBe(false);
    expect(r.strongA.hidden).toBe(false);
    expect(r.strongI.hidden).toBe(true);
  });

  it("hides for good on this phone once installed or dismissed", () => {
    const a = run();
    a.win.beforeinstallprompt({ preventDefault() {}, prompt() {} });
    a.win.appinstalled({});
    expect(a.box.hidden).toBe(true);
    expect(a.store.get(INSTALL_DISMISS_KEY)).toBe("1");
    const b = run();
    b.win.beforeinstallprompt({ preventDefault() {}, prompt() {} });
    b.off.click();
    expect(b.box.hidden).toBe(true);
    expect(b.store.get(INSTALL_DISMISS_KEY)).toBe("1");
  });

  it("never shows when already installed, in the Jurrgun app, or dismissed before", () => {
    for (const o of [{ standalone: true }, { ua: "Mozilla/5.0 (Linux; Android 14) wv JurrgunApp/1.0" }, { dismissed: true }]) {
      const r = run(o);
      expect(r.win.beforeinstallprompt).toBeUndefined();
      expect(r.box.hidden).toBe(true);
    }
  });

  it("iPhone: leaves the steps to the notifications switch when it's on the page, otherwise shows the iPhone line", () => {
    expect(run({ ua: IPHONE, push: true }).box.hidden).toBe(true);
    const r = run({ ua: IPHONE });
    expect(r.box.hidden).toBe(false);
    expect(r.strongI.hidden).toBe(false);
    expect(r.strongA.hidden).toBe(true);
  });
});
