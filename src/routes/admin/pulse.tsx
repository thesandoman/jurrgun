/**
 * City Pulse survey manager (/admin/pulse) — BMA admins only (PRD §13.3).
 *
 *   GET  /                 questions with response counts
 *   GET  /new, POST /new   create
 *   GET  /:id/edit, POST   edit (+ mobile card preview)
 *   POST /:id/status       quick activate / pause / archive
 *   GET  /:id/results      aggregated results, k ≥ 10 on every cell (PRD §12.5),
 *                          shown counts rounded to 5 (C1); open questions as a daily snapshot
 *   GET  /:id/export.csv   the same aggregates as CSV
 *   GET  /roundup          one ended month for the BMA (C4): closed questions,
 *                          sorted topics and place checks, 10+ and rounded to 5
 *   GET  /roundup.csv      the same as CSV; every download is audited
 *
 * Results are computed in SQL from research_pulse_responses and never joined
 * to accounts; research ids are never selected. Free-text answers are only
 * ever counted, never shown.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { batch, getDb } from "../../db";
import { COARSE_ROUND_TO, K_THRESHOLD, roundedCount, roundedPct, safeCount } from "../../domain/rules";
import { bkkDayStart, bkkMonth } from "../../domain/pulse-heard";
import { DISTRICTS, label, districtsAZ } from "../../lib/constants";
import { newId } from "../../lib/crypto";
import type { AppEnv } from "../../lib/env";
import { fmtDate, type Lang, type T } from "../../lib/i18n";
import { audit } from "../../lib/records";
import { requireRole } from "../../lib/session";
import { pulseQuestions, pulseResponses, pulseSuggestions } from "../../schema";
import { SUGGEST_TOPICS } from "../../content/pulse";
import { Button, Card, Choices, Empty, Field, int, LinkButton, list, Notice, page, Select, Stat, str, Tag, TextArea, view } from "../../ui/kit";

export const adminPulse = new Hono<AppEnv>();
adminPulse.use("*", requireRole("bma_admin"));

type Question = typeof pulseQuestions.$inferSelect;
type Opt = { value: string; th: string; en: string };

export const AGE_BANDS = ["18-24", "25-29", "30-34", "35-44", "45-59", "60+"] as const;
const AGE_OPTS: Opt[] = AGE_BANDS.map((b) => ({ value: b, th: b, en: b }));
const KINDS: Opt[] = [
  { value: "single", th: "เลือกได้ 1 ข้อ", en: "Single choice" },
  { value: "multi", th: "เลือกได้หลายข้อ", en: "Multiple choice" },
  { value: "scale", th: "ให้คะแนน 1 ถึง 5", en: "Scale 1-5" },
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
  if (!values.promptTh || !values.promptEn) return fail("กรอกคำถามทั้งภาษาไทยและอังกฤษ", "Enter the question in Thai and English");
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
          {t("คำตอบเก็บโดยใช้รหัสแทนชื่อ และแสดงผลเป็นภาพรวมเท่านั้น", "Answers are kept under a code, not a name, and only shown in aggregate.")}
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
      <Choices legend={t("กลุ่มเป้าหมาย: เขต (ว่าง = ทุกเขต)", "Target districts (none = everyone)")} name="districts" options={districtsAZ(lang)} values={v.districts} lang={lang} />
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
      <p class="row">
        <a href="/admin/pulse/places">{t("เช็กสถานที่หลังโต๊ะ", "After-table place checks")}</a>
        <a href="/admin/pulse/topics">{t("หัวข้อที่สมาชิกอยากให้ถาม", "Topics members want asked")}</a>
        <a href="/admin/pulse/roundup">{t("สรุปรายเดือน", "Monthly round-up")}</a>
      </p>
      <p class="muted">{t("จำนวนคำตอบที่น้อยกว่า 10 จะแสดงเป็น \"<10\"", "Response counts under 10 are shown as \"<10\".")}</p>
      {qs.length === 0 ? (
        <Empty>{t("ยังไม่มีคำถาม", "No questions yet")}</Empty>
      ) : (
        <div class="table-wrap">
          <table>
            <caption class="sr-only">{t("คำถาม City Pulse", "City Pulse questions")}</caption>
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
                const n = roundedCount(countOf.get(q.id) ?? 0);
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
                        {q.activeFrom ? fmtDate(q.activeFrom, lang) : "-"} → {q.activeTo ? fmtDate(q.activeTo, lang) : "-"}
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
  /** Open questions: answers up to this moment only (Bangkok midnight). Null once closed. */
  asOf: Date | null;
};

