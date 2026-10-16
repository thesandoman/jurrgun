/**
 * Social links as a mutual connection sees them: one row per network, the
 * plain icon, the network's name and the handle ("@name"). The href is
 * always rebuilt from a fixed https template (src/content/social-links.ts),
 * and every link opens in a new tab with rel="noopener noreferrer nofollow".
 */
import type { T } from "../lib/i18n";
import { networkOf } from "../content/social-links";
import type { ShownLink } from "../services/profile-links";

const REL = "noopener noreferrer nofollow";

function LinkRow(props: { t: T; link: ShownLink; class: string }) {
  const n = networkOf(props.link.network)!;
  const name = props.t(n.th, n.en);
  return (
    <a class={props.class} href={props.link.href} rel={REL} target="_blank" aria-label={props.t(`${name}: ${props.link.text} (เปิดแท็บใหม่)`, `${name}: ${props.link.text} (opens in a new tab)`)}>
      <span aria-hidden="true">{n.icon}</span>
      <span class="plink-text">
        <small>{name}</small>
        <bdi>{props.link.text}</bdi>
      </span>
    </a>
  );
}

/** On their profile page, near where you've met. */
export function ProfileLinksCard(props: { t: T; name: string; links: ShownLink[] }) {
  const { t } = props;
  if (!props.links.length) return null;
  return (
    <section class="open-sec plinks" aria-labelledby="plinks-h">
      <h2 id="plinks-h" class="eyebrow">{t(`ลิงก์ของ ${props.name}`, `${props.name}'s links`)}</h2>
      <ul>
        {props.links.map((l) => (
          <li>
            <LinkRow t={t} link={l} class="plink" />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Inside the ⋯ Sheet on My people: the same rows, as sheet items. */
export function ProfileLinksSheet(props: { t: T; links: ShownLink[] }) {
  if (!props.links.length) return null;
  return (
    <div class="plinks-sheet" role="group" aria-label={props.t("ลิงก์โซเชียล", "Social links")}>
      {props.links.map((l) => (
        <LinkRow t={props.t} link={l} class="sheet-item plink" />
      ))}
    </div>
  );
}
