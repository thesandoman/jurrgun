/**
 * The top-left logo, a small delight (owner, 2026-10-16). It stays a plain home
 * link, and with JS:
 *
 *  - Press it and the hand waves about the wrist (two swings of about 14
 *    degrees on a critically damped spring). Feedback starts on pointerdown;
 *    pressing again mid-wave re-targets from the live angle.
 *  - Drag it and the mark follows the pointer 1:1 from where it was grabbed,
 *    with soft resistance past 40px, then springs home carrying the release
 *    velocity. A press that travelled more than 8px cancels the link's click,
 *    so a drag never navigates; a tap still goes home.
 *  - Space on the focused logo waves (and does not scroll). Enter still follows
 *    the link.
 *  - Reduced motion (the OS setting or our Accessibility menu): no wave, no
 *    drag; a short opacity pulse on press at most.
 *
 * Transform and opacity only, with frames cancelled when idle (jgMotion's
 * springs stop themselves). The pure helpers below are exported for the tests
 * and copied into the page script with toString(), so both run the same code.
 */

/** Furthest the pointer has been from where it pressed, in px. */
export function logoTravel(prev: number, dx: number, dy: number): number {
  return Math.max(prev, Math.sqrt(dx * dx + dy * dy));
}

/** A press that travelled more than 8px is a drag: its click must not navigate. */
export function logoCancelsClick(travel: number): boolean {
  return travel > 8;
}

/**
 * Where the mark sits for a raw drag offset: 1:1 within 40px of home, then
 * rubber-banded along the same direction, resisting more the further it goes
 * (the same curve as jgMotion.rubberband, dimension 120, constant 0.55).
 */
export function logoBand(x: number, y: number): [number, number] {
  const d = Math.sqrt(x * x + y * y);
  if (d <= 40) return [x, y];
  const over = d - 40;
  const s = (40 + (over * 120 * 0.55) / (120 + 0.55 * over)) / d;
  return [x * s, y * s];
}

/** The wave and the drag run only when nobody asked for less motion. */
export function logoMotionOn(reducedMotion: boolean, a11yMotionClass: boolean): boolean {
  return !reducedMotion && !a11yMotionClass;
}

/** The wave's targets in degrees: out, back, out, home. */
export const LOGO_WAVE = [14, -14, 14, 0];

/** The logo links this applies to: the header's and the full-screen map's. */
export const LOGO_SELECTOR = ".topbar .brand,.fd-logo";

/**
 * Classic script, after SPRING_JS (uses window.jgMotion). Document-level
 * delegation, so it can run in <head> before the header exists.
 */
export const LOGO_JS = `(function(){
var M=window.jgMotion;if(!M||!document.addEventListener)return;
var travelOf=${logoTravel.toString()},cancels=${logoCancelsClick.toString()},band=${logoBand.toString()},motionOn=${logoMotionOn.toString()};
var WAVE=${JSON.stringify(LOGO_WAVE)},SEL=${JSON.stringify(LOGO_SELECTOR)};
var el=null,mark=null,hand=null,ang=0,wave=null,leg=0,px=0,py=0,sx=null,sy=null,press=null,blockUntil=0;
function on(){return motionOn(matchMedia("(prefers-reduced-motion: reduce)").matches,document.documentElement.classList.contains("a11y-motion"))}
function bind(a){if(a===el)return;settle();el=a;mark=a.querySelector(".brand-mark");hand=mark&&mark.querySelector(".jg-hand");ang=0;px=0;py=0}
function draw(){if(!mark)return;var idle=!press&&!wave&&!sx&&!sy;
if(hand)hand.style.transform=ang?"rotate("+ang.toFixed(2)+"deg)":"";
mark.style.transform=px||py?"translate3d("+px.toFixed(2)+"px,"+py.toFixed(2)+"px,0)":"";
mark.style.willChange=idle?"":"transform"}
function settle(){if(wave)wave.stop();if(sx)sx.stop();if(sy)sy.stop();wave=sx=sy=null;press=null;ang=px=py=0;draw()}
function wv(){if(!hand)return;leg=0;if(wave&&wave.live){wave.retarget(WAVE[0]);return}
wave=M.spring({from:ang,to:WAVE[0],damping:1,response:0.35,onUpdate:function(x){ang=x;
if(leg<WAVE.length-1&&Math.abs(x-WAVE[leg])<2.5){leg++;wave.retarget(WAVE[leg])}draw()},onDone:function(){wave=null;ang=0;draw()}})}
function pulse(){if(mark&&mark.animate)mark.animate([{opacity:1},{opacity:.5},{opacity:1}],{duration:220})}
function home(vx,vy){if(sx)sx.stop();if(sy)sy.stop();
sx=M.spring({from:px,to:0,velocity:vx,damping:0.8,response:0.4,onUpdate:function(x){px=x;draw()},onDone:function(){sx=null;px=0;draw()}});
sy=M.spring({from:py,to:0,velocity:vy,damping:0.8,response:0.4,onUpdate:function(y){py=y;draw()},onDone:function(){sy=null;py=0;draw()}})}
document.addEventListener("pointerdown",function(e){var a=e.target.closest&&e.target.closest(SEL);if(!a||e.button!==0||!e.isPrimary)return;
blockUntil=0;bind(a);if(!mark)return;if(!on()){pulse();return}
var bx=px,by=py;if(sx){bx=sx.stop().x;sx=null}if(sy){by=sy.stop().x;sy=null}px=bx;py=by;
press={id:e.pointerId,x:e.clientX,y:e.clientY,bx:bx,by:by,travel:0,tx:M.tracker(),ty:M.tracker()};
try{a.setPointerCapture(e.pointerId)}catch(_){}
wv();draw()});
document.addEventListener("pointermove",function(e){if(!press||e.pointerId!==press.id)return;
var dx=e.clientX-press.x,dy=e.clientY-press.y;press.travel=travelOf(press.travel,dx,dy);
var p=band(press.bx+dx,press.by+dy);px=p[0];py=p[1];press.tx.add(px);press.ty.add(py);draw()});
function up(e){if(!press||e.pointerId!==press.id)return;var p=press;press=null;
if(cancels(p.travel))blockUntil=Date.now()+600;home(p.tx.velocity(),p.ty.velocity())}
document.addEventListener("pointerup",up);
document.addEventListener("pointercancel",function(e){if(press&&e.pointerId===press.id)press.travel=99;up(e)});
document.addEventListener("click",function(e){if(Date.now()>blockUntil)return;var a=e.target.closest&&e.target.closest(SEL);if(!a)return;
blockUntil=0;e.preventDefault();e.stopImmediatePropagation()},true);
document.addEventListener("dragstart",function(e){if(e.target.closest&&e.target.closest(SEL))e.preventDefault()});
document.addEventListener("keydown",function(e){if(e.key!==" "&&e.key!=="Spacebar")return;var a=e.target.closest&&e.target.closest(SEL);if(!a||e.target!==a)return;
e.preventDefault();blockUntil=0;bind(a);if(!mark)return;if(on())wv();else pulse()});
})();`;
