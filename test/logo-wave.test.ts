/**
 * The waving logo (owner, 2026-10-16): still a plain home link with a name,
 * a drag over 8px cancels its click while a tap still navigates, and reduced
 * motion turns the wave and the drag off.
 */
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { MARK_SVG } from "../src/ui/brand";
import { A11Y_CSS } from "../src/ui/a11y-css";
import { SPRING_JS } from "../src/ui/spring";
import { LOGO_JS, LOGO_WAVE, logoBand, logoCancelsClick, logoMotionOn, logoTravel } from "../src/ui/logo-wave";

describe("logo link", () => {
  it("is a home link with an accessible name, and the page carries the script", async () => {
    const html = await (await app.request("/", { headers: { cookie: "jg_intro=seen; lang=en", accept: "text/html" } })).text();
    expect(html).toContain('<a href="/" class="brand" aria-label="Jurrgun">');
    expect(html).toContain('class="jg-hand"');
    expect(html).toContain("window.jgMotion");
    expect(html).toContain('closest(SEL)');
  });

  it("wraps the hand in its own group without changing the drawing", () => {
    expect(MARK_SVG).toContain('<g class="jg-hand" transform-origin="37 51"><g fill="#ffffff" transform="rotate(-20 32 38)">');
    expect(MARK_SVG.match(/<g\b/g)?.length).toBe(MARK_SVG.match(/<\/g>/g)?.length);
    expect(SPRING_JS.endsWith(LOGO_JS)).toBe(true);
  });
});

describe("pure helpers", () => {
  it("a press that travelled more than 8px is a drag", () => {
    expect(logoCancelsClick(logoTravel(0, 3, 4))).toBe(false);
    expect(logoCancelsClick(logoTravel(0, 6, 6))).toBe(true);
    // Out and back still counts as a drag: travel keeps the furthest point.
    expect(logoCancelsClick(logoTravel(logoTravel(0, 30, 0), 1, 0))).toBe(true);
  });

  it("follows 1:1 within 40px, then resists more the further it goes", () => {
    expect(logoBand(30, -20)).toEqual([30, -20]);
    const [x1] = logoBand(80, 0);
    const [x2] = logoBand(200, 0);
    expect(x1).toBeGreaterThan(40);
    expect(x1).toBeLessThan(80);
    expect(x2 - x1).toBeLessThan(80 - 40); // later pixels move it less
    const [bx, by] = logoBand(60, 80);
    expect(by / bx).toBeCloseTo(80 / 60); // same direction
  });

  it("reduced motion, from the OS or the Accessibility menu, turns it off", () => {
    expect(logoMotionOn(false, false)).toBe(true);
    expect(logoMotionOn(true, false)).toBe(false);
    expect(logoMotionOn(false, true)).toBe(false);
    expect(A11Y_CSS).toContain("html.a11y-motion .topbar .brand,html.a11y-motion .fd-logo{touch-action:auto}");
    expect(LOGO_WAVE.every((d) => Math.abs(d) <= 14)).toBe(true);
  });
});

