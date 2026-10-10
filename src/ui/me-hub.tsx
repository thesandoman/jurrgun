/**
 * The "Me" tab hub. Warm and a little playful (references: Timeleft's soft
 * blobs and big friendly type, Beli's profile stats and gentle nudges):
 * organic shapes instead of boxes, tinted emoji bubbles, interests as
 * scattered stickers, and one rounded menu instead of a stack of cards.
 *
 * Tints mix a hue into --surface, so the same rules work in dark mode.
 * Motion is decorative only and stops under prefers-reduced-motion.
 */
import type { Child } from "hono/jsx";
import { interestOpt } from "../content/profile";
import type { View } from "./kit";

export type MeStat = { emoji: string; n: number; label: string; href: string; tint: Tint };
export type MeStep = { done: boolean; label: string; href: string };
export type MeLink = { href: string; emoji: string; title: string; hint: string; tint: Tint };
export type Tint = "green" | "lime" | "teal" | "mint" | "sky" | "sun";

export function MeHub(props: {
  v: View;
  nickname: string;
  photo: string | null;
  place: string;
  memberSince: string | null;
  newcomer: boolean;
  interests: string[];
  stats: MeStat[];
  steps: MeStep[];
  type: Child;
  badge?: Child;
  links: MeLink[];
}) {
  const { t, lang } = props.v;
  const done = props.steps.filter((s) => s.done).length;
  const pct = props.steps.length ? Math.round((done / props.steps.length) * 100) : 100;
  const todo = props.steps.filter((s) => !s.done).slice(0, 3);
  const initial = [...props.nickname][0]?.toUpperCase() ?? "?";
  return (
    <div class="me">
      <style dangerouslySetInnerHTML={{ __html: ME_CSS }} />

      <header class="me-hero">
        <span class="me-blob me-blob-a" aria-hidden="true" />
        <span class="me-blob me-blob-b" aria-hidden="true" />
        <span class="me-blob me-blob-c" aria-hidden="true" />
        <a href="/me/profile" class="me-avatar" aria-label={t("ดูโปรไฟล์ของฉัน", "See my profile")}>
          {props.photo ? <img src={props.photo} alt="" /> : <span aria-hidden="true">{initial}</span>}
        </a>
        <h1 class="me-hi">
          {t(`หวัดดี ${props.nickname}`, `Hey ${props.nickname}`)} <span class="me-wave" aria-hidden="true">👋</span>
        </h1>
        <p class="me-sub">
          <span>📍 {props.place}</span>
          {props.memberSince ? <span>🌱 {t(`อยู่กับเราตั้งแต่ ${props.memberSince}`, `Here since ${props.memberSince}`)}</span> : null}
        </p>
        {props.newcomer ? <span class="me-sticker">✨ {t("มาใหม่ในกรุงเทพฯ", "New to Bangkok")}</span> : null}
        <a href="/me/profile" class="me-peek">
          👀 {t("ดูโปรไฟล์แบบที่คนอื่นเห็น", "See my profile as others do")}
        </a>
      </header>

      <nav class="me-stats" aria-label={t("สรุปของฉัน", "My numbers")}>
        {props.stats.map((s) => (
          <a href={s.href} class={`me-stat tint-${s.tint}`}>
            <span class="me-stat-emoji" aria-hidden="true">{s.emoji}</span>
            <b>{s.n}</b>
            <small>{s.label}</small>
          </a>
        ))}
      </nav>

      {pct < 100 ? (
        <section class="me-grow">
          <div class="me-grow-head">
            <strong>{t(`โปรไฟล์ของคุณพร้อมแล้ว ${pct}%`, `Your profile is ${pct}% there`)}</strong>
            <span aria-hidden="true">{pct < 50 ? "🌱" : "🌿"}</span>
          </div>
          <div class="me-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <i style={`width:${Math.max(pct, 6)}%`} />
          </div>
          <p class="muted">{t("โปรไฟล์ที่ครบช่วยให้เราจัดโต๊ะให้คุณได้ดีขึ้น", "A fuller profile helps us seat you with the right people.")}</p>
          <div class="me-todo">
            {todo.map((s) => (
              <a href={s.href}>+ {s.label}</a>
            ))}
          </div>
        </section>
      ) : (
        <section class="me-grow me-grow-done">
          <strong>🌳 {t("โปรไฟล์ครบแล้ว เยี่ยมมาก!", "Profile complete. Lovely!")}</strong>
        </section>
      )}

      <section class="me-type">{props.type}</section>

      {props.interests.length ? (
        <section class="me-loves">
          <div class="me-h">
            <h2>{t("สิ่งที่ฉันชอบ", "Things I love")}</h2>
            <a href="/settings/profile#interests">{t("แก้ไข", "Edit")}</a>
          </div>
          <div class="me-stickers">
            {props.interests.map((i) => {
              const o = interestOpt(i);
              return o ? (
                <span class="me-chip">
                  <b aria-hidden="true">{o.emoji}</b> {lang === "en" ? o.en : o.th}
                </span>
              ) : null;
            })}
          </div>
        </section>
      ) : null}

      {props.badge}

      <nav class="me-menu" aria-label={t("ตั้งค่า", "Settings")}>
        {props.links.map((l) => (
          <a href={l.href} class="me-row">
            <span class={`me-bubble tint-${l.tint}`} aria-hidden="true">
              {l.emoji}
            </span>
            <span class="me-row-text">
              <strong>{l.title}</strong>
              <small>{l.hint}</small>
            </span>
            <span class="me-chev" aria-hidden="true">›</span>
          </a>
        ))}
      </nav>

      <div class="me-lang" role="group" aria-label={t("ภาษา", "Language")}>
        <a href="/lang/th?back=/settings" lang="th" aria-current={lang === "th" ? "true" : undefined}>
          🇹🇭 ไทย
        </a>
        <a href="/lang/en?back=/settings" lang="en" aria-current={lang === "en" ? "true" : undefined}>
          🌏 English
        </a>
      </div>

      <footer class="me-foot">
        <form method="post" action="/logout">
          <button type="submit" class="me-out">
            {t("ออกจากระบบ", "Sign out")} 👋
          </button>
        </form>
      </footer>
    </div>
  );
}

