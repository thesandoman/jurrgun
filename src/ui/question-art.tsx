/**
 * A small illustrated "postcard" for each generated quiz question: a sky in
 * the time of day, a Bangkok skyline that varies by question, a river line,
 * and the question's icons (the place, or the two options). Pure SVG built on
 * the server, so it costs no requests and works without JavaScript.
 */
import type { Lang } from "../lib/i18n";
import { createRng } from "../vibe/rng";
import type { Art, Tone } from "../vibe/visuals";

const SKIES: Record<Tone, { top: string; bottom: string; orb: string | null; orbY: number; city: string; stars?: boolean; rain?: boolean }> = {
  dawn: { top: "#f6b38d", bottom: "#fde7c8", orb: "#fff1c9", orbY: 92, city: "#5b4a6b" },
  morning: { top: "#8fd3e8", bottom: "#e6f6ee", orb: "#ffe58a", orbY: 40, city: "#2f6f63" },
  afternoon: { top: "#5cb8d6", bottom: "#d6f0e6", orb: "#ffd45c", orbY: 30, city: "#1f5a50" },
  evening: { top: "#e58b6d", bottom: "#f7c98b", orb: "#ffb35c", orbY: 78, city: "#3b2f4a" },
  night: { top: "#0f1b33", bottom: "#2a3b63", orb: "#f3f0d8", orbY: 34, city: "#0b1222", stars: true },
  rain: { top: "#6b7d8f", bottom: "#a9b8c4", orb: null, orbY: 0, city: "#34424f", rain: true },
};

export function QuestionArt(props: { art: Art; lang: Lang }) {
  const { art } = props;
  const sky = SKIES[art.tone] ?? SKIES.afternoon;
  const rng = createRng(art.seed);
  const W = 320;
  const H = 132;
  const base = 104;
  // Skyline: a row of towers with a chedi (stupa) or two, from the seed.
  const blocks: string[] = [];
  let x = 0;
  while (x < W) {
    const w = 14 + Math.floor(rng() * 26);
    const h = 14 + Math.floor(rng() * 44);
    if (rng() < 0.12) {
      // a temple spire
      const cx = x + w / 2;
      blocks.push(`M${x} ${base}L${x} ${base - h * 0.6}L${cx} ${base - h * 1.35}L${x + w} ${base - h * 0.6}L${x + w} ${base}Z`);
    } else {
      blocks.push(`M${x} ${base}L${x} ${base - h}L${x + w} ${base - h}L${x + w} ${base}Z`);
    }
    x += w + Math.floor(rng() * 4);
  }
  const stars = sky.stars ? Array.from({ length: 14 }, () => [Math.floor(rng() * W), Math.floor(rng() * 50)]) : [];
  const drops = sky.rain ? Array.from({ length: 22 }, () => [Math.floor(rng() * W), Math.floor(rng() * 90)]) : [];
  const orbX = 40 + Math.floor(rng() * 240);
  const gid = `g${art.seed.toString(36)}`;
  const icons = art.icons.slice(0, 3);
  const caption = art.caption ? (props.lang === "en" ? art.caption.en : art.caption.th) : null;
  return (
    <figure class="q-art" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="presentation">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color={sky.top} />
            <stop offset="1" stop-color={sky.bottom} />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill={`url(#${gid})`} />
        {stars.map(([sx, sy]) => <circle cx={sx} cy={sy} r="1.1" fill="#fff" opacity=".8" />)}
        {sky.orb ? <circle cx={orbX} cy={sky.orbY} r="15" fill={sky.orb} opacity=".95" /> : null}
        <path d={blocks.join("")} fill={sky.city} opacity=".9" />
        <rect x="0" y={base} width={W} height={H - base} fill={sky.city} opacity=".55" />
        <path d={`M0 ${base + 12} Q ${W / 4} ${base + 6} ${W / 2} ${base + 12} T ${W} ${base + 12}`} stroke="#ffffff" stroke-opacity=".35" fill="none" stroke-width="2" />
        {drops.map(([dx, dy]) => <line x1={dx} y1={dy} x2={dx - 3} y2={dy + 9} stroke="#e8f1f8" stroke-opacity=".7" stroke-width="1.2" />)}
      </svg>
      <span class={`q-art-icons n${icons.length}`}>
        {icons.map((i) => <b>{i}</b>)}
      </span>
      {caption ? <figcaption>📍 {caption}</figcaption> : null}
    </figure>
  );
}

