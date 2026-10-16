/**
 * The "alive" layer: small, warm feedback so the app answers every tap.
 * Ideas studied on 21st.dev (Sonner-style stacked toasts, a confetti burst,
 * a tilt card with a spotlight, a fanned hover stack), rebuilt without React
 * for server-rendered pages. Our own twist, unlike Luma's clean lists or
 * Timeleft's dark dinner cards: events are ticket stubs, torn along a
 * perforation, with a stamped date, because every Jurrgun plan ends in a
 * real pass and a stamp in your Bangkok passport.
 *
 *  - Success notices float in as a calm toast and leave by themselves. Only
 *    the friendship milestone adds a short confetti burst (a "friendship"
 *    toast, or a [data-celebrate] block the moment it lands). A seat, a
 *    check-in, a connection or a stamp stays calm (owner, Phase 2A).
 *  - Buttons squish when pressed and show they are working after submit
 *    (and can't be sent twice).
 *  - Cards rise in one after another; on a mouse they tilt toward the pointer.
 *  - Everything decorative stops under prefers-reduced-motion and the
 *    Accessibility menu's "reduce motion".
 */
export const ALIVE_CSS = `
/* toast: the ok notice floats under the header, then tucks itself away */
.notice.ok.toast{position:fixed;z-index:40;left:50%;top:calc(70px + env(safe-area-inset-top));transform:translateX(-50%);width:max-content;max-width:min(92vw,460px);margin:0;display:flex;align-items:center;gap:10px;padding:12px 18px 12px 12px;border-radius:999px;background:var(--lime);color:#06301c;font-weight:650;box-shadow:0 14px 34px rgba(4,40,22,.35),0 0 0 1px rgba(6,48,28,.12) inset;animation:toast-in .5s cubic-bezier(.2,1.4,.4,1) both,toast-out .45s ease 4.2s forwards}
.notice.ok.toast::before{content:"✓";flex:none;display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#06301c;color:var(--lime);font-weight:800;animation:toast-tick .5s .18s cubic-bezier(.2,1.6,.4,1) both}
.notice.ok.toast.party::before{content:"🎉";background:transparent;font-size:1.25rem}
@keyframes toast-in{from{opacity:0;transform:translate(-50%,-16px) scale(.9)}to{opacity:1;transform:translate(-50%,0) scale(1)}}
@keyframes toast-out{to{opacity:0;transform:translate(-50%,-12px) scale(.96);visibility:hidden}}
@keyframes toast-tick{from{transform:scale(0) rotate(-40deg)}to{transform:scale(1) rotate(0)}}
.confetti{position:fixed;inset:0;pointer-events:none;z-index:41;overflow:hidden}
.confetti i{position:absolute;left:50%;top:84px;width:8px;height:12px;border-radius:2px;background:var(--c);transform:translate(0,0) rotate(0);animation:confetti 1.5s cubic-bezier(.15,.7,.4,1) forwards}
.confetti i:nth-child(3n){border-radius:50%;width:9px;height:9px}
@keyframes confetti{to{transform:translate(var(--x),var(--y)) rotate(var(--r));opacity:0}}

/* buttons: a soft press, then a working state */
.btn{transition:transform .12s ease,background-color .2s ease,box-shadow .2s ease}
.btn:active{transform:scale(.96)}
.btn.is-busy{pointer-events:none;opacity:.85}
.btn.is-busy::after{content:"";display:inline-block;width:1.1em;height:.3em;margin-left:8px;vertical-align:middle;background:radial-gradient(circle,currentColor 45%,transparent 50%) 0 50%/33% 100% repeat-x;animation:busy .9s steps(3) infinite;clip-path:inset(0 100% 0 0)}
@keyframes busy{to{clip-path:inset(0 0 0 0)}}

/* event cards as ticket stubs: perforation and two punched notches */
.card.ev-card{--notch:132px;position:relative;border:0;-webkit-mask:radial-gradient(circle 11px at 0 var(--notch),#0000 97%,#000) left/51% 100% no-repeat,radial-gradient(circle 11px at 100% var(--notch),#0000 97%,#000) right/51% 100% no-repeat;mask:radial-gradient(circle 11px at 0 var(--notch),#0000 97%,#000) left/51% 100% no-repeat,radial-gradient(circle 11px at 100% var(--notch),#0000 97%,#000) right/51% 100% no-repeat;background:var(--surface);transition:transform .35s cubic-bezier(.2,.8,.2,1)}
.card.ev-card.feat{--notch:178px}
.ev-card .ev-body{position:relative}
.ev-card .ev-body::before{content:"";position:absolute;left:18px;right:18px;top:0;border-top:2px dashed color-mix(in srgb,var(--ink-3) 35%,transparent)}
.ev-card .ev-date{transform:rotate(-4deg);border:2px solid var(--lime);box-shadow:0 6px 16px rgba(0,0,0,.16)}
.ev-card::after{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;background:radial-gradient(260px circle at var(--mx,50%) var(--my,0%),rgba(255,255,255,.22),transparent 60%);opacity:0;transition:opacity .3s ease}
@media (hover:hover) and (pointer:fine){
  .ev-card:hover{transform:perspective(900px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) translateY(-4px)}
  .ev-card:hover::after{opacity:1}
  .ev-card:hover .ev-date{transform:rotate(0) scale(1.06);transition:transform .3s cubic-bezier(.2,1.5,.4,1)}
}
/* lists rise in, one after another */
.discover-list>*,.me-menu>*,.stack-in>*{animation:rise .5s cubic-bezier(.2,.8,.2,1) backwards}
.discover-list>:nth-child(2),.me-menu>:nth-child(2){animation-delay:.05s}
.discover-list>:nth-child(3),.me-menu>:nth-child(3){animation-delay:.1s}
.discover-list>:nth-child(4),.me-menu>:nth-child(4){animation-delay:.15s}
.discover-list>:nth-child(5),.me-menu>:nth-child(5){animation-delay:.2s}
.discover-list>:nth-child(n+6),.me-menu>:nth-child(n+6){animation-delay:.25s}
@keyframes rise{from{opacity:0;transform:translateY(14px)}}
/* top-down on a laptop: tickets in two columns, the featured one across both */
@media (min-width:1024px){
  .discover-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
  .discover-list>:not(.ev-item),.discover-list>.ev-item:has(.feat){grid-column:1/-1}
  .discover-list>.ev-item>.ev-card{height:100%}
}

/* Me: quick switches, one tap each, no page to open */
.quick{display:grid;gap:8px;margin:18px 0}
.quick h2{font-size:1rem;margin:0 0 2px}
.quick form{margin:0}
.qs{display:flex;align-items:center;gap:12px;width:100%;min-height:56px;padding:10px 14px;border:0;border-radius:18px;background:var(--surface);color:var(--ink);font:inherit;text-align:left;cursor:pointer;box-shadow:0 1px 2px rgba(6,40,22,.05)}
.qs>span:first-child{font-size:1.3rem}
.qs b{display:block;font-weight:650}
.qs small{display:block;color:var(--ink-3);font-size:.8rem}
.qs .sw{margin-left:auto;flex:none;position:relative;width:46px;height:28px;border-radius:999px;background:color-mix(in srgb,var(--ink-3) 30%,transparent);transition:background-color .25s ease}
.qs .sw::after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.2);transition:transform .3s cubic-bezier(.2,1.5,.4,1)}
.qs[aria-pressed=true] .sw{background:var(--brand)}
.qs.love[aria-pressed=true] .sw{background:var(--love)}
.qs.love[aria-pressed=true]{box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--love) 45%,transparent)}
#dating-prompts{padding:14px;border-radius:var(--radius);background:var(--love-soft)}
#dating-prompts h2{color:var(--love-ink)}
.qs[aria-pressed=true] .sw::after{transform:translateX(18px)}
.me-group+.me-menu{margin-top:6px}
/* a fieldset card keeps its title inside the card */
fieldset.card>legend{float:left;width:100%;padding:0;margin:0 0 10px;font-weight:700;font-size:1.02rem}
fieldset.card>legend+*{clear:both}
.me-group{margin:18px 4px 6px;font-size:.78rem;font-weight:700;color:var(--ink-3);letter-spacing:.02em}

@media (prefers-reduced-motion:reduce){
  .notice.ok.toast,.notice.ok.toast::before,.discover-list>*,.me-menu>*,.stack-in>*{animation:none}
  .notice.ok.toast{animation:toast-out .01s 5s forwards}
  .ev-card:hover{transform:none}
  .confetti{display:none}
}
html.a11y-motion .notice.ok.toast,html.a11y-motion .discover-list>*,html.a11y-motion .me-menu>*{animation:none}
html.a11y-motion .ev-card:hover{transform:none}
html.a11y-motion .confetti{display:none}
`;

