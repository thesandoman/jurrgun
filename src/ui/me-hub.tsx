/**
 * The "Me" tab hub: one left-aligned line on top (mobile card 6), the next
 * table, then tinted emoji bubbles, interests as scattered stickers, and one
 * rounded menu instead of a stack of cards. No number tiles: the counts live
 * on My month in people.
 *
 * Tints mix a hue into --surface, so the same rules work in dark mode.
 */
import type { Child } from "hono/jsx";
import { interestOpt } from "../content/profile";
import type { Lang } from "../lib/i18n";
import type { View } from "./kit";
import { SectionHead, SubLabel } from "./section-head";
import { AvatarStack } from "./visual";

export type MeStep = { done: boolean; label: string; href: string };
export type MeLink = { href: string; emoji: string; title: string; hint: string; tint: Tint; group?: string };
export type Tint = "green" | "lime" | "teal" | "mint" | "sky" | "sun";

/**
 * The one line at the top of Me (mobile card 6): "อารีย์ · อยู่กับเจอกันตั้งแต่ ต.ค. 2568 · โต๊ะประจำ 3 โต๊ะ" /
 * "Ari · With Jurrgun since Oct 2025 · 3 Regular Tables". The district comes first, by its display
 * name, and is left out when unset. Thai months are short and years Buddhist Era (the th-TH
 * calendar), in Bangkok time. No Regular Tables: the clause is left out, never a zero.
 */
