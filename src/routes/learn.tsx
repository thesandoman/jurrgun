/**
 * Public FAQ and Learn pages (no login needed — sexual-health and safety
 * information should be reachable by anyone).
 */
import { Hono } from "hono";
import { FAQ, HELPLINES, LAST_CHECKED, REVIEW_NOTE, TOPICS, type Block, type Source, type Topic } from "../content/learn";
import type { AppEnv } from "../lib/env";
import { fmtDay, L, type Lang } from "../lib/i18n";
import { Card, Notice, page, view } from "../ui/kit";

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
      {TOPICS.map((topic) => (
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
    { title: t("คำถามที่พบบ่อย", "FAQ") },
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
    { title: t("เรียนรู้", "Learn") },
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

learnRoutes.get("/learn/:slug", (c) => {
  const { t, lang } = view(c);
  const topic: Topic | undefined = TOPICS.find((x) => x.slug === c.req.param("slug"));
  if (!topic) return c.json({ error: "Not found" }, 404);
  const others = TOPICS.filter((x) => x.slug !== topic.slug);
  return page(
    c,
    { title: L(lang, topic.title) },
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
