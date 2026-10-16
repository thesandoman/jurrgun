/**
 * Feature moments: a button or animation that belongs to one feature, so
 * the big steps feel different from ordinary taps.
 *
 *  - RSVP is a ticket: notched ends, and it gets punched when you press it.
 *  - The pass arrives torn along its perforation; while check-in is open it
 *    glows and says so, and the code flips over to the short code.
 *  - Passport stamps simply appear: no slam, no ink ring (owner, Phase 2A).
 *  - A new mutual connection: two circles slide together and a spark pops.
 *
 * All of it stops for reduced motion (the OS setting or the Accessibility
 * menu); anything that would otherwise stay on screen is hidden instead.
 */
import { themed } from "./styles";

export const MOMENTS_CSS = themed(`
/* RSVP ticket */
.btn-ticket{position:relative;padding-inline:28px 40px;-webkit-mask:radial-gradient(circle 7px at 0 50%,#0000 96%,#000) left/51% 100% no-repeat,radial-gradient(circle 7px at 100% 50%,#0000 96%,#000) right/51% 100% no-repeat;mask:radial-gradient(circle 7px at 0 50%,#0000 96%,#000) left/51% 100% no-repeat,radial-gradient(circle 7px at 100% 50%,#0000 96%,#000) right/51% 100% no-repeat;box-shadow:none}
.btn-ticket:focus-visible{-webkit-mask:none;mask:none}
.btn-ticket::before{content:"";position:absolute;right:18px;top:50%;width:12px;height:12px;margin-top:-6px;border-radius:50%;background:var(--surface);box-shadow:inset 0 1px 2px rgba(0,0,0,.35);transform:scale(0)}
.btn-ticket>span{position:relative;padding-right:14px;border-right:2px dashed color-mix(in srgb,currentColor 45%,transparent)}
.btn-ticket.is-busy{animation:punch-press .28s ease}
.btn-ticket.is-busy::before{animation:punch .38s .08s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes punch{0%{transform:scale(0)}60%{transform:scale(1.3)}100%{transform:scale(1)}}
@keyframes punch-press{35%{transform:translateY(2px) scale(.97)}}

/* The pass tears in along its perforation */
.ticket .ticket-top{animation:tear-top .55s cubic-bezier(.2,.9,.3,1) both}
.ticket .ticket-body{animation:tear-body .6s .08s cubic-bezier(.2,.9,.3,1) both}
@keyframes tear-top{from{transform:translateY(-14px) rotate(-1.2deg);opacity:0}}
@keyframes tear-body{from{transform:translateY(18px) rotate(.8deg);opacity:0}}

/* Live pass: check-in is open */
.ticket.is-live{box-shadow:0 0 0 3px color-mix(in srgb,var(--brand) 45%,transparent),var(--shadow);animation:live-glow 2.4s ease-in-out 3}
@keyframes live-glow{50%{box-shadow:0 0 0 9px color-mix(in srgb,var(--brand) 16%,transparent),var(--shadow)}}
.live-pill{display:inline-flex;align-items:center;gap:8px;margin:0 0 8px;padding:5px 12px;border-radius:999px;background:var(--brand-soft);color:var(--brand);font-weight:700;font-size:.88rem}
.live-pill i{flex:none;width:9px;height:9px;border-radius:50%;background:var(--brand);animation:live-dot 1.8s ease-out 3}
@keyframes live-dot{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--brand) 55%,transparent)}80%,100%{box-shadow:0 0 0 9px transparent}}

/* QR flips to the short code */
.qr-flip{position:relative;display:grid;border:0;padding:0;margin:0;background:none;color:inherit;font:inherit;cursor:pointer;perspective:900px;border-radius:16px}
.qr-face{grid-area:1/1;-webkit-backface-visibility:hidden;backface-visibility:hidden;transition:transform .5s cubic-bezier(.2,.9,.3,1)}
.qr-front svg{display:block}
.qr-back{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:16px;border-radius:14px;background:var(--deep);color:#fff;transform:rotateY(180deg)}
.qr-back b{font-family:var(--display);font-size:2.4rem;letter-spacing:.16em;line-height:1.1}
.qr-back small{color:var(--on-deep-2)}
.qr-flip[aria-pressed=true] .qr-front{transform:rotateY(-180deg)}
.qr-flip[aria-pressed=true] .qr-back{transform:rotateY(0)}
.qr-flip:focus-visible{outline:3px solid var(--brand);outline-offset:4px}

/* Countdown, calendar and directions */
.countdown{text-align:center;text-wrap:balance;font-weight:700;color:var(--ink-2);margin:-4px 0 10px;font-variant-numeric:tabular-nums}
.pass-actions,.ev-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:6px 0 16px}
.ev-actions{justify-content:flex-start;margin:4px 0 10px}
.caps-warn{display:block;color:var(--warn);font-weight:600}

/* Mutual connection spark */
.spark-pop{position:fixed;z-index:45;left:50%;top:40%;display:flex;align-items:center;transform:translate(-50%,-50%);pointer-events:none;animation:sp-out .45s 2.3s ease forwards}
.spark-pop i{display:grid;place-items:center;width:62px;height:62px;border-radius:50%;border:3px solid var(--surface);box-shadow:0 10px 28px rgba(0,0,0,.2);font-style:normal;font-weight:800;font-size:1.5rem;color:#fff}
.spark-pop .sp-a{background:linear-gradient(135deg,#2fb866,var(--brand));animation:sp-l .7s cubic-bezier(.2,.8,.2,1) both}
.spark-pop .sp-b{background:linear-gradient(135deg,#ffc766,#ffa53a);margin-left:-14px;animation:sp-r .7s cubic-bezier(.2,.8,.2,1) both}
.spark-pop b{position:absolute;left:50%;top:-26px;font-size:1.9rem;transform:translateX(-50%) scale(0);animation:sp-burst .5s .55s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes sp-l{from{transform:translateX(-90px);opacity:0}}
@keyframes sp-r{from{transform:translateX(90px);opacity:0}}
@keyframes sp-burst{to{transform:translateX(-50%) scale(1)}}
@keyframes sp-out{to{opacity:0;visibility:hidden}}
html.a11y-motion .spark-pop{display:none}
@media (prefers-reduced-motion:reduce){.spark-pop{display:none}}
`);