/** Closed the same way members' "what the city heard" reads it: archived, or past its end. */
export function isClosed(q: Pick<Question, "status" | "activeTo">, now = new Date()): boolean {
  return q.status === "archived" || (q.activeTo !== null && q.activeTo.getTime() <= now.getTime());
}

const cell = (): Cell => ({ n: 0, counts: new Map(), sum: 0 });

/** Positional or keyed row → array (pg-proxy hands back either). */
function cols(r: unknown): unknown[] {
  return Array.isArray(r) ? r : Object.values(r as Record<string, unknown>);
}

async function aggregate(c: Context<AppEnv>, q: Question, now = new Date()): Promise<Results> {
  const db = getDb(c.env);
  // While a question is open the BMA sees a daily snapshot, never a live count:
  // refreshing after one person answers would otherwise show their answer (C1).
  const asOf = isClosed(q, now) ? null : bkkDayStart(now);
  const before = asOf ? sql`and created_at < ${asOf}` : sql``;
  const beforeR = asOf ? sql`and r.created_at < ${asOf}` : sql``;
  // Respondents per (district, age band): one response per research id per question.
  const totalsQ = db.execute(sql`
    select district, age_band, count(*) as n
    from research_pulse_responses
    where question_id = ${q.id} ${before}
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
          where r.question_id = ${q.id} ${beforeR}
          group by e.v, r.district, r.age_band
          limit 10000`);
  const [totals, vals] = (await Promise.all([totalsQ, valuesQ])) as [unknown[], unknown[]];

  const res: Results = { q, options: answerOptions(q), overall: cell(), byDistrict: new Map(), byAge: new Map(), asOf };
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
 *
 * The "other" row must itself reach k. Otherwise overall minus the shown rows
 * gives the small group's exact answers (12 in district A, 15 overall, so the
 * 3 in "other" are known). Smallest shown rows are folded in until it does.
 */
export function segmentRows(m: Map<string, Cell>, labelOf: (k: string) => string, otherLabel: string): SegRow[] {
  let rows: SegRow[] = [];
  const other = cell();
  let merged = 0;
  const fold = (x: Cell) => {
    merged++;
    other.n += x.n;
    other.sum += x.sum;
    for (const [v, n] of x.counts) other.counts.set(v, (other.counts.get(v) ?? 0) + n);
  };
  for (const [k, x] of m) {
    if (safeCount(x.n) !== null && k !== "unknown") rows.push({ key: k, label: labelOf(k), cell: x });
    else fold(x);
  }
  if (merged && other.n > 0) {
    rows.sort((a, b) => a.cell.n - b.cell.n);
    while (safeCount(other.n) === null && rows.length) fold(rows.shift()!.cell);
  }
  rows = rows.sort((a, b) => a.label.localeCompare(b.label));
  if (merged) rows.push({ key: "other", label: otherLabel, cell: other });
  return rows;
}

/** A count as shown: "<10" under k, otherwise rounded to the nearest 5. */
export const show = (n: number) => {
  const s = roundedCount(n);
  return s === null ? "<10" : String(s);
};

/**
 * The mean of a scale group, or "-" when it would give a hidden cell away:
 * mean × n minus the shown counts leaves the "<10" ones, so any group with a
 * cell from 1 to 9 shows no mean (C1).
 */
export const mean = (x: Cell, hidden = "-") => {
  if (safeCount(x.n) === null || x.n === 0) return "<10";
  for (const k of x.counts.values()) if (k > 0 && safeCount(k) === null) return hidden;
  return (x.sum / x.n).toFixed(2);
};

/**
 * One group's answers as the BMA sees them, safe against subtraction (card D2,
 * the same rule as safeTable in domain/rules.ts): for single, scale and area
 * questions the shown counts and the total add up, so a cell nobody can see
 * (under 10, a column not shown, or answers to an option since removed) must
 * never be the only one: then the smallest shown cell is hidden too, and the
 * total is rounded to 10. Multi-choice cells don't add up to the total, so
 * they are rounded alone.
 */
export type CellView = { total: number | null; cell: (v: string) => number | null; pct: (v: string) => number | null };