export const ALIVE_JS = `(function(){
var still=matchMedia("(prefers-reduced-motion: reduce)").matches||document.documentElement.classList.contains("a11y-motion");
// The toast lives on the page root, so the page's fade-in can't hold it.
document.querySelectorAll(".notice.toast").forEach(function(n){document.body.appendChild(n)});
// Confetti for the friendship milestone only, in the brand's colours.
var t=document.querySelector(".toast.party,[data-celebrate]");
if(t&&!still){var box=document.createElement("div");box.className="confetti";box.setAttribute("aria-hidden","true");
var cs=["#b4f03a","#22c55e","#137f45","#fbbf24","#f472b6","#38bdf8"];
for(var i=0;i<34;i++){var p=document.createElement("i");var a=Math.random()*Math.PI*2,d=120+Math.random()*220;
p.style.setProperty("--c",cs[i%cs.length]);p.style.setProperty("--x",Math.cos(a)*d+"px");p.style.setProperty("--y",(Math.sin(a)*d*.6+180+Math.random()*160)+"px");p.style.setProperty("--r",(Math.random()*720-360)+"deg");p.style.animationDelay=(Math.random()*.12)+"s";box.appendChild(p)}
document.body.appendChild(box);setTimeout(function(){box.remove()},1900)}
// Drop ?notice= from the address so a refresh doesn't celebrate twice.
if(location.search.indexOf("notice=")>-1&&history.replaceState){var u=new URL(location.href);u.searchParams.delete("notice");history.replaceState(null,"",u.pathname+(u.search||"")+u.hash)}
// Buttons show they're working, and a form can't be sent twice.
document.addEventListener("submit",function(e){var f=e.target;if(e.defaultPrevented||f.method.toLowerCase()!=="post")return;
if(f.dataset.sent){e.preventDefault();return}f.dataset.sent="1";setTimeout(function(){delete f.dataset.sent},5000);
var b=e.submitter;if(b&&b.classList.contains("btn")){b.classList.add("is-busy");b.setAttribute("aria-busy","true")}});
addEventListener("pageshow",function(){document.querySelectorAll(".is-busy").forEach(function(b){b.classList.remove("is-busy");b.removeAttribute("aria-busy")});document.querySelectorAll("form[data-sent]").forEach(function(f){delete f.dataset.sent})});
// Tickets tilt toward a mouse pointer.
if(!still&&matchMedia("(hover: hover) and (pointer: fine)").matches){document.addEventListener("pointermove",function(e){var c=e.target.closest&&e.target.closest(".ev-card");if(!c)return;var r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
c.style.setProperty("--ry",((x-.5)*7).toFixed(2)+"deg");c.style.setProperty("--rx",((.5-y)*6).toFixed(2)+"deg");c.style.setProperty("--mx",(x*100).toFixed(1)+"%");c.style.setProperty("--my",(y*100).toFixed(1)+"%")},{passive:true})}
})()`;
