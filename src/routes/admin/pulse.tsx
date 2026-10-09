/**
 * City Pulse survey manager (/admin/pulse) — BMA admins only (PRD §13.3).
 *
 *   GET  /                 questions with response counts
 *   GET  /new, POST /new   create
 *   GET  /:id/edit, POST   edit (+ mobile card preview)
 *   POST /:id/status       quick activate / pause / archive
 *   GET  /:id/results      aggregated results, k ≥ 10 on every cell (PRD §12.5)
 *   GET  /:id/export.csv   the same aggregates as CSV
 *
 * Results are computed in SQL from research_pulse_responses and never joined
 * to accounts; research ids are never selected. Free-text answers are only
 * ever counted, never shown.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { batch, getDb } from "../../db";
import { safeCount } from "../../domain/rules";
import { DISTRICTS, label } from "../../lib/constants";
import { newId } from "../../lib/crypto";
import type { AppEnv } from "../../lib/env";
import { fmtDate, type Lang, type T } from "../../lib/i18n";
import { audit } from "../../lib/records";
import { requireRole } from "../../lib/session";
import { pulseQuestions, pulseResponses } from "../../schema";
import { Button, Card, Choices, Empty, Field, int, LinkButton, list, Notice, page, Select, str, Tag, TextArea, view } from "../../ui/kit";

export const adminPulse = new Hono<AppEnv>();
adminPulse.use("*", requireRole("bma_admin"));

type Question = typeof pulseQuestions.$inferSelect;
type Opt = { value: string; th: string; en: string };

export const AGE_BANDS = ["18-24", "25-29", "30-34", "35-44", "45-59", "60+"] as const;
const AGE_OPTS: Opt[] = AGE_BANDS.map((b) => ({ value: b, th: b, en: b }));
const KINDS: Opt[] = [
  { value: "single", th: "เลือกได้ 1 ข้อ", en: "Single choice" },
  { value: "multi", th: "เลือกได้หลายข้อ", en: "Multiple choice" },
  { value: "scale", th: "มาตรวัด 1–5", en: "Scale 1–5" },
  { value: "text", th: "ข้อความสั้น", en: "Short text" },
  { value: "area", th: "เลือกพื้นที่ (เขต)", en: "Area (district)" },
];
const STATUSES: Opt[] = [
  { value: "draft", th: "ฉบับร่าง", en: "Draft" },
  { value: "active", th: "เปิดใช้งาน", en: "Active" },
  { value: "paused", th: "หยุดชั่วคราว", en: "Paused" },
  { value: "archived", th: "เก็บถาวร", en: "Archived" },
];
const VALUE_RE = /^[a-z0-9_]{1,40}$/;
const SCALE: Opt[] = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), th: String(n), en: String(n) }));

const opt = (list: Opt[], v: string, lang: Lang) => label(list, v, lang);

// ------------------------------------------------------------- helpers --

/** Date → "YYYY-MM-DDTHH:mm" in Bangkok time (UTC+7, no DST). */
export function toBkkInput(d: Date | null): string {
  if (!d) return "";
  return new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 16);
}

/** "YYYY-MM-DDTHH:mm" as Bangkok time → Date; "" → null; bad → undefined. */
export function fromBkkInput(s: string): Date | null | undefined {
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}:00+07:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** "value|ไทย|English" per line. */
export function parseOptions(text: string): { options: Opt[] } | { error: [string, string] } {
  const options: Opt[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length !== 3 || !parts[1] || !parts[2]) {
      return { error: [`รูปแบบตัวเลือกไม่ถูกต้อง: "${line}"`, `Bad option line: "${line}"`] };
    }
    const [value, th, en] = parts;
    if (!VALUE_RE.test(value)) {
      return { error: [`ค่า "${value}" ต้องเป็น a-z 0-9 _ ไม่เกิน 40 ตัว`, `Value "${value}" must be a-z, 0-9 or _ (max 40)`] };
    }
    if (seen.has(value)) return { error: [`ค่า "${value}" ซ้ำ`, `Duplicate value "${value}"`] };
    if (th.length > 200 || en.length > 200) return { error: ["ข้อความตัวเลือกยาวเกินไป", "Option text is too long"] };
    seen.add(value);
    options.push({ value, th, en });
  }
  if (options.length > 30) return { error: ["ตัวเลือกได้ไม่เกิน 30 ข้อ", "At most 30 options"] };
  return { options };
}

