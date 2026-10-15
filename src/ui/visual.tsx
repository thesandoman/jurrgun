/**
 * Visual building blocks: more picture, less paragraph. Layered patterns
 * (bento grids, stacked cards, fanned postcards, avatar stacks, stamps) in
 * the spirit of 21st.dev components, rebuilt as server-rendered JSX + CSS on
 * the app's own tokens, so they work without JavaScript and in dark mode.
 */
import type { Child } from "hono/jsx";
import { QuestionArt } from "./question-art";
import type { Lang } from "../lib/i18n";
import type { Art } from "../vibe/visuals";
import { hashString } from "../vibe/rng";

/** A bento grid; children are Tile elements. */
export function Bento(props: { children: Child; class?: string }) {
  return <div class={`bento ${props.class ?? ""}`}>{props.children}</div>;
}

/**
 * One bento cell. `size` hero = 2x2, wide = 2x1, tall = 1x2; `tone` picks the
 * surface: brand gradient, deep, gold, or plain card. `art` adds a skyline.
 */
export function Tile(props: {
  children: Child;
  href?: string;
  size?: "hero" | "wide" | "tall";
  tone?: "brand" | "deep" | "gold" | "plain";
  art?: Art;
  lang?: Lang;
  class?: string;
}) {
  const cls = `tile2 ${props.size ?? ""} t-${props.tone ?? "plain"} ${props.class ?? ""}`;
  const inner = (
    <>
      {props.art ? (
        <span class="tile2-art" aria-hidden="true">
          <QuestionArt art={{ ...props.art, icons: [] }} lang={props.lang ?? "en"} />
        </span>
      ) : null}
      <span class="tile2-body">{props.children}</span>
    </>
  );
  return props.href ? (
    <a href={props.href} class={cls}>
      {inner}
    </a>
  ) : (
    <div class={cls}>{inner}</div>
  );
}

/** A big number with a small label, for bento stat tiles. */
export function Big(props: { n: string; label: string }) {
  return (
    <>
      <strong class="big-n">{props.n}</strong>
      <small class="big-l">{props.label}</small>
    </>
  );
}

/** A small glassy pill, e.g. "● Live" on a hero tile. */
export function Pill(props: { children: Child; dot?: boolean }) {
  return (
    <span class="pill2">
      {props.dot ? <i class="pill2-dot" /> : null}
      {props.children}
    </span>
  );
}

/** Overlapping circles: people, types or emoji. */
export function AvatarStack(props: { items: { label: string; emoji?: string; seed?: string }[]; more?: number; size?: number }) {
  const size = props.size ?? 40;
  return (
    <span class="avstack" style={`--av:${size}px`}>
      {props.items.map((x) => (
        <span class="av" style={`--h:${hashString(x.seed ?? x.label) % 360}`} title={x.label} aria-label={x.label}>
          {x.emoji ?? x.label.slice(0, 1).toUpperCase()}
        </span>
      ))}
      {props.more ? <span class="av more">+{props.more}</span> : null}
    </span>
  );
}

/** Up to three postcards fanned like photos in a hand. */
export function PostcardFan(props: { cards: Art[]; lang: Lang }) {
  return (
    <div class={`fan n${Math.min(3, props.cards.length)}`}>
      {props.cards.slice(0, 3).map((a) => (
        <div class="fan-card">
          <QuestionArt art={a} lang={props.lang} />
        </div>
      ))}
    </div>
  );
}

