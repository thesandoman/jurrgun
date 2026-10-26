/**
 * One unread style everywhere (owner: clearer unread): a lime pill with dark
 * text, a count where there is one and "ใหม่ / New" on a row (the bell and the
 * My people tab show a plain dot instead, UnreadDot). It is the same on the
 * Chats chip, chat rows and notification rows, and it always carries words or
 * a number, never colour alone (1.4.1).
 *
 * The pill itself is hidden from screen readers where a count is involved:
 * the link's accessible name says it in full instead ("แชต ยังไม่ได้อ่าน 2 /
 * Chats, 2 unread").
 */
type T = (th: string, en: string) => string;

/** "แชต ยังไม่ได้อ่าน 2" / "Chats, 2 unread"; just the name when nothing is unread. */
export function unreadLabel(t: T, name: { th: string; en: string }, n: number): string {
  return n > 0 ? t(`${name.th} ยังไม่ได้อ่าน ${n}`, `${name.en}, ${n} unread`) : t(name.th, name.en);
}

/** The count pill (9+ past nine). Decorative: put the count in the link's label too. */
export function UnreadCount(props: { n: number; class?: string }) {
  if (props.n <= 0) return null;
  return (
    <span class={props.class ? `unread-badge ${props.class}` : "unread-badge"} aria-hidden="true">
      {props.n > 9 ? "9+" : props.n}
    </span>
  );
}

/**
 * A small dot instead of a number, for the bell and the My people tab (owner,
 * 2026-10-17: less pull to clear counters). Decorative: the link or button
 * keeps the full count in its accessible name (unreadLabel), and the dot is a
 * shape, so it never relies on colour alone.
 */
export function UnreadDot(props: { n: number; class?: string }) {
  if (props.n <= 0) return null;
  return <span class={props.class ? `unread-dot ${props.class}` : "unread-dot"} aria-hidden="true" />;
}

/** The "💬 แชต / Chats" shortcut: a dot when something is unread, the count in its name only (mobile card 5). */
export function ChatsLink(props: { t: T; n: number; class?: string }) {
  const { t, n } = props;
  return (
    <a href="/chat" class={props.class} aria-label={unreadLabel(t, { th: "แชต", en: "Chats" }, n)}>
      <span aria-hidden="true">💬</span> {t("แชต", "Chats")}
      <UnreadDot n={n} />
    </a>
  );
}

/** "ใหม่ / New" on an unread row: real text, so it is read out with the row. */
export function NewBadge(props: { t: T }) {
  return <b class="unread-badge unread-new">{props.t("ใหม่", "New")}</b>;
}