export const QUESTION_ART_CSS = `
.q-art{position:relative;margin:2px 0 10px;border-radius:16px;overflow:hidden;height:118px;box-shadow:var(--shadow)}
.q-art svg{display:block;width:100%;height:100%}
.q-art-icons{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:18px;pointer-events:none}
.q-art-icons b{font-size:2.6rem;line-height:1;filter:drop-shadow(0 3px 6px rgba(0,0,0,.25));animation:qpop .5s ease both}
.q-art-icons.n3 b:nth-child(2){font-size:1.6rem;opacity:.9}
.q-art figcaption{position:absolute;left:10px;bottom:8px;padding:2px 10px;border-radius:999px;background:rgba(0,0,0,.45);color:#fff;font-size:.78rem}
.answer-icon{font-size:1.5rem;line-height:1;flex:none}
@keyframes qpop{from{transform:scale(.6) translateY(6px);opacity:0}to{transform:none;opacity:1}}
.q-count{display:block;font-size:.8rem;margin-bottom:4px}
.q .tap-hint{margin-right:8px}
/* slider */
.q-slider{margin-top:18px;--v:50%}
.q-slider-ends{display:flex;justify-content:space-between;gap:16px;font-weight:600;line-height:1.3}
.q-slider-ends span{display:flex;align-items:center;gap:8px;max-width:48%}
.q-slider-ends span:last-child{text-align:right;justify-content:flex-end}
.q-slider-ends b{font-size:1.6rem;flex:none}
.q-slider input[type=range]{display:block;width:100%;margin:22px 0 10px;height:44px;background:transparent;accent-color:var(--brand);cursor:pointer;-webkit-appearance:none;appearance:none}
.q-slider input[type=range]::-webkit-slider-runnable-track{height:12px;border-radius:999px;background:linear-gradient(90deg,var(--brand-soft),var(--line) 50%,var(--brand-soft))}
.q-slider input[type=range]::-moz-range-track{height:12px;border-radius:999px;background:linear-gradient(90deg,var(--brand-soft),var(--line) 50%,var(--brand-soft))}
.q-slider input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:36px;height:36px;margin-top:-12px;border-radius:50%;background:var(--brand);border:4px solid var(--surface);box-shadow:var(--shadow)}
.q-slider input[type=range]::-moz-range-thumb{width:30px;height:30px;border-radius:50%;background:var(--brand);border:4px solid var(--surface);box-shadow:var(--shadow)}
.q-slider input[type=range]:focus-visible{outline:3px solid color-mix(in srgb,var(--brand) 45%,transparent);outline-offset:4px;border-radius:999px}
.q-slider-read{display:block;text-align:center;font-weight:600;color:var(--brand);min-height:1.4em}
/* rank */
.q-rank-list{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:10px}
.q-rank-btn,.q-rank-pick{display:flex;align-items:center;gap:12px;width:100%;min-height:68px;padding:12px 14px;border-radius:16px;border:1.5px solid var(--line);background:var(--surface);box-shadow:var(--shadow);color:var(--ink);font:inherit;font-weight:500;line-height:1.35;text-align:left}
.q-rank-btn{display:none;cursor:pointer;transition:transform 60ms ease,background-color .15s ease,border-color .15s ease}
.q-rank-btn:active{transform:scale(.98)}
.q-rank-btn.on{border-color:var(--brand);background:var(--brand-soft)}
.q-rank-btn:focus-visible{outline:3px solid color-mix(in srgb,var(--brand) 45%,transparent)}
.q-rank-badge{flex:none;width:32px;height:32px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;border:2px dashed var(--line);font-size:1rem;color:var(--brand-ink)}
.q-rank-btn.on .q-rank-badge{border:0;background:var(--brand)}
.q-rank-pick span{flex:1}
.q-rank-pick select{flex:none;min-width:64px;min-height:44px;font:inherit;font-weight:700;text-align:center;border-radius:12px;border:1.5px solid var(--line);background:var(--surface);color:var(--ink)}
.q-rank-tools{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:12px}
.q-rank-undo{display:none}
.q-rank-status{font-size:.86rem;color:var(--ink-3)}
.flow.is-js .q-rank-btn{display:flex}
.flow.is-js .q-rank-pick{display:none}
.flow.is-js .q-rank-undo{display:inline-flex}
/* budget */
.q-coins{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:14px}
.q-coin{width:22px;height:22px;border-radius:50%;background:var(--gold,#f5b301);box-shadow:inset 0 -3px 0 rgba(0,0,0,.18);transition:opacity .2s ease,transform .2s ease}
.q-coin.spent{opacity:.22;transform:scale(.8)}
.q-budget-left{text-align:center;font-weight:600;margin:8px 0 4px;color:var(--ink-3)}
.q-budget-left.full{color:var(--brand)}
.q-budget-left.over{color:var(--err)}
.q-budget-list{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:10px}
.q-budget-row{display:flex;align-items:center;gap:12px;min-height:68px;padding:10px 12px;border-radius:16px;border:1.5px solid var(--line);background:var(--surface);box-shadow:var(--shadow)}
.q-budget-row label{flex:1;font-weight:500;line-height:1.35}
.q-budget-ctl{display:flex;align-items:center;gap:6px;flex:none}
.q-budget-ctl input{width:3.2em;min-height:44px;text-align:center;font:inherit;font-weight:700;font-size:1.1rem;border-radius:12px;border:1.5px solid var(--line);background:var(--surface);color:var(--ink);-moz-appearance:textfield}
.q-budget-ctl input::-webkit-inner-spin-button,.q-budget-ctl input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
.q-budget-btn{display:none;width:44px;height:44px;border-radius:50%;border:1.5px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;font-size:1.4rem;font-weight:700;line-height:1;align-items:center;justify-content:center;cursor:pointer}
.q-budget-btn:not(:disabled):active{transform:scale(.94)}
.q-budget-btn:disabled{opacity:.35;cursor:default}
.q-budget-btn:focus-visible{outline:3px solid color-mix(in srgb,var(--brand) 45%,transparent)}
.flow.is-js .q-budget-btn{display:inline-flex}
@media (max-width:380px){.q-budget-row{flex-wrap:wrap}.q-budget-ctl{margin-left:auto}}
@media (prefers-reduced-motion:reduce){.q-art-icons b{animation:none}.q-coin{transition:none}}
`;