function optionsText(options: Opt[]): string {
  return options.map((o) => `${o.value}|${o.th}|${o.en}`).join("\n");
}

/** The answer choices a question's results are counted against. */
function answerOptions(q: Pick<Question, "kind" | "options">): Opt[] {
  if (q.kind === "scale") return SCALE;
  if (q.kind === "area") return q.options.length ? q.options : DISTRICTS;
  if (q.kind === "text") return [];
  return q.options;
}

type FormValues = {
  promptTh: string;
  promptEn: string;
  kind: string;
  options: string;
  districts: string[];
  ageBands: string[];
  activeFrom: string;
  activeTo: string;
  sortOrder: string;
  status: string;
};

function valuesOf(q: Question | null): FormValues {
  return {
    promptTh: q?.promptTh ?? "",
    promptEn: q?.promptEn ?? "",
    kind: q?.kind ?? "single",
    options: q ? optionsText(q.options) : "",
    districts: q?.segment.districts ?? [],
    ageBands: q?.segment.ageBands ?? [],
    activeFrom: toBkkInput(q?.activeFrom ?? null),
    activeTo: toBkkInput(q?.activeTo ?? null),
    sortOrder: String(q?.sortOrder ?? 0),
    status: q?.status ?? "draft",
  };
}

type Parsed = {
  promptTh: string;
  promptEn: string;
  kind: string;
  options: Opt[];
  segment: { districts?: string[]; ageBands?: string[] };
  activeFrom: Date | null;
  activeTo: Date | null;
  sortOrder: number;
  status: string;
};

function validate(body: Record<string, unknown>): { values: FormValues; data?: Parsed; error?: [string, string] } {
  const values: FormValues = {
    promptTh: str(body.promptTh),
    promptEn: str(body.promptEn),
    kind: str(body.kind),
    options: typeof body.options === "string" ? body.options : str(body.options),
    districts: list(body.districts),
    ageBands: list(body.ageBands),
    activeFrom: str(body.activeFrom),
    activeTo: str(body.activeTo),
    sortOrder: str(body.sortOrder) || "0",
    status: str(body.status) || "draft",
  };
  const fail = (th: string, en: string) => ({ values, error: [th, en] as [string, string] });
  if (!values.promptTh || !values.promptEn) return fail("กรุณากรอกคำถามทั้งภาษาไทยและอังกฤษ", "Enter the question in Thai and English");
  if (values.promptTh.length > 300 || values.promptEn.length > 300) return fail("คำถามยาวได้ไม่เกิน 300 ตัวอักษร", "Questions are limited to 300 characters");
  if (!KINDS.some((k) => k.value === values.kind)) return fail("เลือกประเภทคำตอบ", "Choose an answer type");
  if (!STATUSES.some((s) => s.value === values.status)) return fail("สถานะไม่ถูกต้อง", "Unknown status");

  let options: Opt[] = [];
  if (values.kind === "single" || values.kind === "multi" || values.kind === "area") {
    const p = parseOptions(values.options);
    if ("error" in p) return { values, error: p.error };
    options = p.options;
    if (values.kind !== "area" && options.length < 2) {
      return fail("คำถามแบบเลือกตอบต้องมีอย่างน้อย 2 ตัวเลือก", "Choice questions need at least 2 options");
    }
  }
  const allDistricts = new Set(DISTRICTS.map((d) => d.value));
  if (values.districts.some((d) => !allDistricts.has(d))) return fail("เขตไม่ถูกต้อง", "Unknown district");
  if (values.ageBands.some((b) => !(AGE_BANDS as readonly string[]).includes(b))) return fail("ช่วงอายุไม่ถูกต้อง", "Unknown age band");

  const activeFrom = fromBkkInput(values.activeFrom);
  const activeTo = fromBkkInput(values.activeTo);
  if (activeFrom === undefined || activeTo === undefined) return fail("วันเวลาไม่ถูกต้อง", "Invalid date/time");
  if (activeFrom && activeTo && activeTo.getTime() <= activeFrom.getTime()) {
    return fail("วันสิ้นสุดต้องหลังวันเริ่ม", "The end must be after the start");
  }
  const sortOrder = int(values.sortOrder, NaN);
  if (!Number.isFinite(sortOrder) || Math.abs(sortOrder) > 100_000) return fail("ลำดับต้องเป็นจำนวนเต็ม", "Sort order must be a whole number");

  const segment: Parsed["segment"] = {};
  if (values.districts.length) segment.districts = values.districts;
  if (values.ageBands.length) segment.ageBands = values.ageBands;
  return {
    values,
    data: { promptTh: values.promptTh, promptEn: values.promptEn, kind: values.kind, options, segment, activeFrom, activeTo, sortOrder, status: values.status },
  };
}