const ME_CSS = `
.me{--t-green:#22c55e;--t-lime:#a3e635;--t-teal:#14b8a6;--t-mint:#6ee7b7;--t-sky:#38bdf8;--t-sun:#f5b301}
.me .tint-green{--tint:var(--t-green)}.me .tint-sun{--tint:var(--t-sun)}.me .tint-lime{--tint:var(--t-lime)}
.me .tint-sky{--tint:var(--t-sky)}.me .tint-teal{--tint:var(--t-teal)}.me .tint-mint{--tint:var(--t-mint)}

.me-hero{position:relative;text-align:center;padding:26px 8px 18px;margin:0 -8px 6px;isolation:isolate}
.me-blob{position:absolute;z-index:-1;filter:blur(2px);opacity:.55}
.me-blob-a{width:210px;height:190px;left:50%;top:0;transform:translateX(-62%);background:color-mix(in srgb,var(--t-green) 45%,var(--bg));border-radius:58% 42% 63% 37%/45% 55% 45% 55%;animation:me-morph 14s ease-in-out infinite}
.me-blob-b{width:150px;height:140px;left:50%;top:30px;transform:translateX(8%);background:color-mix(in srgb,var(--t-lime) 45%,var(--bg));border-radius:40% 60% 45% 55%/60% 40% 60% 40%;animation:me-morph 18s ease-in-out infinite reverse}
.me-blob-c{width:90px;height:84px;left:50%;top:118px;transform:translateX(-150%);background:color-mix(in srgb,var(--t-teal) 40%,var(--bg));border-radius:50% 50% 38% 62%/55% 45% 55% 45%;animation:me-morph 11s ease-in-out infinite}
@keyframes me-morph{50%{border-radius:42% 58% 37% 63%/58% 38% 62% 42%}}
.me-avatar{position:relative;display:inline-grid;place-items:center;width:116px;height:116px;border-radius:61% 39% 52% 48%/48% 56% 44% 52%;overflow:hidden;background:var(--hero);color:#fff;font-size:2.8rem;font-weight:800;text-decoration:none;box-shadow:0 0 0 5px var(--bg),0 12px 30px rgba(12,138,69,.25);animation:me-morph 16s ease-in-out infinite}
.me-avatar img{width:100%;height:100%;object-fit:cover}
.me-hi{font-size:1.9rem;font-weight:800;letter-spacing:-.03em;margin:14px 0 4px}
.me-wave{display:inline-block;transform-origin:70% 70%;animation:me-wave 2.4s ease-in-out 1}
@keyframes me-wave{10%,30%{transform:rotate(14deg)}20%,40%{transform:rotate(-8deg)}50%{transform:none}}
.me-sub{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 14px;color:var(--ink-2);font-size:.92rem;margin:0}
.me-sticker{display:inline-block;margin-top:10px;padding:5px 12px;border-radius:999px;background:var(--lime);color:var(--deep);font-size:.85rem;font-weight:600;transform:rotate(-3deg);box-shadow:var(--shadow)}
.me-peek{display:inline-block;margin-top:12px;font-weight:600;font-size:.92rem;text-decoration:none;padding:8px 16px;border-radius:999px;background:var(--surface);box-shadow:var(--shadow)}

.me-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:8px 0 18px}
.me-stat{display:flex;flex-direction:column;align-items:center;gap:0;padding:14px 6px 12px;text-decoration:none;color:var(--ink);background:color-mix(in srgb,var(--tint) 16%,var(--surface));border-radius:28px 22px 30px 20px/22px 30px 20px 28px;transition:transform .2s}
.me-stat:nth-child(2){border-radius:22px 30px 20px 28px/30px 20px 28px 22px;transform:translateY(6px)}
.me-stat:active{transform:scale(.97)}
.me-stat-emoji{font-size:1.3rem;line-height:1}
.me-stat b{font-size:1.7rem;font-weight:800;letter-spacing:-.03em;line-height:1.2;margin-top:4px}
.me-stat small{font-size:.78rem;color:var(--ink-2);text-align:center;line-height:1.25}

.me-grow{background:var(--surface);border-radius:26px;padding:16px 18px;margin:14px 0;box-shadow:var(--shadow)}
.me-grow-head{display:flex;justify-content:space-between;align-items:center;gap:10px}
.me-grow-head span{font-size:1.4rem}
.me-bar{height:12px;border-radius:999px;background:var(--surface-2);overflow:hidden;margin:10px 0 6px}
.me-bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--t-green),var(--lime),var(--t-sun))}
.me-grow .muted{margin:0 0 10px}
.me-todo{display:flex;flex-wrap:wrap;gap:8px}
.me-todo a{padding:7px 13px;border-radius:999px;font-size:.88rem;font-weight:600;text-decoration:none;background:var(--brand-soft);color:var(--brand)}
.me-grow-done{text-align:center;background:color-mix(in srgb,var(--t-green) 14%,var(--surface))}

.me-type{margin:18px 0}
.me-type .teaser{transform:rotate(-1.2deg);border-radius:30px 24px 32px 22px/24px 32px 22px 30px}
.me-type .card{border-radius:24px}

.me-h{display:flex;justify-content:space-between;align-items:baseline}
.me-h h2{margin:22px 0 10px}
.me-h a{font-size:.9rem;font-weight:600;text-decoration:none}
.me-stickers{display:flex;flex-wrap:wrap;gap:10px 8px;padding:4px 2px 8px}
.me-chip{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:999px;font-size:.92rem;font-weight:500;background:color-mix(in srgb,var(--tint,var(--t-green)) 18%,var(--surface));box-shadow:0 1px 0 color-mix(in srgb,var(--tint,var(--t-green)) 30%,transparent)}
.me-chip b{font-weight:400}
.me-chip:nth-child(6n+1){--tint:var(--t-green);transform:rotate(-2deg)}
.me-chip:nth-child(6n+2){--tint:var(--t-lime);transform:rotate(1.5deg)}
.me-chip:nth-child(6n+3){--tint:var(--t-teal);transform:rotate(-1deg)}
.me-chip:nth-child(6n+4){--tint:var(--t-sky);transform:rotate(2deg)}
.me-chip:nth-child(6n+5){--tint:var(--t-mint);transform:rotate(-1.5deg)}
.me-chip:nth-child(6n){--tint:var(--t-sun);transform:rotate(1deg)}

.me-menu{background:var(--surface);border-radius:28px;padding:6px;margin:20px 0;box-shadow:var(--shadow)}
.me-row{display:flex;align-items:center;gap:14px;padding:12px 10px;border-radius:22px;text-decoration:none;color:var(--ink)}
.me-row+.me-row{margin-top:2px}
.me-row:hover,.me-row:focus-visible{background:var(--surface-2)}
.me-bubble{flex:none;display:grid;place-items:center;width:46px;height:46px;font-size:1.35rem;background:color-mix(in srgb,var(--tint) 22%,var(--surface));border-radius:55% 45% 50% 50%/50% 55% 45% 50%}
.me-row:nth-child(even) .me-bubble{border-radius:45% 55% 52% 48%/56% 46% 54% 44%}
.me-row-text{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.35}
.me-row-text small{color:var(--ink-3);font-size:.84rem}
.me-chev{font-size:1.5rem;color:var(--ink-3);line-height:1}

.me-lang{display:flex;gap:6px;padding:5px;margin:10px auto;border-radius:999px;background:var(--surface-2);width:max-content;max-width:100%}
.me-lang a{padding:8px 18px;border-radius:999px;text-decoration:none;color:var(--ink-2);font-weight:600;font-size:.92rem}
.me-lang a[aria-current]{background:var(--surface);color:var(--ink);box-shadow:var(--shadow)}

.me-foot{text-align:center;margin:18px 0 8px}
.me-out{margin-top:10px;background:none;border:none;font:inherit;font-weight:600;color:var(--err);padding:10px 18px;border-radius:999px;cursor:pointer}
.me-out:hover{background:var(--err-soft)}

@media (prefers-reduced-motion:reduce){.me-blob,.me-avatar,.me-wave{animation:none}}
`;
