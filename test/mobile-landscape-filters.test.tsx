/**
 * Owner card 5 (2026-10-27): landscape phones at 200% text. The chips row
 * folds behind the Filters button, which then shows how many filters are on
 * ("ตัวกรอง (2) / Filters (2)", or just "Filters"); the count is in its
 * accessible name too, and the Filters panel still holds the categories.
 * Normal text and portrait are unchanged.
 */
import { describe, expect, it } from "vitest";
import { tr } from "../src/lib/i18n";
import { FULLMAP_CSS, FULLMAP_JS, FullDiscover, filtersLabel, sheetCopy } from "../src/ui/discover-map";

const en = tr("en");
const th = tr("th");

const map = (t: typeof en, filterCount?: number) =>
  String(
    <FullDiscover
      t={t}
      lang={t === en ? "en" : "th"}
      points={[]}
      chips={[]}
      status={sheetCopy({ total: 0, week: 0, open: 0, filtered: !!filterCount }, t)}
      search=""
      filtered={!!filterCount}
      filterCount={filterCount}
      filters={
        <form class="ff">
          <select name="tag" />
        </form>
      }
      list={<p>list</p>}
      listHref="/?view=list"
      langHref="/lang/th"
      hasQuests={false}
    />,
  );

describe("the Filters label", () => {
  it("says the count, Thai first, or just Filters when none are on", () => {
    expect(filtersLabel(2, th)).toBe("ตัวกรอง (2)");
    expect(filtersLabel(2, en)).toBe("Filters (2)");
    expect(filtersLabel(1, en)).toBe("Filters (1)");
    expect(filtersLabel(0, en)).toBe("Filters");
    expect(filtersLabel(0, th)).toBe("ตัวกรอง");
  });

  it("puts the count in the button's accessible name and its text", () => {
    const two = map(en, 2);
    expect(two).toContain('<summary aria-label="Filters (2)">');
    expect(two).toContain('<span class="fd-filters-n"> (2)</span>');
    expect(map(th, 2)).toContain('<summary aria-label="ตัวกรอง (2)">');
    const none = map(en, 0);
    expect(none).toContain('<summary aria-label="Filters">');
    expect(none).not.toContain('class="fd-filters-n"');
  });

  it("still opens on the categories", () => {
    const html = map(en, 2);
    const panel = html.slice(html.indexOf('class="fd-filters-body"'));
    expect(panel).toContain('name="tag"');
  });
});

describe("the chips row at large text in landscape", () => {
  const rule = FULLMAP_CSS.slice(FULLMAP_CSS.indexOf("@container fdmap"));

  it("is a container query in rem on the map, landscape only", () => {
    expect(FULLMAP_CSS).toContain(".fullmap{container:fdmap/size}");
    expect(rule.startsWith("@container fdmap (orientation:landscape) and (height < 19rem){")).toBe(true);
  });

  it("folds the chips and the +N chip, and shows the Filters word and count instead of the dot", () => {
    const body = rule.slice(0, rule.indexOf("\n}") + 2);
    expect(body).toContain(".fullmap .svm-chips,.fullmap .fd-more{display:none}");
    expect(body).toContain(".fd-filters-word,.fd-filters-n{display:inline}");
    expect(body).toContain(".fd-filters>summary .fd-dot{display:none}");
  });

  it("leaves normal text and portrait alone: the count is hidden outside the query", () => {
    const before = FULLMAP_CSS.slice(0, FULLMAP_CSS.indexOf("@container fdmap"));
    expect(before).toContain(".fd-filters-n{display:none}");
    expect(before).not.toMatch(/\.svm-chips\{[^}]*display:none/);
    // 19rem is 304px at 100% text: shorter than any phone held sideways.
    expect(19 * 16).toBeLessThan(320);
    // At 150%, a 430px-tall phone (the tallest common one) is under 19rem.
    expect(430 / 24).toBeLessThan(19);
  });

  it("fits the pins under the header when the chips are folded", () => {
    expect(FULLMAP_JS).toContain('(isShown(chipsEl) ? chipsEl : document.querySelector(".fd-top"))');
  });
});
