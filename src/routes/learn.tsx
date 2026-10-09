/**
 * Public FAQ and Learn pages (no login needed — sexual-health and safety
 * information should be reachable by anyone).
 */
import { Hono } from "hono";
import { FAQ, HELPLINES, LAST_CHECKED, LEARN_CARDS, REVIEW_NOTE, TOPICS, TYPES_CARD, type Block, type Source, type Topic } from "../content/learn";
import type { AppEnv } from "../lib/env";
import { fmtDay, L, type Lang } from "../lib/i18n";
import { Card, Notice, page, view } from "../ui/kit";
import { ARCHETYPES, ARCHETYPE_KEYS, MATCH_LABELS } from "../vibe/archetypes";
import { CodeChips, Legend, typeSlug } from "./quiz";

export const learnRoutes = new Hono<AppEnv>();

/** FAQ accordion. `limit` shows the first N (home page); the /faq page shows all. */
export function FaqList(props: { lang: Lang; limit?: number }) {
  const items = props.limit ? FAQ.slice(0, props.limit) : FAQ;
  return (
    <div class="faq">
      {items.map((f) => (
        <details>
          <summary>{L(props.lang, f.q)}</summary>
          <p>{L(props.lang, f.a)}</p>
        </details>
      ))}
    </div>
  );
}

export function LearnCards(props: { lang: Lang }) {
  return (
    <div class="grid2">
      {LEARN_CARDS.map((topic) => (
        <Card href={`/learn/${topic.slug}`}>
          <h3>
            <span aria-hidden="true">{topic.icon}</span> {L(props.lang, topic.title)}
          </h3>
          <p class="muted">{L(props.lang, topic.summary)}</p>
        </Card>
      ))}
    </div>
  );
}

