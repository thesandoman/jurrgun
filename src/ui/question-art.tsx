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
@media (prefers-reduced-motion:reduce){.q-art-icons b{animation:none}}
`;