export function cellView(kind: string, x: Cell, all: Opt[], shown: Opt[] = all, restAlways = false): CellView {
  if (kind === "multi" || kind === "text") {
    return {
      total: roundedCount(x.n),
      cell: (v) => roundedCount(x.counts.get(v) ?? 0),
      pct: (v) => roundedPct(x.counts.get(v) ?? 0, x.n),
    };
  }
  const on = new Set(shown.map((o) => o.value));
  const raw = all.map((o) => x.counts.get(o.value) ?? 0);
  const rest = Math.max(0, x.n - raw.reduce((a, b) => a + b, 0));
  const cells = all.map((o, i) => (on.has(o.value) ? roundedCount(raw[i]) : null));
  // restAlways: answers that are never shown (a place's "ok" and blanks) count as unknown even at 0,
  // or a row would give away that there were none, and with it the rest's exact size.
  const restUnknown = restAlways || rest > 0;
  const unknown = cells.filter((c) => c === null).length + (restUnknown ? 1 : 0);
  if (unknown === 1) {
    let j = -1;
    cells.forEach((c, i) => {
      if (c !== null && (j < 0 || raw[i] < raw[j])) j = i;
    });
    if (j >= 0) cells[j] = null;
  }
  const hidden = cells.some((c) => c === null) || restUnknown;
  const total = safeCount(x.n) === null ? null : hidden ? Math.max(K_THRESHOLD, Math.round(x.n / COARSE_ROUND_TO) * COARSE_ROUND_TO) : roundedCount(x.n);
  const byValue = new Map(all.map((o, i) => [o.value, cells[i]]));
  return {
    total,
    cell: (v) => byValue.get(v) ?? null,
    pct: (v) => {
      const c = byValue.get(v) ?? null;
      return c === null || !total ? null : Math.min(100, Math.round((c / total) * 100));
    },
  };
}

const showN = (n: number | null) => (n === null ? "<10" : String(n));

const REACH_SHOWN: Opt[] = [{ value: "easy", th: "", en: "" }, { value: "hard", th: "", en: "" }];
const COMFORT_SHOWN: Opt[] = [{ value: "yes", th: "", en: "" }, { value: "no", th: "", en: "" }];

/**
 * A place row: answers, easy and hard to reach, shade yes and no. "ok", "some"
 * and blanks are never shown, so each pair plus its unshown rest adds up to the
 * answers; cellView keeps any one of them from being worked out (D2).
 */
export function placeView(p: { n: number; easy: number; hard: number; cyes: number; cno: number }): (number | null)[] {
  const reach = cellView("single", { n: p.n, sum: 0, counts: new Map([["easy", p.easy], ["hard", p.hard]]) }, REACH_SHOWN, REACH_SHOWN, true);
  const comfort = cellView("single", { n: p.n, sum: 0, counts: new Map([["yes", p.cyes], ["no", p.cno]]) }, COMFORT_SHOWN, COMFORT_SHOWN, true);
  const total = reach.total === comfort.total ? reach.total : safeCount(p.n) === null ? null : Math.max(K_THRESHOLD, Math.round(p.n / COARSE_ROUND_TO) * COARSE_ROUND_TO);
  return [total, reach.cell("easy"), reach.cell("hard"), comfort.cell("yes"), comfort.cell("no")];
}