function Helplines(props: { lang: Lang }) {
  const { lang } = props;
  return (
    <Card>
      <h2 style="margin-top:0">{lang === "en" ? "Helplines (Thailand)" : "สายด่วนช่วยเหลือ"}</h2>
      <ul class="helplines">
        {HELPLINES.map((h) => (
          <li>
            <a href={`tel:${h.number}`} class="hotline">{h.number}</a>
            <span>
              <strong>{L(lang, h.name)}</strong>
              <small>
                {L(lang, h.when)} · {L(lang, h.hours)} ·{" "}
                <a href={h.source} target="_blank" rel="noopener noreferrer">
                  {lang === "en" ? "source" : "แหล่งที่มา"}
                </a>
              </small>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Sources(props: { sources: Source[]; lang: Lang }) {
  const { lang } = props;
  return (
    <section class="sources">
      <h2>{lang === "en" ? "Sources" : "แหล่งที่มา"}</h2>
      <ol>
        {props.sources.map((s) => (
          <li>
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              {s.label}
            </a>
          </li>
        ))}
      </ol>
      <small>
        {lang === "en" ? "Facts and numbers last checked " : "ตรวจสอบข้อมูลและหมายเลขล่าสุด "}
        {fmtDay(`${LAST_CHECKED}T12:00:00+07:00`, lang)}
      </small>
    </section>
  );
}

function BlockView(props: { block: Block; lang: Lang }) {
  const { block, lang } = props;
  if (block.kind === "p") return <p>{L(lang, block.text)}</p>;
  if (block.kind === "tip") return <Notice kind="info">💡 {L(lang, block.text)}</Notice>;
  return <ul>{block.items.map((i) => <li>{L(lang, i)}</li>)}</ul>;
}

learnRoutes.get("/faq", (c) => {
  const { t, lang } = view(c);
  return page(
    c,
    { title: t("คำถามที่พบบ่อย", "FAQ"), tab: "learn" },
    <>
      <h1>{t("คำถามที่พบบ่อย", "Frequently asked questions")}</h1>
      <FaqList lang={lang} />
      <p style="margin-top:16px">
        <a href="/learn">{t("อ่านเพิ่มเติม: เรียนรู้เรื่องการเดตและความปลอดภัย →", "Read more: learn about dating and safety →")}</a>
      </p>
    </>,
  );
});

learnRoutes.get("/learn", (c) => {
  const { t, lang } = view(c);
  return page(
    c,
    { title: t("เรียนรู้", "Learn"), tab: "learn" },
    <>
      <h1>{t("เรียนรู้", "Learn")}</h1>
      <p class="muted">
        {t(
          "เรื่องที่ควรรู้ก่อนออกไปเจอคนใหม่ — เขียนให้ทุกเพศ ทุกความหลากหลาย อ่านได้โดยไม่ต้องเข้าสู่ระบบ",
          "Things worth knowing before you meet new people — written for every gender and orientation, no login needed.",
        )}
      </p>
      <LearnCards lang={lang} />
      <Helplines lang={lang} />
      <p class="muted">{L(lang, REVIEW_NOTE)}</p>
    </>,
  );
});

learnRoutes.get("/learn/bangkok-types", (c) => {
  const { t, lang } = view(c);
  return page(
    c,
    { title: L(lang, TYPES_CARD.title), tab: "learn" },
    <article class="learn">
      <p>
        <a href="/learn">← {t("เรียนรู้", "Learn")}</a>
      </p>
      <h1>
        <span aria-hidden="true">{TYPES_CARD.icon}</span> {L(lang, TYPES_CARD.title)}
      </h1>
      <p class="muted">
        {t(
          "แบบทดสอบ Bangkok Vibe ดูว่าคุณชอบใช้เวลาในเมืองแบบไหน 6 ด้าน ไม่มีเรื่องการเมือง ตัวอักษร 4 ตัวคือไทป์ของคุณ อีก 2 ด้านเป็นสัญลักษณ์เพิ่มเติม ทั้ง 6 ด้านช่วยจัดโต๊ะให้เข้ากับคุณ",
          "The Bangkok Vibe quiz looks at six sides of how you like to spend time in the city, nothing political. Four of them make your 4-letter type; the other two add a flavour badge. All six help seat you at the right table.",
        )}
      </p>
      <Legend lang={lang} />
      <h2>{t("ทั้ง 16 ไทป์", "All 16 types")}</h2>
      <div class="type-grid">
        {ARCHETYPE_KEYS.map((k) => (
          <a href={`/types/${typeSlug(k)}`}>
            <b aria-hidden="true">{ARCHETYPES[k].emoji}</b>
            <strong>{L(lang, ARCHETYPES[k].name)}</strong>
            <CodeChips lang={lang} archetype={k} />
            <small class="muted">{L(lang, ARCHETYPES[k].description)}</small>
          </a>
        ))}
      </div>
      <h2>{t("คู่ที่เข้ากัน", "How types meet")}</h2>
      <ul>
        {(["natural", "complementary", "interesting"] as const).map((m) => (
          <li>
            {MATCH_LABELS[m].emoji} <strong>{L(lang, MATCH_LABELS[m].name)}</strong>: {L(lang, MATCH_LABELS[m].copy)}
          </li>
        ))}
      </ul>
      <Notice kind="info">
        💡{" "}
        {t(
          "ไทป์เป็นเรื่องสนุกไว้ชวนคุย ไม่มีไทป์ไหนดีกว่ากัน และไม่ใช้ซ่อนหรือคัดใครออก ไทป์ของคุณเป็นความลับจนกว่าคุณจะเลือกแสดง",
          "Types are for fun and conversation. No type is better, and they're never used to hide or exclude anyone. Yours stays private unless you choose to show it.",
        )}
      </Notice>
      <p>
        <a href="/quiz">{t("ทำแบบทดสอบ →", "Take the quiz →")}</a>
      </p>
    </article>,
  );
});

learnRoutes.get("/learn/:slug", (c) => {
  const { t, lang } = view(c);
  const topic: Topic | undefined = TOPICS.find((x) => x.slug === c.req.param("slug"));
  if (!topic) return c.json({ error: "Not found" }, 404);
  const others = TOPICS.filter((x) => x.slug !== topic.slug);
  return page(
    c,
    { title: L(lang, topic.title), tab: "learn" },
    <article class="learn">
      <p>
        <a href="/learn">← {t("เรียนรู้", "Learn")}</a>
      </p>
      <h1>
        <span aria-hidden="true">{topic.icon}</span> {L(lang, topic.title)}
      </h1>
      <p class="muted">{L(lang, topic.summary)}</p>
      {topic.sections.map((s) => (
        <section>
          <h2>{L(lang, s.heading)}</h2>
          {s.blocks.map((b) => (
            <BlockView block={b} lang={lang} />
          ))}
        </section>
      ))}
      <Helplines lang={lang} />
      <Sources sources={topic.sources} lang={lang} />
      <p class="muted">{L(lang, REVIEW_NOTE)}</p>
      <h2>{t("หัวข้ออื่น", "More topics")}</h2>
      <ul>
        {others.map((o) => (
          <li>
            <a href={`/learn/${o.slug}`}>{L(lang, o.title)}</a>
          </li>
        ))}
      </ul>
    </article>,
  );
});