export function meLine(lang: Lang, since: Date | null, tables: number, district?: string | null): string | null {
  const parts: string[] = [];
  if (district) parts.push(district);
  if (since) {
    const month = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "th-TH", { month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(since);
    parts.push(lang === "en" ? `With Jurrgun since ${month}` : `อยู่กับเจอกันตั้งแต่ ${month}`);
  }
  if (tables > 0) parts.push(lang === "en" ? `${tables} Regular ${tables === 1 ? "Table" : "Tables"}` : `โต๊ะประจำ ${tables} โต๊ะ`);
  return parts.length ? parts.join(" · ") : null;
}

export function MeHub(props: {
  v: View;
  nickname: string;
  /** The member's photo, or null for the coloured initial. Decorative: the greeting beside it has the name. */
  photo: string | null;
  /** The member's account id, which seeds the initial's colour as on My people and Chats. */
  seed: string;
  /** meLine(): the district, since when, and how many Regular Tables. The counts live on My month in people. */
  line: string | null;
  interests: string[];
  /** The next table, or a way to find one. */
  next?: Child;
  steps: MeStep[];
  type: Child;
  badge?: Child;
  /** A one-time question (e.g. "Still new to Bangkok?"). It takes the one prompt slot ahead of the profile nudge. */
  ask?: Child;
  /** The link beside the type section's heading. */
  typeLink?: { href: string; label: string };
  links: MeLink[];
  /** One-tap switches shown above the menu. */
  quick?: Child;
}) {
  const { t, lang } = props.v;
  const done = props.steps.filter((s) => s.done).length;
  const pct = props.steps.length ? Math.round((done / props.steps.length) * 100) : 100;
  const todo = props.steps.filter((s) => !s.done).slice(0, 3);
  return (
    <div class="me">
      <style dangerouslySetInnerHTML={{ __html: ME_CSS }} />

      {/* Mobile card 6: no centred hero and no number tiles. One left-aligned line, then the next table;
          the counts moved to My month in people (/me/month). */}
      <header class="me-head">
        {/* Decorative: the greeting beside it says the name. The same 40px avatar as Chats and My people. */}
        {props.photo ? (
          <img class="me-av" src={props.photo} alt="" width={40} height={40} />
        ) : (
          <span class="me-av" aria-hidden="true">
            <AvatarStack items={[{ label: props.nickname, seed: props.seed }]} size={40} />
          </span>
        )}
        <h1 class="me-hi">{t(`หวัดดี ${props.nickname}`, `Hey ${props.nickname}`)}</h1>
        {/* Each clause stays whole on a narrow phone ("โต๊ะประจำ 2 โต๊ะ" never splits), yet can still wrap at large text. */}
        {props.line ? (
          <p class="me-line">
            {props.line.split(" · ").map((part, i) => (
              <>
                {i ? " · " : ""}
                <span>{part}</span>
              </>
            ))}
          </p>
        ) : null}
      </header>
      {props.next ?? null}
      <a href="/me/profile" class="me-peek">
        <span aria-hidden="true">👀</span> {t("ดูโปรไฟล์แบบที่คนอื่นเห็น", "See my profile as others do")}
      </a>

      {/* One next-step slot (owner, C1): the most urgent ask only. The one-time question first, then what the profile is missing. */}
      {props.ask ? (
        props.ask
      ) : pct < 100 ? (
        <section class="me-grow">
          <div class="me-grow-head">
            {/* What's left, in words: no percentage meter (owner, Phase 2). */}
            <strong>{t(`ช่วยให้โต๊ะรู้จักคุณ เหลืออีก ${props.steps.length - done} เรื่อง`, `Help your table get to know you: ${props.steps.length - done} ${props.steps.length - done === 1 ? "thing" : "things"} left`)}</strong>
            <span aria-hidden="true">🌿</span>
          </div>
          <p class="muted">{t("ช่วยให้เราจัดโต๊ะที่มีเรื่องคุยกัน", "Helps us seat you with common ground.")}</p>
          <div class="me-todo">
            {todo.map((s) => (
              <a href={s.href}>+ {s.label}</a>
            ))}
          </div>
        </section>
      ) : null}

      <section class="me-type" aria-labelledby="me-type-h">
        <SectionHead id="me-type-h" title={t("ไทป์กรุงเทพฯ ของคุณ", "Your Bangkok Type")} link={props.typeLink} />
        {props.type}
      </section>

      {props.interests.length ? (
        <section class="me-loves">
          <SectionHead title={t("สิ่งที่ฉันชอบ", "Things I love")} link={{ href: "/settings/profile#interests", label: t("แก้ไข", "Edit") }} />
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

      <SectionHead title={t("ตั้งค่าและอื่น ๆ", "Settings and more")} />

      {props.quick}

      {[...new Set(props.links.map((l) => l.group ?? ""))].map((g) => (
      <>
      {g ? <SubLabel>{g}</SubLabel> : null}
      <nav class="me-menu" aria-label={g || t("ตั้งค่า", "Settings")}>
        {/* One grouped list per group, rows split by hairlines (owner, 2026-10-16). */}
        <ul class="glist me-list">
          {props.links.filter((l) => (l.group ?? "") === g).map((l) => (
            <li>
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
            </li>
          ))}
        </ul>
      </nav>
      </>
      ))}

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
.me{--t-green:var(--fresh);--t-sky:var(--cat-sky-2);--t-sun:var(--cat-teal-2)}
.me .tint-green{--tint:var(--t-green)}.me .tint-sun{--tint:var(--t-sun)}.me .tint-lime{--tint:var(--t-green)}
.me .tint-sky{--tint:var(--t-sky)}.me .tint-teal{--tint:var(--t-sky)}.me .tint-mint{--tint:var(--t-green)}

/* Mobile card 6: the top of Me is left-aligned text, no hero. */
.me-head{margin:8px 0 12px;text-align:start}
.me-hi{font-size:1.6rem;font-weight:800;letter-spacing:-.02em;margin:0 0 4px}
.me-line{margin:0;color:var(--ink-2);font-size:.95rem;line-height:1.5}
.me-line>span{display:inline-block}
.me-peek{display:inline-flex;align-items:center;gap:6px;min-height:44px;margin:4px 0 0;font-weight:600;font-size:.92rem;text-decoration:none}

.me-grow{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px;margin:16px 0}
.me-grow-head{display:flex;justify-content:space-between;align-items:center;gap:10px}
.me-grow-head span{font-size:1.4rem}
.me-bar{height:12px;border-radius:999px;background:var(--surface-2);overflow:hidden;margin:10px 0 6px}
.me-bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--t-green),var(--t-sun),var(--t-sky))}
.me-grow .muted{margin:0 0 10px}
.me-todo{display:flex;flex-wrap:wrap;gap:8px}
.me-todo a{padding:7px 13px;border-radius:999px;font-size:.88rem;font-weight:600;text-decoration:none;background:var(--brand-soft);color:var(--brand)}

.me-type{margin:18px 0}
.me-type .teaser{display:flex;width:100%;box-sizing:border-box;margin:0;border-radius:0;padding:4px 0;background:none;border:0;box-shadow:none}

.me-h{display:flex;justify-content:space-between;align-items:baseline}
.me-h h2{margin:22px 0 10px}
.me-h a{font-size:.9rem;font-weight:600;text-decoration:none}
.me-stickers{display:flex;flex-wrap:wrap;gap:10px 8px;padding:4px 2px 8px}
.me-chip{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:999px;font-size:.92rem;font-weight:500;background:color-mix(in srgb,var(--tint,var(--t-green)) 18%,var(--surface));box-shadow:0 1px 0 color-mix(in srgb,var(--tint,var(--t-green)) 30%,transparent)}
.me-chip b{font-weight:400}
.me-chip:nth-child(6n+1){--tint:var(--t-green);transform:rotate(-2deg)}
.me-chip:nth-child(6n+2){--tint:var(--t-sun);transform:rotate(1.5deg)}
.me-chip:nth-child(6n+3){--tint:var(--t-sky);transform:rotate(-1deg)}
.me-chip:nth-child(6n+4){--tint:var(--t-green);transform:rotate(2deg)}
.me-chip:nth-child(6n+5){--tint:var(--t-sun);transform:rotate(-1.5deg)}
.me-chip:nth-child(6n){--tint:var(--t-sky);transform:rotate(1deg)}

.me-menu{margin:0 0 16px}
.me-menu>.glist{margin:0;--glist-inset:64px}
.me-row{display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 16px;text-decoration:none;color:var(--ink)}
.me-bubble{flex:none;display:grid;place-items:center;width:36px;height:36px;font-size:1.1rem;background:color-mix(in srgb,var(--tint) 22%,var(--surface));border-radius:50%}
.me-row-text{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.3}
.me-row-text small{color:var(--ink-2);font-size:.82rem}
.me-chev{font-size:1.5rem;color:var(--ink-3);line-height:1}

.me-lang{display:flex;gap:6px;padding:5px;margin:10px auto;border-radius:999px;background:var(--surface-2);width:max-content;max-width:100%}
.me-lang a{padding:8px 18px;border-radius:999px;text-decoration:none;color:var(--ink-2);font-weight:600;font-size:.92rem}
.me-lang a[aria-current]{background:var(--sel);color:var(--sel-ink);box-shadow:none}

.me-foot{text-align:center;margin:18px 0 8px}
.me-out{margin-top:10px;background:none;border:none;font:inherit;font-weight:600;color:var(--err);padding:10px 18px;border-radius:999px;cursor:pointer}
.me-out:hover{background:var(--err-soft)}

`;