/** Runs LOGO_JS against a tiny fake document and records what it does. */
function harness(opts: { reduced?: boolean } = {}) {
  const handlers: Record<string, Array<(e: any) => void>> = {};
  const springs: any[] = [];
  const animations: any[] = [];
  const hand = { style: {} as Record<string, string> };
  const mark = { style: {} as Record<string, string>, querySelector: () => hand, animate: (k: unknown) => animations.push(k) };
  const link: any = { captured: null, querySelector: () => mark, setPointerCapture: (id: number) => (link.captured = id) };
  link.closest = () => link;
  const outside = { closest: () => null };
  const doc = {
    addEventListener: (type: string, fn: (e: any) => void) => (handlers[type] ??= []).push(fn),
    documentElement: { classList: { contains: () => false } },
  };
  const jgMotion = {
    spring: (o: any) => {
      const s = { o, live: true, to: o.to, stop: () => ((s.live = false), { x: o.from, v: 0 }), retarget: (t: number) => (s.to = t) };
      springs.push(s);
      return s;
    },
    tracker: () => ({ add() {}, velocity: () => 120 }),
  };
  new Function("window", "document", "matchMedia", LOGO_JS)({ jgMotion }, doc, () => ({ matches: !!opts.reduced }));
  const fire = (type: string, e: any) => {
    const ev = { button: 0, isPrimary: true, pointerId: 1, target: link, defaultPrevented: false, stopped: false, ...e };
    ev.preventDefault = () => (ev.defaultPrevented = true);
    ev.stopImmediatePropagation = () => (ev.stopped = true);
    for (const fn of handlers[type] ?? []) fn(ev);
    return ev;
  };
  return { fire, springs, animations, mark, link, outside };
}

describe("logo script", () => {
  it("cancels the click after a drag over 8px, and springs home with the release velocity", () => {
    const h = harness();
    h.fire("pointerdown", { clientX: 10, clientY: 10 });
    expect(h.link.captured).toBe(1);
    expect(h.springs[0].o).toMatchObject({ from: 0, to: 14, damping: 1, response: 0.35 }); // the wave starts on press
    h.fire("pointermove", { clientX: 30, clientY: 10 });
    expect(h.mark.style.transform).toBe("translate3d(20.00px,0.00px,0)"); // 1:1 from the grab point
    h.fire("pointerup", { clientX: 30, clientY: 10 });
    expect(h.springs.slice(1).map((s) => s.o)).toMatchObject([
      { from: 20, to: 0, velocity: 120, damping: 0.8, response: 0.4 },
      { from: 0, to: 0, velocity: 120, damping: 0.8, response: 0.4 },
    ]);
    const click = h.fire("click", {});
    expect(click.defaultPrevented).toBe(true);
    expect(click.stopped).toBe(true);
    // Only that one click: the next tap navigates.
    h.fire("pointerdown", { clientX: 10, clientY: 10 });
    h.fire("pointerup", { clientX: 13, clientY: 12 });
    expect(h.fire("click", {}).defaultPrevented).toBe(false);
  });

  it("a tap waves and still navigates; pressing again re-targets the same wave", () => {
    const h = harness();
    h.fire("pointerdown", { clientX: 5, clientY: 5 });
    h.springs[0].to = -14;
    h.fire("pointerup", { clientX: 5, clientY: 5 });
    expect(h.fire("click", {}).defaultPrevented).toBe(false);
    h.fire("pointerdown", { clientX: 5, clientY: 5 });
    expect(h.springs.filter((s) => s.o.response === 0.35)).toHaveLength(1);
    expect(h.springs[0].to).toBe(14);
  });

  it("Space waves without scrolling; Enter is left to the link", () => {
    const h = harness();
    const space = h.fire("keydown", { key: " " });
    expect(space.defaultPrevented).toBe(true);
    expect(h.springs[0].o.to).toBe(14);
    expect(h.fire("keydown", { key: "Enter" }).defaultPrevented).toBe(false);
  });

  it("with reduced motion: no wave, no drag, no capture, the click goes through, a pulse at most", () => {
    const h = harness({ reduced: true });
    h.fire("pointerdown", { clientX: 10, clientY: 10 });
    h.fire("pointermove", { clientX: 60, clientY: 10 });
    h.fire("pointerup", { clientX: 60, clientY: 10 });
    expect(h.springs).toHaveLength(0);
    expect(h.link.captured).toBe(null);
    expect(h.mark.style.transform ?? "").toBe("");
    expect(h.fire("click", {}).defaultPrevented).toBe(false);
    expect(h.animations).toHaveLength(1);
    expect(h.fire("keydown", { key: " " }).defaultPrevented).toBe(true);
    expect(h.springs).toHaveLength(0);
  });
});