// ------------------------------------------------------------ components --

/** What members will see on their phone (static, not submittable). */
function PreviewCard(props: { q: Pick<Question, "promptTh" | "promptEn" | "kind" | "options">; lang: Lang; t: T }) {
  const { q, lang, t } = props;
  const opts = q.kind === "area" ? answerOptions(q).slice(0, 12) : answerOptions(q);
  return (
    <div style="max-width:360px;border:8px solid var(--line);border-radius:28px;padding:10px;background:var(--bg)">
      <Card>
        <Tag tone="accent">City Pulse</Tag>
        <h3 style="margin-top:8px">{lang === "en" ? q.promptEn : q.promptTh}</h3>
        {q.kind === "text" ? (
          <textarea rows={3} disabled aria-label={t("คำตอบ", "Answer")} placeholder={t("พิมพ์คำตอบสั้น ๆ", "A short answer")} />
        ) : q.kind === "scale" ? (
          <div class="pills">
            {SCALE.map((o) => (
              <span class="pill">
                <span>{o.value}</span>
              </span>
            ))}
          </div>
        ) : (
          <div class="pills">
            {opts.map((o) => (
              <span class="pill">
                <span>{lang === "en" ? o.en : o.th}</span>
              </span>
            ))}
            {q.kind === "area" && answerOptions(q).length > opts.length ? <small>…</small> : null}
          </div>
        )}
        <p class="muted" style="margin-top:10px">
          {t("คำตอบไม่ระบุตัวตน และแสดงผลเป็นภาพรวมเท่านั้น", "Answers are anonymous and only shown in aggregate.")}
        </p>
      </Card>
    </div>
  );
}

function QuestionForm(props: { action: string; values: FormValues; lang: Lang; t: T }) {
  const { values: v, lang, t } = props;
  return (
    <form method="post" action={props.action}>
      <TextArea label={t("คำถาม (ไทย)", "Question (Thai)")} name="promptTh" value={v.promptTh} required maxlength={300} rows={2} />
      <TextArea label={t("คำถาม (อังกฤษ)", "Question (English)")} name="promptEn" value={v.promptEn} required maxlength={300} rows={2} />
      <Select label={t("ประเภทคำตอบ", "Answer type")} name="kind" options={KINDS} value={v.kind} lang={lang} required />
      <TextArea
        label={t("ตัวเลือก", "Options")}
        name="options"
        value={v.options}
        rows={6}
        hint={t(
          "บรรทัดละ 1 ตัวเลือก: value|ไทย|English (value ใช้ a-z 0-9 _) จำเป็นสำหรับแบบเลือกตอบ ส่วนแบบพื้นที่ถ้าเว้นว่างจะใช้รายชื่อเขตทั้งหมด",
          "One per line: value|ไทย|English (value is a-z, 0-9, _). Required for single/multi choice; for area, leave empty to use every district.",
        )}
      />
      <Choices legend={t("กลุ่มเป้าหมาย: เขต (ว่าง = ทุกเขต)", "Target districts (none = everyone)")} name="districts" options={DISTRICTS} values={v.districts} lang={lang} />
      <Choices legend={t("กลุ่มเป้าหมาย: ช่วงอายุ (ว่าง = ทุกวัย)", "Target age bands (none = everyone)")} name="ageBands" options={AGE_OPTS} values={v.ageBands} lang={lang} />
      <div class="grid2">
        <Field label={t("เริ่ม (เวลากรุงเทพฯ)", "Active from (Bangkok time)")} name="activeFrom" type="datetime-local" value={v.activeFrom} />
        <Field label={t("สิ้นสุด (เวลากรุงเทพฯ)", "Active to (Bangkok time)")} name="activeTo" type="datetime-local" value={v.activeTo} />
        <Field label={t("ลำดับการแสดง", "Sort order")} name="sortOrder" type="number" value={v.sortOrder} />
        <Select label={t("สถานะ", "Status")} name="status" options={STATUSES} value={v.status} lang={lang} />
      </div>
      <Button>{t("บันทึก", "Save")}</Button>
    </form>
  );
}

