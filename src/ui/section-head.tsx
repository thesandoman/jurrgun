/**
 * Two heading levels for member pages (finalize review A4):
 *
 *   <SectionHead title={t("สิ่งที่ฉันชอบ", "Things I love")} link={{ href: "/settings/profile#interests", label: t("แก้ไข", "Edit") }} />
 *   <SubLabel>{t("ออกไปเจอกัน", "Out and about")}</SubLabel>
 *
 * SectionHead is the one section title (Sao Chingcha, 20px) with an optional
 * link on the right; SubLabel is the small Anuphan label for a group inside a
 * section. The CSS lives in a11y-css.ts (.sec-head, .sub-label).
 */
import type { Child } from "hono/jsx";

export function SectionHead(props: { title: Child; id?: string; link?: { href: string; label: string }; class?: string }) {
  return (
    <div class={props.class ? `sec-head ${props.class}` : "sec-head"}>
      <h2 id={props.id}>{props.title}</h2>
      {props.link ? <a href={props.link.href}>{props.link.label}</a> : null}
    </div>
  );
}

export function SubLabel(props: { children: Child; id?: string }) {
  return (
    <h3 class="sub-label" id={props.id}>
      {props.children}
    </h3>
  );
}