/** Columns for the segment tables: every option, or the top 8 overall when there are many. */
function segmentColumns(r: Results): Opt[] {
  if (r.options.length <= 8) return r.options;
  return r.options
    .slice()
    .sort((a, b) => (roundedCount(r.overall.counts.get(b.value) ?? 0) ?? -1) - (roundedCount(r.overall.counts.get(a.value) ?? 0) ?? -1))
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
  const overallView = cellView(q.kind, r.overall, r.options);
  const n = overallView.total;
  const otherLabel = t("อื่น ๆ (รวมกลุ่มที่มีไม่ถึง 10 คน)", "Other (groups under 10, combined)");
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
            <caption class="sr-only">{title}</caption>
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
              {rows.map((row) => {
                const v = cellView(q.kind, row.cell, r.options, columns);
                return (
                  <tr>
                    <td>{row.label}</td>
                    <td>{showN(v.total)}</td>
                    {q.kind === "scale" ? <td>{mean(row.cell)}</td> : null}
                    {columns.map((o) => (
                      <td>{showN(v.cell(o.value))}</td>
                    ))}
                  </tr>
                );
              })}
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
          "แสดงเฉพาะผลรวม ตัวเลขปัดเป็นหลัก 5 ที่ใกล้ที่สุด ช่องที่มีน้อยกว่า 10 คนจะแสดงเป็น \"<10\" กลุ่มที่มีไม่ถึง 10 คนจะรวมไว้ใน \"อื่น ๆ\" และไม่แสดงค่าเฉลี่ย (-) ถ้ามีช่องที่ซ่อนอยู่ ถ้ามีช่องซ่อนเพียงช่องเดียว จะซ่อนอีกช่องด้วยและปัดยอดรวมเป็นหลัก 10 เพื่อไม่ให้ลบเลขหาค่าที่ซ่อนได้",
          "Aggregates only. Counts are rounded to the nearest 5. Any cell under 10 shows as \"<10\"; segments under 10 are merged into \"Other\"; a mean shows as \"-\" when a cell is hidden. If only one cell would be hidden, a second is hidden too and the total is rounded to the nearest 10, so no cell can be worked out by subtraction.",
        )}
      </Notice>
      {r.asOf ? (
        <Notice kind="info">
          {t(
            `คำถามนี้ยังเปิดอยู่ ผลนี้นับถึง 00:00 น. วันนี้ (เวลากรุงเทพฯ) และอัปเดตวันละครั้ง ผลเต็มแสดงเมื่อปิดคำถาม`,
            `This question is still open. These results count answers up to 00:00 today, Bangkok time, and update once a day. Full results show once it closes.`,
          )}
        </Notice>
      ) : null}

      {q.kind === "text" ? (
        <Card>
          <p>
            {t(
              "แดชบอร์ดไม่แสดงคำตอบแบบข้อความคำต่อคำ แสดงแค่จำนวนคำตอบ",
              "Free-text answers are never shown verbatim in the dashboard, only the number of answers.",
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
              <caption class="sr-only">{t("ภาพรวม", "Overall")}</caption>
              <thead>
                <tr>
                  <th>{t("ตัวเลือก", "Option")}</th>
                  <th>{t("จำนวน", "Count")}</th>
                  <th style="min-width:140px">%</th>
                </tr>
              </thead>
              <tbody>
                {r.options.map((o) => {
                  const k = overallView.cell(o.value);
                  const pct = overallView.pct(o.value);
                  return (
                    <tr>
                      <td>{optLabel(o)}</td>
                      <td>{k === null ? "<10" : k}</td>
                      <td>
                        {pct === null ? (
                          "-"
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

      <HeardNoteForm q={q} t={t} />

      {segTable(t("แยกตามเขต", "By district"), dRows)}
      {segTable(t("แยกตามช่วงอายุ", "By age band"), aRows)}
      {columns.length < r.options.length ? <p class="muted">{t("ตารางแยกกลุ่มแสดง 8 ตัวเลือกที่ได้รับเลือกมากที่สุด", "Segment tables show the 8 most chosen options.")}</p> : null}
    </>,
  );
});

// ----------------------------------------------------- what changed (D63) --

const NOTE_MAX = 280;

/** "What changed": a short note members see under this question's result once it closes with 10+ answers. */
function HeardNoteForm(props: { q: Question; t: T }) {
  const { q, t } = props;
  return (
    <section class="card" style="margin:24px 0">
      <h2 style="margin-top:0">{t("สิ่งที่เปลี่ยนไป (สมาชิกเห็น)", "What changed (members see this)")}</h2>
      <p class="muted">
        {t(
          "ข้อความสั้น ๆ ใต้ผลลัพธ์ในหน้า City Pulse ของสมาชิก เช่น เมืองทำอะไรจากคำตอบนี้ แสดงเมื่อคำถามปิดแล้วและมีคนตอบอย่างน้อย 10 คน อย่าใส่ชื่อคนหรือข้อมูลส่วนตัว",
          "A short line under this result on members' City Pulse page, such as what the city did about it. Shown once the question has closed with 10 or more answers. No names or personal details.",
        )}
      </p>
      <form method="post" action={`/admin/pulse/${encodeURIComponent(q.id)}/heard`}>
        <TextArea label={t("ภาษาไทย", "Thai")} name="noteTh" value={q.heardNoteTh ?? ""} rows={2} maxlength={NOTE_MAX} />
        <TextArea label={t("ภาษาอังกฤษ", "English")} name="noteEn" value={q.heardNoteEn ?? ""} rows={2} maxlength={NOTE_MAX} />
        <Button>{t("บันทึกข้อความ", "Save note")}</Button>
      </form>
    </section>
  );
}

adminPulse.post("/:id/heard", async (c) => {
  const q = await loadQuestion(c);
  if (!q) return c.text("Not found", 404);
  const body = await c.req.parseBody();
  const clean = (v: unknown) => str(v).replace(/\s+/g, " ").trim();
  const th = clean(body.noteTh);
  const en = clean(body.noteEn);
  if (th.length > NOTE_MAX || en.length > NOTE_MAX) return c.text("Bad request", 400);
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const any = !!(th || en);
  await batch(c.env, [
    db
      .update(pulseQuestions)
      .set({ heardNoteTh: th || null, heardNoteEn: en || null, heardNoteAt: any ? new Date() : null })
      .where(eq(pulseQuestions.id, q.id)),
    audit(db, me, "pulse.heard_note", { type: "pulse_question", id: q.id }, { set: any }),
  ]);
  return c.redirect(`/admin/pulse/${encodeURIComponent(q.id)}/results?notice=saved`);
});

// --------------------------------------- place checks and topics (D66) --

/**
 * Venue totals from after-table place checks: only places with 10+ answers,
 * any cell under 10 shown as "<10", every count rounded to 5, and only months
 * that have ended, so a refresh after one table's feedback shows nothing new (C1).
 */
adminPulse.get("/places", async (c) => {
  const { t, lang } = view(c);
  const db = getDb(c.env);
  const thisMonth = bkkMonth(new Date());
  const rows = (await db.execute(sql`
    select venue, district, count(*) as n,
      count(*) filter (where reach = 'easy') as easy, count(*) filter (where reach = 'hard') as hard,
      count(*) filter (where comfort = 'yes') as cyes, count(*) filter (where comfort = 'no') as cno
    from research_place_checks
    where month < ${thisMonth}
    group by venue, district
    having count(*) >= 10
    order by count(*) desc
    limit 200`)) as unknown as unknown[];
  const vals = rows.map((r) => (Array.isArray(r) ? r : Object.values(r as Record<string, unknown>)));
  return page(
    c,
    { title: t("เช็กสถานที่หลังโต๊ะ", "After-table place checks"), admin: true },
    <>
      <p>
        <a href="/admin/pulse">← City Pulse</a>
      </p>
      <h1>{t("เช็กสถานที่หลังโต๊ะ", "After-table place checks")}</h1>
      <p class="muted">
        {t(
          "คำตอบเก็บกับชื่อสถานที่ เขต และเดือนเท่านั้น ไม่มีรหัสหรือบัญชี แสดงเฉพาะสถานที่ที่มีคำตอบอย่างน้อย 10 ข้อ ตัวเลขปัดเป็นหลัก 5 และคำตอบของเดือนนี้จะแสดงเมื่อสิ้นเดือน",
          "Stored with the place, district and month only: no code, no account. Only places with 10 or more answers are listed, counts are rounded to the nearest 5, and this month's answers show once the month ends.",
        )}
      </p>
      {vals.length === 0 ? (
        <Empty>{t("ยังไม่มีสถานที่ที่มีคำตอบถึง 10 ข้อ", "No place has 10 answers yet")}</Empty>
      ) : (
        <div class="table-wrap">
          <table>
            <caption class="sr-only">{t("เช็กสถานที่หลังโต๊ะ", "After-table place checks")}</caption>
            <thead>
              <tr>
                <th>{t("สถานที่", "Place")}</th>
                <th>{t("เขต", "District")}</th>
                <th>{t("คำตอบ", "Answers")}</th>
                <th>{t("มาง่าย", "Easy to reach")}</th>
                <th>{t("มายาก", "Hard to reach")}</th>
                <th>{t("ร่มเงาหรือที่นั่งพอ", "Enough shade or seats")}</th>
                <th>{t("ไม่มีเลย", "None")}</th>
              </tr>
            </thead>
            <tbody>
              {vals.map(([venue, district, n, easy, hard, cyes, cno]) => (
                <tr>
                  <td>{String(venue)}</td>
                  <td>{label(DISTRICTS, String(district), lang)}</td>
                  {placeView({ n: Number(n), easy: Number(easy), hard: Number(hard), cyes: Number(cyes), cno: Number(cno) }).map((x) => (
                    <td>{showN(x)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>,
  );
});

/** Topics members asked the city about: counts per topic, 10+ only. The words never reach this page. */
adminPulse.get("/topics", async (c) => {
  const { t, lang } = view(c);
  const db = getDb(c.env);
  const rows = await db
    .select({ topic: pulseSuggestions.topic, n: sql<number>`count(*)`.mapWith(Number) })
    .from(pulseSuggestions)
    .where(eq(pulseSuggestions.status, "sorted"))
    .groupBy(pulseSuggestions.topic)
    .limit(100);
  const shown = rows
    .filter((r) => r.topic && safeCount(r.n) !== null)
    .map((r) => ({ topic: r.topic, n: roundedCount(r.n)! }))
    .sort((a, b) => b.n - a.n || a.topic!.localeCompare(b.topic!));
  return page(
    c,
    { title: t("หัวข้อที่สมาชิกอยากให้ถาม", "Topics members want asked"), admin: true },
    <>
      <p>
        <a href="/admin/pulse">← City Pulse</a>
      </p>
      <h1>{t("หัวข้อที่สมาชิกอยากให้ถาม", "Topics members want asked")}</h1>
      <p class="muted">
        {t(
          "ทีมดูแลอ่านคำถามที่สมาชิกส่งมา จัดเป็นหัวข้อ แล้วลบข้อความทิ้ง หน้านี้แสดงเฉพาะจำนวนต่อหัวข้อที่มีอย่างน้อย 10 ปัดเป็นหลัก 5",
          "Moderators read members' suggested questions, sort them into topics and delete the words. This page shows counts per topic, 10 or more only, rounded to the nearest 5.",
        )}
      </p>
      {shown.length === 0 ? (
        <Empty>{t("ยังไม่มีหัวข้อที่ถึง 10", "No topic has reached 10 yet")}</Empty>
      ) : (
        <div class="table-wrap">
          <table>
            <caption class="sr-only">{t("หัวข้อ", "Topics")}</caption>
            <thead>
              <tr>
                <th>{t("หัวข้อ", "Topic")}</th>
                <th>{t("จำนวน", "Count")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr>
                  <td>{label(SUGGEST_TOPICS, r.topic!, lang)}</td>
                  <td>{r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>,
  );
});

export function csvField(v: string): string {
  // Spreadsheets run cells starting with = + - @ as formulas: make them plain text.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// ---------------------------------------------------- monthly round-up (C4) --

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** First instant of a Bangkok month (YYYY-MM), as a UTC Date; `add` moves by whole months. */
function monthStart(month: string, add = 0): Date {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + add, 1) - 7 * 3_600_000);
}

/** The last `n` months that have ended in Bangkok, newest first. */
export function endedMonths(now: Date, n = 12): string[] {
  const current = bkkMonth(now);
  return Array.from({ length: n }, (_, i) => bkkMonth(monthStart(current, -(i + 1))));
}

/** The month asked for if it has ended, else null; no month asked means the one just ended. */
export function roundupMonth(param: string | undefined, now: Date): string | null {
  if (!param) return endedMonths(now, 1)[0];
  return MONTH_RE.test(param) && param < bkkMonth(now) ? param : null;
}

type PlaceRow = { venue: string; district: string; n: number; easy: number; hard: number; cyes: number; cno: number };
type Roundup = {
  month: string;
  questions: Results[];
  topics: { topic: string; n: number }[];
  places: PlaceRow[];
};

/**
 * One month for the BMA: questions that closed in it, topics sorted from that
 * month's suggestions, and place checks from it. Only ended months, only groups
 * of 10 or more, every count rounded to 5 by show() at display time.
 */
async function loadRoundup(c: Context<AppEnv>, month: string, now = new Date()): Promise<Roundup> {
  const db = getDb(c.env);
  const from = monthStart(month);
  const to = monthStart(month, 1);
  const closedIn = await db
    .select()
    .from(pulseQuestions)
    .where(sql`coalesce(${pulseQuestions.activeTo}, ${pulseQuestions.createdAt}) >= ${from} and coalesce(${pulseQuestions.activeTo}, ${pulseQuestions.createdAt}) < ${to}`)
    .orderBy(asc(pulseQuestions.sortOrder))
    .limit(50);
  const questions = await Promise.all(closedIn.filter((q) => isClosed(q, now)).map((q) => aggregate(c, q, now)));
  const topicRows = await db
    .select({ topic: pulseSuggestions.topic, n: sql<number>`count(*)`.mapWith(Number) })
    .from(pulseSuggestions)
    .where(sql`${pulseSuggestions.status} = 'sorted' and ${pulseSuggestions.month} = ${month}`)
    .groupBy(pulseSuggestions.topic)
    .limit(100);
  const placeRows = (await db.execute(sql`
    select venue, district, count(*) as n,
      count(*) filter (where reach = 'easy') as easy, count(*) filter (where reach = 'hard') as hard,
      count(*) filter (where comfort = 'yes') as cyes, count(*) filter (where comfort = 'no') as cno
    from research_place_checks
    where month = ${month}
    group by venue, district
    having count(*) >= 10
    order by count(*) desc
    limit 100`)) as unknown as unknown[];
  return {
    month,
    questions: questions.filter((r) => safeCount(r.overall.n) !== null),
    topics: topicRows
      .filter((r) => r.topic && safeCount(r.n) !== null)
      .map((r) => ({ topic: r.topic!, n: r.n }))
      .sort((a, b) => (roundedCount(b.n) ?? 0) - (roundedCount(a.n) ?? 0) || a.topic.localeCompare(b.topic)),
    places: placeRows.map((r) => {
      const [venue, district, n, easy, hard, cyes, cno] = cols(r);
      return { venue: String(venue), district: String(district), n: Number(n), easy: Number(easy), hard: Number(hard), cyes: Number(cyes), cno: Number(cno) };
    }),
  };
}

const monthLabel = (month: string, lang: Lang) =>
  new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "th-TH", { month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(monthStart(month));

adminPulse.get("/roundup", async (c) => {
  const { t, lang } = view(c);
  const now = new Date();
  const month = roundupMonth(c.req.query("month"), now);
  if (!month) return c.text("Choose a month that has ended", 400);
  const r = await loadRoundup(c, month, now);
  const optLabel = (o: Opt) => (lang === "en" ? o.en : o.th);
  return page(
    c,
    { title: t("สรุป City Pulse รายเดือน", "City Pulse monthly round-up"), admin: true },
    <>
      <p>
        <a href="/admin/pulse">← City Pulse</a>
      </p>
      <h1>
        {t("สรุป City Pulse", "City Pulse round-up")}: {monthLabel(month, lang)}
      </h1>
      <form method="get" action="/admin/pulse/roundup" class="row" style="align-items:end;flex-wrap:wrap">
        <Select
          label={t("เดือน", "Month")}
          name="month"
          value={month}
          options={endedMonths(now).map((m) => ({ value: m, th: monthLabel(m, "th"), en: monthLabel(m, "en") }))}
          lang={lang}
        />
        <Button kind="ghost">{t("แสดง", "Show")}</Button>
        <a href={`/admin/pulse/roundup.csv?month=${month}`}>{t("ดาวน์โหลด CSV (รวม บันทึกทุกครั้ง)", "Download CSV (aggregated, every download is logged)")}</a>
      </form>
      <Notice kind="info">
        {t(
          "เฉพาะเดือนที่จบแล้ว แสดงเฉพาะผลรวมของกลุ่มที่มีอย่างน้อย 10 คน ตัวเลขปัดเป็นหลัก 5 ที่ใกล้ที่สุด ช่องที่น้อยกว่า 10 แสดงเป็น \"<10\" ถ้ามีช่องซ่อนเพียงช่องเดียว จะซ่อนอีกช่องด้วยและปัดยอดรวมเป็นหลัก 10",
          "Ended months only. Totals from groups of 10 or more; counts are rounded to the nearest 5, and any cell under 10 shows as \"<10\". If only one cell would be hidden, a second is hidden too and the total is rounded to the nearest 10.",
        )}
      </Notice>

      <div class="stats">
        <Stat label={t("คำถามที่ปิดในเดือนนี้", "Questions closed this month")} value={r.questions.length} />
        <Stat label={t("หัวข้อที่ถึง 10", "Topics with 10 or more")} value={r.topics.length} />
        <Stat label={t("สถานที่ที่ถึง 10", "Places with 10 or more")} value={r.places.length} />
      </div>

      <h2>{t("คำถามที่ปิดแล้ว", "Closed questions")}</h2>
      {r.questions.length === 0 ? (
        <Empty>{t("ไม่มีคำถามที่ปิดในเดือนนี้และมีผู้ตอบถึง 10", "No question closed this month with 10 or more answers")}</Empty>
      ) : (
        r.questions.map((x) => (
          <Card>
            <h3 style="margin-top:0">{lang === "en" ? x.q.promptEn : x.q.promptTh}</h3>
            <p class="muted">
              {t("ผู้ตอบ", "Respondents")}: {showN(cellView(x.q.kind, x.overall, x.options).total)}
              {x.q.kind === "scale" ? ` · ${t("ค่าเฉลี่ย", "Mean")} ${mean(x.overall)} / 5` : null}
            </p>
            {x.q.kind === "text"
              ? null
              : ((top) => ((v) => top.map((o) => ({ o, s: v.cell(o.value), p: v.pct(o.value) })))(cellView(x.q.kind, x.overall, x.options, top)))(
                  x.options
                    .slice()
                    .sort((a, b) => (roundedCount(x.overall.counts.get(b.value) ?? 0) ?? -1) - (roundedCount(x.overall.counts.get(a.value) ?? 0) ?? -1))
                    .slice(0, 8),
                ).map(({ o, s, p }) => {
                    return (
                      <div style="margin:6px 0">
                        <div class="spread">
                          <span>{optLabel(o)}</span>
                          <small>{p === null ? "<10" : `${s} · ${p}%`}</small>
                        </div>
                        <div class="bar">
                          <i style={`width:${p ?? 0}%`} />
                        </div>
                      </div>
                    );
                  })}
          </Card>
        ))
      )}

      <h2>{t("หัวข้อที่สมาชิกอยากให้ถาม", "Topics members want asked")}</h2>
      <p class="muted">
        {t(
          "นับเฉพาะคำถามที่ทีมดูแลจัดหัวข้อแล้ว คำถามที่ยังไม่ได้จัดจะถูกลบหลัง 60 วันและไม่ถูกนับ",
          "Topic totals count only suggestions a moderator has sorted. Unsorted ones are wiped after 60 days and never counted.",
        )}
      </p>
      {r.topics.length === 0 ? (
        <Empty>{t("ยังไม่มีหัวข้อที่ถึง 10 ในเดือนนี้", "No topic reached 10 this month")}</Empty>
      ) : (
        <div class="table-wrap">
          <table>
            <caption class="sr-only">{t("หัวข้อ", "Topics")}</caption>
            <thead>
              <tr>
                <th>{t("หัวข้อ", "Topic")}</th>
                <th>{t("จำนวน", "Count")}</th>
              </tr>
            </thead>
            <tbody>
              {r.topics.map((x) => (
                <tr>
                  <td>{label(SUGGEST_TOPICS, x.topic, lang)}</td>
                  <td>{show(x.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>{t("เช็กสถานที่หลังโต๊ะ", "After-table place checks")}</h2>
      {r.places.length === 0 ? (
        <Empty>{t("ยังไม่มีสถานที่ที่มีคำตอบถึง 10 ในเดือนนี้", "No place had 10 answers this month")}</Empty>
      ) : (
        <div class="table-wrap">
          <table>
            <caption class="sr-only">{t("เช็กสถานที่หลังโต๊ะ", "After-table place checks")}</caption>
            <thead>
              <tr>
                <th>{t("สถานที่", "Place")}</th>
                <th>{t("เขต", "District")}</th>
                <th>{t("คำตอบ", "Answers")}</th>
                <th>{t("มาง่าย", "Easy to reach")}</th>
                <th>{t("มายาก", "Hard to reach")}</th>
                <th>{t("ร่มเงาหรือที่นั่งพอ", "Enough shade or seats")}</th>
                <th>{t("ไม่มีเลย", "None")}</th>
              </tr>
            </thead>
            <tbody>
              {r.places.map((p) => (
                <tr>
                  <td>{p.venue}</td>
                  <td>{label(DISTRICTS, p.district, lang)}</td>
                  {placeView(p).map((x) => (
                    <td>{showN(x)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>,
  );
});

adminPulse.get("/roundup.csv", async (c) => {
  const now = new Date();
  const month = roundupMonth(c.req.query("month"), now);
  if (!month) return c.text("Choose a month that has ended", 400);
  const r = await loadRoundup(c, month, now);
  const lines: string[][] = [["month", "section", "item", "option", "label", "count"]];
  for (const x of r.questions) {
    const v = cellView(x.q.kind, x.overall, x.options);
    lines.push([month, "question", x.q.id, "_respondents", "Respondents", showN(v.total)]);
    if (x.q.kind === "scale") lines.push([month, "question", x.q.id, "_mean", "Mean", mean(x.overall, "hidden")]);
    if (x.q.kind !== "text") for (const o of x.options) lines.push([month, "question", x.q.id, o.value, o.en, showN(v.cell(o.value))]);
  }
  for (const x of r.topics) lines.push([month, "topic", x.topic, "_sorted", "Sorted suggestions", show(x.n)]);
  for (const p of r.places) {
    const item = `${p.venue} (${p.district})`;
    const shown = placeView(p);
    ["_answers", "easy", "hard", "shade_yes", "shade_no"].forEach((k, i) => lines.push([month, "place", item, k, k, showN(shown[i])]));
  }
  await audit(getDb(c.env), c.var.user!.account.id, "pulse.roundup_export", { type: "pulse_roundup", id: month }, { rows: lines.length - 1 });
  const body = "﻿" + lines.map((l) => l.map(csvField).join(",")).join("\r\n") + "\r\n";
  return c.body(body, 200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="city-pulse-roundup-${month}.csv"`,
  });
});

adminPulse.get("/:id/export.csv", async (c) => {
  const q = await loadQuestion(c);
  if (!q) return c.text("Not found", 404);
  const r = await aggregate(c, q);
  const lines: string[][] = [["scope", "group", "option", "option_label", "count"]];
  const emit = (scope: string, group: string, x: Cell) => {
    const v = cellView(q.kind, x, r.options);
    lines.push([scope, group, "_respondents", "Respondents", showN(v.total)]);
    if (q.kind === "text") return;
    if (q.kind === "scale") lines.push([scope, group, "_mean", "Mean", mean(x, "hidden")]);
    for (const o of r.options) lines.push([scope, group, o.value, o.en, showN(v.cell(o.value))]);
  };
  if (r.asOf) lines.push(["meta", "all", "_snapshot", "Open question: answers up to (UTC)", r.asOf.toISOString()]);
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