/** A circular progress ring with a value in the middle. */
export function Ring(props: { value: number; max: number; label: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, props.value / props.max));
  return (
    <span class="ring" role="img" aria-label={`${props.value} / ${props.max} ${props.label}`}>
      <svg viewBox="0 0 80 80" width="88" height="88">
        <circle cx="40" cy="40" r={r} class="ring-bg" />
        <circle cx="40" cy="40" r={r} class="ring-fg" stroke-dasharray={`${(c * pct).toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 40 40)" />
      </svg>
      <span class="ring-in">
        <strong>{props.value}</strong>
        <small>/{props.max}</small>
      </span>
    </span>
  );
}

/** A grid of round stamps; stamped ones are filled, with a short label. */
export function Stamps(props: { items: { key: string; short: string; name: string; on: boolean; fresh?: boolean }[] }) {
  return (
    <ul class="stamps">
      {props.items.map((x, i) => (
        <li class={x.on ? (x.fresh ? "on fresh" : "on") : ""} style={x.on && x.fresh ? `--d:${(i % 6) * 0.12}s` : undefined} title={x.name} aria-label={`${x.name}${x.on ? " ✓" : ""}`}>
          <span>{x.short}</span>
        </li>
      ))}
    </ul>
  );
}

/** A tone for a place card, stable per name. */
export function artFor(name: string, emoji: string, caption?: { en: string; th: string }): Art {
  const tones: Art["tone"][] = ["morning", "afternoon", "evening", "dawn", "night"];
  const seed = hashString(name);
  return { tone: tones[seed % tones.length], icons: [emoji], caption, seed };
}

export const VISUAL_CSS = `
.bento{display:grid;grid-template-columns:repeat(2,1fr);grid-auto-rows:minmax(118px,auto);gap:10px;margin:12px 0}
@media (min-width:720px){.bento{grid-template-columns:repeat(4,1fr)}}
.tile2{position:relative;display:flex;flex-direction:column;justify-content:flex-end;gap:2px;min-height:118px;padding:16px;border-radius:24px;overflow:hidden;text-decoration:none;color:var(--ink);background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow);isolation:isolate;transition:transform .18s ease}
a.tile2:hover{transform:translateY(-2px)}
a.tile2:active{transform:scale(.98)}
.tile2.hero{grid-column:span 2;grid-row:span 2;min-height:250px}
.tile2.wide{grid-column:span 2}
.tile2.tall{grid-row:span 2}
.tile2.t-brand{background:var(--hero);color:#fff;border:0}
.tile2.t-deep{background:linear-gradient(160deg,var(--deep,#06492a),#0b1610);color:#fff;border:0}
.tile2.t-gold{background:linear-gradient(135deg,var(--gold-soft),var(--surface));}
.tile2-art{position:absolute;inset:0;z-index:-1}
.tile2-art .q-art{height:100%;margin:0;border-radius:0;box-shadow:none}
.tile2-art::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.65),rgba(0,0,0,.05) 70%)}
.tile2:has(.tile2-art){color:#fff;border:0}
.tile2-body{display:flex;flex-direction:column;gap:4px}
.tile2:has(.tile2-art) .tile2-body{text-shadow:0 1px 10px rgba(0,0,0,.55)}
.tile2 h2,.tile2 h3{margin:0;line-height:1.1}
.tile2.hero h2{font-size:1.9rem;letter-spacing:-.02em}
.tile2 .ico{font-size:1.9rem;line-height:1}
.tile2 small{opacity:.85}
.tile2 .go{position:absolute;top:12px;right:12px;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.18);backdrop-filter:blur(6px);color:inherit;font-weight:700}
.big-n{font-size:2.3rem;font-weight:900;line-height:1;letter-spacing:-.03em}
.big-l{font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;font-weight:700;opacity:.8}
.pill2{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;padding:4px 12px;border-radius:999px;background:rgba(255,255,255,.2);backdrop-filter:blur(6px);font-size:.78rem;font-weight:700}
.pill2-dot{width:8px;height:8px;border-radius:50%;background:var(--lime);animation:pulse2 1.6s ease-in-out infinite}
@keyframes pulse2{50%{opacity:.35}}
.avstack{display:inline-flex;align-items:center}
.av{width:var(--av);height:var(--av);margin-left:calc(var(--av) * -.3);border-radius:50%;display:grid;place-items:center;font-size:calc(var(--av) * .5);font-weight:800;color:#fff;background:linear-gradient(135deg,hsl(var(--h) 70% 50%),hsl(calc(var(--h) + 40) 75% 60%));border:3px solid var(--surface);box-shadow:var(--shadow)}
.av:first-child{margin-left:0}
.av.more{background:var(--surface-2);color:var(--ink);font-size:calc(var(--av) * .32)}
.t-brand .av,.t-deep .av,.tile2:has(.tile2-art) .av{border-color:rgba(255,255,255,.6)}
.fan{position:relative;height:150px;margin:6px 0 14px}
.fan-card{position:absolute;top:0;left:50%;width:min(56%,220px);transform-origin:50% 120%;transition:transform .3s ease}
.fan-card .q-art{height:130px;margin:0;border:4px solid var(--surface);border-radius:18px}
.fan.n3 .fan-card:nth-child(1){transform:translateX(-50%) translateX(-28%) rotate(-8deg)}
.fan.n3 .fan-card:nth-child(2){transform:translateX(-50%) translateY(-6px);z-index:2}
.fan.n3 .fan-card:nth-child(3){transform:translateX(-50%) translateX(28%) rotate(8deg)}
.fan.n2 .fan-card:nth-child(1){transform:translateX(-50%) translateX(-22%) rotate(-6deg)}
.fan.n2 .fan-card:nth-child(2){transform:translateX(-50%) translateX(22%) rotate(6deg);z-index:2}
.fan.n1 .fan-card{transform:translateX(-50%);width:min(90%,340px)}
.fan:hover .fan-card:nth-child(1){transform:translateX(-50%) translateX(-34%) rotate(-11deg)}
.fan:hover .fan-card:nth-child(3){transform:translateX(-50%) translateX(34%) rotate(11deg)}
.ring{position:relative;display:inline-grid;place-items:center;flex:none}
.ring-bg{fill:none;stroke:var(--surface-2);stroke-width:9}
.ring-fg{fill:none;stroke:var(--brand);stroke-width:9;stroke-linecap:round;transition:stroke-dasharray .6s ease}
.ring-in{position:absolute;display:flex;align-items:baseline;gap:1px}
.ring-in strong{font-size:1.5rem;font-weight:900}
.ring-in small{color:var(--ink-3);font-weight:700}
.stamps{list-style:none;padding:0;margin:10px 0;display:grid;grid-template-columns:repeat(auto-fill,minmax(44px,1fr));gap:8px}
.stamps li{aspect-ratio:1;border-radius:50%;display:grid;place-items:center;font-size:.62rem;font-weight:800;letter-spacing:.02em;color:var(--ink-3);border:2px dashed var(--line);text-transform:uppercase}
.stamps li.on{border:2px solid rgba(255,255,255,.55);outline:2px solid var(--brand);outline-offset:-6px;color:#fff;background:var(--hero);transform:rotate(-8deg);box-shadow:var(--shadow)}
.stack-card{position:relative;margin:18px 4px 14px}
.stack-card::before,.stack-card::after{content:"";position:absolute;left:12px;right:12px;height:100%;border-radius:24px;background:var(--surface-2);border:1px solid var(--line)}
.stack-card::before{top:-14px;left:24px;right:24px;opacity:.55}
.stack-card::after{top:-7px;opacity:.85}
.stack-card>.tile2{position:relative;z-index:1;min-height:170px}
.rail2{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 2px 12px;margin:0 -2px}
.rail2>*{flex:0 0 min(70%,260px);scroll-snap-align:start}
.place-card{display:block;border-radius:20px;overflow:hidden;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow);text-decoration:none;color:var(--ink)}
.place-card .q-art{height:120px;margin:0;border-radius:0;box-shadow:none}
.place-card div{padding:10px 12px}
.place-card strong{display:block;line-height:1.2}
.place-card small{color:var(--ink-3)}
.chips2{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
.passport-head{display:flex;align-items:center;gap:14px}
.passport-head h2{margin:0}
.quest-title{font-size:1.15rem;line-height:1.3;margin:4px 0}
.card.quest.season{background:linear-gradient(160deg,var(--gold-soft),var(--surface) 55%)}
.stack-card .avstack{margin:6px 0 4px}
.fan{overflow:visible;contain:layout}
.acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.acts form{margin:0}
.acts .btn{min-height:40px;padding:0 14px;font-size:.9rem}
.glass-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:999px;background:rgba(255,255,255,.16);backdrop-filter:blur(6px);color:inherit;text-decoration:none;font-weight:700;font-size:.88rem}
.glass-btn:hover{background:rgba(255,255,255,.26)}
.type-hero2 .tile2{min-height:260px;text-align:left}
.type-hero2 .type-emoji{font-size:3.6rem;line-height:1;filter:drop-shadow(0 6px 12px rgba(0,0,0,.35))}
.type-hero2 h1{color:#fff;margin:.1rem 0;font-size:1.9rem;line-height:1.1}
.type-hero2 .type-range a{color:#fff;font-weight:700}
.type-hero2.reveal .type-emoji{animation:pop .5s cubic-bezier(.2,1.4,.4,1) both}
.blend3{grid-template-columns:repeat(3,1fr)}
.blend3 .tile2{min-height:150px;padding:12px}
.blend3 .big-n{font-size:1.7rem}
.facts3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}
.fact{display:flex;flex-direction:column;gap:4px;padding:12px;border-radius:18px;background:var(--surface);border:1px solid var(--line);font-size:.86rem;line-height:1.3}
.fact b{font-size:1.5rem}
.fact small{color:var(--ink-3);font-weight:700;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em}
@media (max-width:420px){.facts3{grid-template-columns:1fr}.fact{flex-direction:row;flex-wrap:wrap;align-items:center}.fact span{flex-basis:100%}}
.type-row{display:flex;gap:14px;flex-wrap:wrap}
.type-pick{display:flex;flex-direction:column;align-items:center;gap:6px;text-decoration:none;color:var(--ink);font-weight:600;max-width:96px;text-align:center}
.type-pick small{font-size:.8rem;line-height:1.2}
.people-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.tile2 .ico{font-weight:800}
.seats{display:flex;flex-wrap:wrap;gap:3px;align-items:center;margin:6px 0}
.seats i{width:10px;height:10px;border-radius:3px;background:var(--surface-2);border:1px solid var(--line)}
.seats i.on{background:var(--brand);border-color:var(--brand)}
.seats small{color:var(--ink-3);font-size:.72rem;margin-left:2px}
.facts4{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:12px 0}
@media (min-width:720px){.facts4{grid-template-columns:repeat(4,1fr)}}
.facts4 .fact span{font-weight:700}
details.how.ev-desc>summary{font-weight:400;line-height:1.5;color:var(--ink-2)}
.guide-tips{list-style:none;padding:0;margin:8px 0 12px;display:grid;gap:10px}
.guide-tips li{display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:18px;background:var(--surface);border:1px solid var(--line);line-height:1.35}
.guide-tips li b{flex:none;font-size:1.5rem;width:36px;text-align:center}
.guide-promise{display:flex;gap:12px;align-items:flex-start;padding:14px;border-radius:18px;background:var(--brand-soft);font-weight:600;line-height:1.4}
.guide-promise input{width:22px;height:22px;flex:none;margin-top:2px}
.deck{position:relative;margin:12px auto 4px;max-width:420px}
.deck-card{position:relative;z-index:2;will-change:transform;background:var(--surface);border:1px solid var(--line);border-radius:28px;padding:28px 22px 22px;box-shadow:0 18px 40px rgba(6,40,22,.18);touch-action:pan-y;user-select:none;cursor:grab;text-align:center}
.deck-card:active{cursor:grabbing}
.deck-under{position:absolute;z-index:1;transform-origin:50% 100%;transform:scale(.95) translateY(10px);will-change:transform;left:14px;right:14px;top:14px;bottom:-10px;border-radius:28px;background:var(--surface-2);border:1px solid var(--line)}
.deck-face{font-size:3.4rem;line-height:1;width:92px;height:92px;margin:0 auto 10px;display:grid;place-items:center;border-radius:36px;background:var(--brand-soft)}
.deck-card h2{margin:4px 0 2px;font-size:1.6rem}
.deck-sub{margin:0 0 8px;color:var(--ink-2)}
.deck-why{margin:6px 0 10px;font-weight:600}
.deck-card .chips2{justify-content:center}
.chips2 span.on{background:var(--brand);color:var(--brand-ink)}
.deck-stamp{position:absolute;top:22px;padding:4px 12px;border-radius:10px;font-weight:800;font-size:1.1rem;letter-spacing:.04em;opacity:0;border:3px solid currentColor}
.deck-stamp.keen{left:18px;color:var(--brand);transform:rotate(-12deg)}
.deck-stamp.pass{right:18px;color:#d64545;transform:rotate(12deg)}
.deck-card.dragging{cursor:grabbing}
.deck-btn{transition:transform .1s ease-out}.deck-btn:active{transform:scale(.92)}
.deck-acts{display:flex;justify-content:center;gap:28px;margin:14px 0 8px}
.deck-btn{width:68px;height:68px;border-radius:50%;border:0;font-size:1.7rem;cursor:pointer;box-shadow:var(--shadow);display:grid;place-items:center}
.deck-btn.pass{background:var(--surface);color:#d64545;border:1px solid var(--line)}
.deck-btn.keen{background:var(--lime);color:var(--deep,#06492a)}
@media (prefers-reduced-motion:reduce){.deck-card{transition:none!important}}
.chat-list{list-style:none;padding:0;margin:12px 0;display:grid;gap:8px}
.chat-list a{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:18px;background:var(--surface);color:var(--ink);text-decoration:none;border:1px solid var(--line)}
.chat-list a>b{font-size:1.4rem;width:40px;height:40px;display:grid;place-items:center;border-radius:14px;background:var(--brand-soft);flex:none}
.chat-list a>span{flex:1;min-width:0;display:flex;flex-direction:column}
.chat-list small{color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chat-list a.unread strong{color:var(--brand)}
.chat-list .dot{width:10px;height:10px;border-radius:50%;background:var(--lime);flex:none}
.chat-msgs{list-style:none;padding:0;margin:12px 0;display:flex;flex-direction:column;gap:10px}
.chat-msgs li{display:flex;flex-direction:column;align-items:flex-start;max-width:86%}
.chat-msgs li.mine{align-self:flex-end;align-items:flex-end}
.chat-msgs .bubble{margin:0;padding:10px 14px;border-radius:18px 18px 18px 6px;background:var(--surface-2);white-space:pre-wrap;overflow-wrap:anywhere}
.chat-msgs li.mine .bubble{border-radius:18px 18px 6px 18px;background:var(--brand);color:var(--brand-ink)}
.chat-msgs .who{color:var(--ink-3);font-weight:600;margin:0 0 2px 6px}
.chat-msgs .when{color:var(--ink-3);font-size:.72rem;margin:2px 6px;display:flex;gap:8px;align-items:center}
.chat-msgs .inline{display:inline}
.linkish{background:none;border:0;padding:0;color:var(--ink-3);text-decoration:underline;font:inherit;cursor:pointer}
.chat-warn{margin:0 0 4px;padding:8px 12px;border-radius:12px;background:var(--sun-soft,#fff4dc);color:var(--warn,#8a5a00);font-size:.85rem;font-weight:600}
.chat-photo{margin:0;border-radius:18px;overflow:hidden;background:var(--surface-2);max-width:280px;box-shadow:var(--shadow)}
.chat-photo img{display:block;width:100%;height:auto;max-height:360px;object-fit:cover}
.chat-photo figcaption{padding:8px 12px;font-size:.9rem}
.host-badge{margin-left:8px;padding:1px 8px;border-radius:999px;background:var(--gold-soft);color:#7a4a00;font-size:.72rem;font-weight:700}
.chat-poll{min-width:260px;max-width:320px;padding:12px;border-radius:18px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow);display:flex;flex-direction:column;gap:8px}
.chat-poll .q{margin:0 0 2px;font-weight:700}
.chat-poll form{margin:0}
.chat-poll .opt{position:relative;display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:44px;padding:8px 12px;border-radius:12px;border:1px solid var(--line);background:var(--surface-2);color:var(--ink);font:inherit;text-align:left;cursor:pointer;overflow:hidden}
.chat-poll .opt i{position:absolute;left:0;top:0;bottom:0;background:color-mix(in srgb,var(--brand) 18%,transparent);transition:width .4s ease}
.chat-poll .opt span,.chat-poll .opt b{position:relative}
.chat-poll .opt.mine{border-color:var(--brand);font-weight:700}
.chat-extras{display:flex;flex-direction:column;gap:8px;margin:6px 0 10px}
.chat-photo-form{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.chat-photo-form label.chip{position:relative;cursor:pointer;min-height:44px;display:inline-flex;align-items:center}
.chat-photo-form input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer}
.chat-photo-form input[name=caption]{flex:1;min-width:160px}
.chat-poll-new form{display:grid;gap:8px;margin-top:8px}
@media (prefers-reduced-motion:reduce){.chat-poll .opt i{transition:none}}
.chat-send{position:sticky;bottom:calc(104px + env(safe-area-inset-bottom));display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end;padding:8px 0;background:linear-gradient(to top,var(--bg) 80%,transparent)}
.chat-send>.chat-starters,.chat-send>.notice{grid-column:1/-1}
.chat-send textarea{min-height:46px;resize:none}
.chat-send .btn{min-height:46px}
.chat-starters{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0}
.chat-starters button{flex:none;white-space:nowrap}
.chat-starters button{border:0;border-radius:999px;padding:6px 12px;background:var(--surface-2);color:var(--ink-2);font:inherit;font-size:.85rem;cursor:pointer;text-align:left}
@media (min-width:1024px){.chat-send{bottom:0}}
.grad{margin:8px 0;padding:10px 14px;border-radius:14px;background:var(--sun-soft,#fff4dc);color:var(--ink);font-weight:700}
.thanks-starters button{border:0;border-radius:999px;padding:6px 12px;background:var(--surface-2);color:var(--ink-2);font:inherit;font-size:.85rem;cursor:pointer}
.phone-down{text-align:center;padding:24px 4px}
.phone-down .pd-emoji{font-size:4rem;margin:8px 0}
.pd-prompts{list-style:none;padding:0;margin:20px 0;display:grid;gap:12px;text-align:left}
.pd-prompts li{padding:16px 18px;border-radius:20px;background:var(--surface);border:1px solid var(--line);font-size:1.1rem;font-weight:600;line-height:1.4}
.chips2 span{display:inline-flex;align-items:center;gap:4px;padding:5px 11px;border-radius:999px;background:var(--surface-2);font-size:.82rem;font-weight:600}
@media (prefers-reduced-motion:reduce){.pill2-dot{animation:none}.fan-card,.tile2{transition:none}}
`;