// ----------------------------------------------------------------- list --

adminPulse.get("/", async (c) => {
  const { t, lang } = view(c);
  const db = getDb(c.env);
  const qs = await db
    .select()
    .from(pulseQuestions)
    .orderBy(sql`case ${pulseQuestions.status} when 'active' then 0 when 'paused' then 1 when 'draft' then 2 else 3 end`, asc(pulseQuestions.sortOrder))
    .limit(200);
  const counts = qs.length
    ? await db
        .select({ q: pulseResponses.questionId, n: sql<number>`count(*)`.mapWith(Number) })
        .from(pulseResponses)
        .where(inArray(pulseResponses.questionId, qs.map((q) => q.id)))
        .groupBy(pulseResponses.questionId)
        .limit(200)
    : [];
  const countOf = new Map(counts.map((r) => [r.q, r.n]));

  return page(
    c,
    { title: "City Pulse", admin: true },
    <>
      <div class="spread">
        <h1>{t("จัดการคำถาม City Pulse", "City Pulse questions")}</h1>
        <LinkButton href="/admin/pulse/new">{t("+ คำถามใหม่", "+ New question")}</LinkButton>
      </div>
      <p class="muted">{t("จำนวนคำตอบที่น้อยกว่า 10 จะแสดงเป็น \"<10\"", "Response counts under 10 are shown as \"<10\".")}</p>
      {qs.length === 0 ? (
        <Empty>{t("ยังไม่มีคำถาม", "No questions yet")}</Empty>
      ) : (
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("คำถาม", "Question")}</th>
                <th>{t("ประเภท", "Type")}</th>
                <th>{t("สถานะ", "Status")}</th>
                <th>{t("ช่วงเวลา", "Window")}</th>
                <th>{t("คำตอบ", "Responses")}</th>
                <th>{t("จัดการ", "Manage")}</th>
              </tr>
            </thead>
            <tbody>
              {qs.map((q) => {
                const n = safeCount(countOf.get(q.id) ?? 0);
                return (
                  <tr>
                    <td>
                      <a href={`/admin/pulse/${encodeURIComponent(q.id)}/edit`}>{lang === "en" ? q.promptEn : q.promptTh}</a>
                    </td>
                    <td>{opt(KINDS, q.kind, lang)}</td>
                    <td>
                      <Tag tone={q.status === "active" ? "ok" : q.status === "archived" ? "muted" : undefined}>{opt(STATUSES, q.status, lang)}</Tag>
                    </td>
                    <td>
                      <small>
                        {q.activeFrom ? fmtDate(q.activeFrom, lang) : "—"} → {q.activeTo ? fmtDate(q.activeTo, lang) : "—"}
                      </small>
                    </td>
                    <td>{n === null ? "<10" : n}</td>
                    <td>
                      <div class="row">
                        <a href={`/admin/pulse/${encodeURIComponent(q.id)}/results`}>{t("ผลลัพธ์", "Results")}</a>
                        <StatusButtons q={q} t={t} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>,
  );
});

function StatusButtons(props: { q: Question; t: T }) {
  const { q, t } = props;
  const btn = (status: string, text: string) => (
    <form method="post" action={`/admin/pulse/${encodeURIComponent(q.id)}/status`} style="display:inline">
      <input type="hidden" name="status" value={status} />
      <button type="submit" class="chip">{text}</button>
    </form>
  );
  return (
    <>
      {q.status !== "active" && q.status !== "archived" ? btn("active", t("เปิดใช้", "Activate")) : null}
      {q.status === "active" ? btn("paused", t("หยุด", "Pause")) : null}
      {q.status !== "archived" ? btn("archived", t("เก็บถาวร", "Archive")) : null}
    </>
  );
}

// ------------------------------------------------------------ create/edit --

function renderForm(c: Context<AppEnv>, opts: { q: Question | null; values: FormValues; error?: [string, string]; status?: 200 | 400 }) {
  const { t, lang } = view(c);
  const q = opts.q;
  return page(
    c,
    { title: q ? t("แก้ไขคำถาม", "Edit question") : t("คำถามใหม่", "New question"), admin: true, status: opts.status },
    <>
      <p>
        <a href="/admin/pulse">← City Pulse</a>
      </p>
      <h1>{q ? t("แก้ไขคำถาม", "Edit question") : t("คำถามใหม่", "New question")}</h1>
      {opts.error ? <Notice kind="error">{t(opts.error[0], opts.error[1])}</Notice> : null}
      <div class="grid2" style="align-items:start">
        <Card>
          <QuestionForm action={q ? `/admin/pulse/${encodeURIComponent(q.id)}/edit` : "/admin/pulse/new"} values={opts.values} lang={lang} t={t} />
        </Card>
        <section>
          <h2 style="margin-top:0">{t("ตัวอย่างการ์ดบนมือถือ", "Preview mobile card")}</h2>
          {q ? (
            <>
              <PreviewCard q={q} lang={lang} t={t} />
              <div class="row" style="margin-top:10px">
                <StatusButtons q={q} t={t} />
                <a href={`/admin/pulse/${encodeURIComponent(q.id)}/results`}>{t("ดูผลลัพธ์", "View results")}</a>
              </div>
            </>
          ) : (
            <p class="muted">{t("บันทึกเป็นฉบับร่างก่อน แล้วตัวอย่างจะแสดงที่นี่", "Save as a draft first; the preview appears here.")}</p>
          )}
        </section>
      </div>
    </>,
  );
}

adminPulse.get("/new", (c) => renderForm(c, { q: null, values: valuesOf(null) }));

adminPulse.post("/new", async (c) => {
  const body = await c.req.parseBody({ all: true });
  const res = validate(body);
  if (!res.data) return renderForm(c, { q: null, values: res.values, error: res.error, status: 400 });
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const id = newId();
  await batch(c.env, [
    db.insert(pulseQuestions).values({ id, ...res.data, createdBy: me }),
    audit(db, me, "pulse.create", { type: "pulse_question", id }, { kind: res.data.kind, status: res.data.status }),
  ]);
  return c.redirect(`/admin/pulse/${encodeURIComponent(id)}/edit?notice=saved`);
});

async function loadQuestion(c: Context<AppEnv>): Promise<Question | null> {
  const [q] = await getDb(c.env).select().from(pulseQuestions).where(eq(pulseQuestions.id, c.req.param("id") ?? "")).limit(1);
  return q ?? null;
}

adminPulse.get("/:id/edit", async (c) => {
  const q = await loadQuestion(c);
  if (!q) return c.text("Not found", 404);
  return renderForm(c, { q, values: valuesOf(q) });
});

adminPulse.post("/:id/edit", async (c) => {
  const q = await loadQuestion(c);
  if (!q) return c.text("Not found", 404);
  const body = await c.req.parseBody({ all: true });
  const res = validate(body);
  if (!res.data) return renderForm(c, { q, values: res.values, error: res.error, status: 400 });
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  await batch(c.env, [
    db.update(pulseQuestions).set(res.data).where(eq(pulseQuestions.id, q.id)),
    audit(db, me, "pulse.update", { type: "pulse_question", id: q.id }, { kind: res.data.kind, status: res.data.status }),
  ]);
  return c.redirect(`/admin/pulse/${encodeURIComponent(q.id)}/edit?notice=saved`);
});

adminPulse.post("/:id/status", async (c) => {
  const q = await loadQuestion(c);
  if (!q) return c.text("Not found", 404);
  const body = await c.req.parseBody();
  const status = str(body.status);
  if (!STATUSES.some((s) => s.value === status)) return c.text("Bad request", 400);
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  await batch(c.env, [
    db.update(pulseQuestions).set({ status }).where(eq(pulseQuestions.id, q.id)),
    audit(db, me, "pulse.status", { type: "pulse_question", id: q.id }, { from: q.status, to: status }),
  ]);
  return c.redirect("/admin/pulse?notice=saved");
});

// --------------------------------------------------------------- results --

type Cell = { n: number; counts: Map<string, number>; sum: number };
type Results = {
  q: Question;
  options: Opt[];
  overall: Cell;
  byDistrict: Map<string, Cell>;
  byAge: Map<string, Cell>;
};

const cell = (): Cell => ({ n: 0, counts: new Map(), sum: 0 });

/** Positional or keyed row → array (pg-proxy hands back either). */
function cols(r: unknown): unknown[] {
  return Array.isArray(r) ? r : Object.values(r as Record<string, unknown>);
}

async function aggregate(c: Context<AppEnv>, q: Question): Promise<Results> {
  const db = getDb(c.env);
  // Respondents per (district, age band): one response per research id per question.
  const totalsQ = db.execute(sql`
    select district, age_band, count(*) as n
    from research_pulse_responses
    where question_id = ${q.id}
    group by district, age_band
    limit 1000`);
  // Answer values are [a-z0-9_] (or 1–5), so stripping JSON punctuation and
  // splitting on commas reads single, multi, scale and area answers alike —
  // and copes with jsonb that was stored double-encoded by the driver.
  const valuesQ: Promise<unknown> =
    q.kind === "text"
      ? Promise.resolve([])
      : db.execute(sql`
          select e.v, r.district, r.age_band, count(*) as n
          from research_pulse_responses r
          cross join lateral unnest(string_to_array(translate(r.answer::text, '"\\[] ', ''), ',')) as e(v)
          where r.question_id = ${q.id}
          group by e.v, r.district, r.age_band
          limit 10000`);
  const [totals, vals] = (await Promise.all([totalsQ, valuesQ])) as [unknown[], unknown[]];

  const res: Results = { q, options: answerOptions(q), overall: cell(), byDistrict: new Map(), byAge: new Map() };
  const at = (m: Map<string, Cell>, k: string) => {
    let x = m.get(k);
    if (!x) m.set(k, (x = cell()));
    return x;
  };
  for (const r of totals) {
    const [district, ageBand, n] = cols(r);
    const num = Number(n);
    res.overall.n += num;
    at(res.byDistrict, String(district ?? "unknown")).n += num;
    at(res.byAge, String(ageBand ?? "unknown")).n += num;
  }
  for (const r of vals) {
    const [v, district, ageBand, n] = cols(r);
    const value = String(v);
    const num = Number(n);
    const scaleV = q.kind === "scale" ? Number(value) : NaN;
    for (const target of [res.overall, at(res.byDistrict, String(district ?? "unknown")), at(res.byAge, String(ageBand ?? "unknown"))]) {
      target.counts.set(value, (target.counts.get(value) ?? 0) + num);
      if (Number.isFinite(scaleV)) target.sum += scaleV * num;
    }
  }
  return res;
}

type SegRow = { key: string; label: string; cell: Cell };

/**
 * Segments with at least k respondents get their own row; the rest are
 * merged into one "other" row so no small group is ever singled out.
 */
function segmentRows(m: Map<string, Cell>, labelOf: (k: string) => string, otherLabel: string): SegRow[] {
  const rows: SegRow[] = [];
  const other = cell();
  let merged = 0;
  for (const [k, x] of m) {
    if (safeCount(x.n) !== null && k !== "unknown") rows.push({ key: k, label: labelOf(k), cell: x });
    else {
      merged++;
      other.n += x.n;
      other.sum += x.sum;
      for (const [v, n] of x.counts) other.counts.set(v, (other.counts.get(v) ?? 0) + n);
    }
  }
  rows.sort((a, b) => a.label.localeCompare(b.label));
  if (merged) rows.push({ key: "other", label: otherLabel, cell: other });
  return rows;
}

const show = (n: number) => {
  const s = safeCount(n);
  return s === null ? "<10" : String(s);
};
const mean = (x: Cell) => (safeCount(x.n) === null || x.n === 0 ? "<10" : (x.sum / x.n).toFixed(2));

/** Columns for the segment tables: every option, or the top 8 overall when there are many. */
function segmentColumns(r: Results): Opt[] {
  if (r.options.length <= 8) return r.options;
  return r.options
    .slice()
    .sort((a, b) => (safeCount(r.overall.counts.get(b.value) ?? 0) ?? -1) - (safeCount(r.overall.counts.get(a.value) ?? 0) ?? -1))
    .slice(0, 8);
}

function districtLabel(lang: Lang) {
  return (k: string) => (k === "unknown" ? (lang === "en" ? "Unknown" : "ไม่ระบุ") : label(DISTRICTS, k, lang));
}

adminPulse.get("/:id/results", async (c) => {
  const { t, lang } = view(c);
  const q = await loadQuestion(c);
  if (!q) return c.text("Not found", 404);
  const r = await aggregate(c, q);
  const n = safeCount(r.overall.n);
  const otherLabel = t("อื่น ๆ (กลุ่มละไม่ถึง 10 คน รวมกัน)", "Other (groups under 10, combined)");
  const dRows = segmentRows(r.byDistrict, districtLabel(lang), otherLabel);
  const aRows = segmentRows(r.byAge, (k) => (k === "unknown" ? t("ไม่ระบุ", "Unknown") : k), otherLabel);
  const columns = segmentColumns(r);
  const optLabel = (o: Opt) => (lang === "en" ? o.en : o.th);

  const segTable = (title: string, rows: SegRow[]) => (
    <>
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <Empty>{t("ยังไม่มีข้อมูล", "No data yet")}</Empty>
      ) : (
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("กลุ่ม", "Group")}</th>
                <th>{t("ผู้ตอบ", "Respondents")}</th>
                {q.kind === "scale" ? <th>{t("ค่าเฉลี่ย", "Mean")}</th> : null}
                {columns.map((o) => (
                  <th>{optLabel(o)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr>
                  <td>{row.label}</td>
                  <td>{show(row.cell.n)}</td>
                  {q.kind === "scale" ? <td>{mean(row.cell)}</td> : null}
                  {columns.map((o) => (
                    <td>{show(row.cell.counts.get(o.value) ?? 0)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  return page(
    c,
    { title: t("ผลลัพธ์ City Pulse", "City Pulse results"), admin: true },
    <>
      <p>
        <a href="/admin/pulse">← City Pulse</a>
      </p>
      <h1>{lang === "en" ? q.promptEn : q.promptTh}</h1>
      <p class="meta">
        <Tag>{opt(KINDS, q.kind, lang)}</Tag>
        <Tag tone={q.status === "active" ? "ok" : undefined}>{opt(STATUSES, q.status, lang)}</Tag>
        <span>
          {t("ผู้ตอบทั้งหมด", "Respondents")}: <strong>{n === null ? "<10" : n}</strong>
        </span>
        <a href={`/admin/pulse/${encodeURIComponent(q.id)}/export.csv`}>{t("ดาวน์โหลด CSV (รวม)", "Download CSV (aggregated)")}</a>
      </p>
      <Notice kind="info">
        {t(
          "แสดงเฉพาะผลรวม ทุกช่องที่มีน้อยกว่า 10 คนแสดงเป็น \"<10\" กลุ่มย่อยที่มีไม่ถึง 10 คนจะถูกรวมไว้ใน \"อื่น ๆ\"",
          "Aggregates only. Any cell under 10 shows as \"<10\"; segments under 10 are merged into \"Other\".",
        )}
      </Notice>

      {q.kind === "text" ? (
        <Card>
          <p>
            {t(
              "คำตอบแบบข้อความจะไม่แสดงแบบคำต่อคำในแดชบอร์ด แสดงเพียงจำนวนคำตอบ",
              "Free-text answers are never shown verbatim in the dashboard — only the number of answers.",
            )}
          </p>
          <div class="stats">
            <div class="stat">
              <div class="stat-v">{n === null ? "<10" : n}</div>
              <div class="stat-l">{t("จำนวนคำตอบ", "Answers")}</div>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <h2>{t("ภาพรวม", "Overall")}</h2>
          {q.kind === "scale" ? (
            <p>
              {t("ค่าเฉลี่ย", "Mean")}: <strong>{mean(r.overall)}</strong> / 5
            </p>
          ) : null}
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("ตัวเลือก", "Option")}</th>
                  <th>{t("จำนวน", "Count")}</th>
                  <th style="min-width:140px">%</th>
                </tr>
              </thead>
              <tbody>
                {r.options.map((o) => {
                  const k = safeCount(r.overall.counts.get(o.value) ?? 0);
                  const pct = k !== null && n !== null ? Math.round((k / n) * 100) : null;
                  return (
                    <tr>
                      <td>{optLabel(o)}</td>
                      <td>{k === null ? "<10" : k}</td>
                      <td>
                        {pct === null ? (
                          "—"
                        ) : (
                          <div class="row" style="flex-wrap:nowrap">
                            <div class="bar" style="flex:1;min-width:80px">
                              <i style={`width:${Math.min(100, pct)}%`} />
                            </div>
                            <small>{pct}%</small>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {q.kind === "multi" ? <p class="muted">{t("เลือกได้หลายข้อ ผลรวมเปอร์เซ็นต์อาจเกิน 100%", "Multiple answers allowed; percentages can sum past 100%.")}</p> : null}
        </>
      )}

      {segTable(t("แยกตามเขต", "By district"), dRows)}
      {segTable(t("แยกตามช่วงอายุ", "By age band"), aRows)}
      {columns.length < r.options.length ? <p class="muted">{t("ตารางแยกกลุ่มแสดง 8 ตัวเลือกที่ได้รับเลือกมากที่สุด", "Segment tables show the 8 most chosen options.")}</p> : null}
    </>,
  );
});

function csvField(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

adminPulse.get("/:id/export.csv", async (c) => {
  const q = await loadQuestion(c);
  if (!q) return c.text("Not found", 404);
  const r = await aggregate(c, q);
  const lines: string[][] = [["scope", "group", "option", "option_label", "count"]];
  const emit = (scope: string, group: string, x: Cell) => {
    lines.push([scope, group, "_respondents", "Respondents", show(x.n)]);
    if (q.kind === "text") return;
    if (q.kind === "scale") lines.push([scope, group, "_mean", "Mean", mean(x)]);
    for (const o of r.options) lines.push([scope, group, o.value, o.en, show(x.counts.get(o.value) ?? 0)]);
  };
  emit("overall", "all", r.overall);
  const otherLabel = "other_under_10_combined";
  for (const row of segmentRows(r.byDistrict, (k) => k, otherLabel)) emit("district", row.key === "other" ? otherLabel : row.key, row.cell);
  for (const row of segmentRows(r.byAge, (k) => k, otherLabel)) emit("age_band", row.key === "other" ? otherLabel : row.key, row.cell);

  const db = getDb(c.env);
  await audit(db, c.var.user!.account.id, "pulse.export", { type: "pulse_question", id: q.id }, { rows: lines.length - 1 });

  const body = "﻿" + lines.map((l) => l.map(csvField).join(",")).join("\r\n") + "\r\n";
  return c.body(body, 200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="city-pulse-${q.id}.csv"`,
  });
});
