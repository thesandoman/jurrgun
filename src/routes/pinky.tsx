/**
 * Pinky Plans (owner, 2026-10-26, with the 3 Wise Men conditions): the
 * private space for two people who chose each other.
 *
 *   GET  /pinky/:id            the space: our plan, the shared note, ideas, talk, share, pause, end kindly
 *   POST /pinky/:id/plan       set the place and time (a confirm is cleared when either changes)
 *   POST /pinky/:id/idea       use an idea as the place
 *   POST /pinky/:id/confirm    confirm the plan as it stands
 *   POST /pinky/:id/note       the one shared note (no history, no "edited by", no timestamps)
 *   POST /pinky/:id/ideas      "Other ideas": the next three today
 *   POST /pinky/:id/pause      pause, no reason asked
 *   POST /pinky/:id/resume     only the person who paused
 *   POST /pinky/:id/end        End kindly: a gentle preset message, then the Pinky is deleted
 *
 * Only the two people can open any of it (anyone else gets a 404). Staff never
 * see it: no admin page reads these tables and nothing here is audited. Love
 * red appears only at the unlock moment (ui/pinky.tsx), never in this space.
 */
import { Hono, type Context } from "hono";
import { and, eq } from "drizzle-orm";
import { batch, getDb } from "../db";
import { CHAT_KIND, notifyAt } from "../domain/chat";
import { fromBangkok, toBangkokInput } from "../domain/hosting";
import { bothConfirmed, END_KINDLY, isEndKindly, NOTE_MAX, PLACE_MAX } from "../domain/pinky-plans";
import { endedKey } from "../domain/pinky";
import { FIRST_DATE_LINE } from "../content/dating";
import { ideaByKey } from "../content/date-ideas";
import { DISTRICTS, districtsAZ, label } from "../lib/constants";
import { newId } from "../lib/crypto";
import type { AppEnv } from "../lib/env";
import { fmtDate } from "../lib/i18n";
import { requireMember } from "../lib/session";
import { chatMessages, connectionChoices, connections, notifications, pinkies, pinkyPlans, profiles, type Pinky, type PinkyPlan } from "../schema";
import { endPinkyOnConnection, ideasNow, pinkyFor, showMoreIdeas } from "../services/pinky-plans";
import { withdrawPairTaps } from "../services/pinky";
import { resolveThread } from "./chat";
import { Button, Field, Notice, page, Select, str, TextArea, view } from "../ui/kit";
import { PinkyIcon } from "../ui/pinky";

export const pinkyRoutes = new Hono<AppEnv>();
type C = Context<AppEnv>;
type Db = ReturnType<typeof getDb>;

const me = (c: C) => c.var.user!.account.id;
const otherOf = (p: Pinky, id: string) => (p.aAccount === id ? p.bAccount : p.aAccount);
const sideOf = (p: Pinky, id: string): "a" | "b" => (p.aAccount === id ? "a" : "b");

async function load(c: C): Promise<{ db: Db; p: Pinky; mine: string } | null> {
  const db = getDb(c.env);
  const p = await pinkyFor(db, c.req.param("id") ?? "", me(c));
  return p ? { db, p, mine: me(c) } : null;
}

async function planOf(db: Db, pinkyId: string): Promise<PinkyPlan | null> {
  const [row] = await db.select().from(pinkyPlans).where(eq(pinkyPlans.pinkyId, pinkyId)).limit(1);
  return row ?? null;
}

const back = (p: Pinky, hash = "") => `/pinky/${p.id}${hash}`;

// ------------------------------------------------------------------ page --

pinkyRoutes.get("/pinky/:id", requireMember, async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const got = await load(c);
  if (!got) return c.notFound();
  const { db, p, mine } = got;
  const them = otherOf(p, mine);
  const [[prof], plan, ideas] = await Promise.all([db.select({ nickname: profiles.nickname }).from(profiles).where(eq(profiles.accountId, them)).limit(1), planOf(db, p.id), ideasNow(db, p)]);
  const name = prof?.nickname ?? "";
  const paused = p.state === "paused";
  const iConfirmed = plan ? (sideOf(p, mine) === "a" ? !!plan.aConfirmedAt : !!plan.bConfirmedAt) : false;
  const idea = ideaByKey(plan?.ideaKey);
  const place = idea ? (lang === "en" ? idea.place.en : idea.place.th) : plan?.placeName;
  const ready = !!plan && !!place && !!plan.startsAt;
  const shareWhere = place ? encodeURIComponent(place) : "";
  const shareWhen = plan?.startsAt ? encodeURIComponent(fmtDate(plan.startsAt, lang)) : "";

  return page(
    c,
    { title: "เกี่ยวก้อย · Pinky", tab: "connections" },
    <>
      <p>
        <a href="/connections" class="back-link">← {t("คนรู้จัก", "My people")}</a>
      </p>
      <section class="pk-head">
        <PinkyIcon />
        <div>
          <h1 class="pk-title">เกี่ยวก้อย · Pinky</h1>
          <p class="muted">{t(`เกี่ยวก้อย: คุณสองคนเลือกกัน · กับ ${name}`, `Pinky: you both chose each other · with ${name}`)}</p>
        </div>
      </section>

      {paused ? (
        <Notice kind="info">
          {t("พักไว้ก่อน ไม่ต้องอธิบายอะไร", "Paused for now. Nobody needs to explain.")}
          {p.pausedBy === mine ? (
            <form method="post" action={back(p, "/resume")} style="display:inline;margin-left:8px">
              <Button kind="ghost">{t("กลับมาต่อ", "Resume")}</Button>
            </form>
          ) : null}
        </Notice>
      ) : null}

      <section class="pk-sec" aria-labelledby="pk-plan">
        <h2 id="pk-plan">{t("แผนของเรา", "Our plan")}</h2>
        {ready ? (
          <div class="pk-plan">
            <p class="pk-place">📍 {place}{plan!.district ? <small class="muted"> · {label(DISTRICTS, plan!.district, lang)}</small> : null}</p>
            <p>🗓 {fmtDate(plan!.startsAt!, lang)}</p>
            {bothConfirmed(plan) ? (
              <p class="pk-confirmed">✓ {t("ยืนยันทั้งคู่แล้ว", "Both confirmed")}</p>
            ) : iConfirmed ? (
              <p class="muted">{t("คุณยืนยันแล้ว", "You've confirmed")}</p>
            ) : !paused ? (
              <form method="post" action={back(p, "/confirm")}>
                <Button>{t("ยืนยันแผนนี้", "Confirm this plan")}</Button>
              </form>
            ) : null}
          </div>
        ) : (
          <p class="muted">{t("ยังไม่มีแผน เลือกไอเดียด้านล่าง หรือใส่ที่ของคุณเอง", "No plan yet. Pick an idea below or add your own place.")}</p>
        )}
        {paused ? null : (
          // Open after "Use this place", so the chosen place and the time field are in view (QA, on phones).
          <details class="how" id="pk-form" open={c.req.query("edit") === "1"}>
            <summary>{ready ? t("เปลี่ยนแผน", "Change the plan") : t("ใส่แผนเอง", "Add a plan")}</summary>
            <form method="post" action={back(p, "/plan")}>
              <Field label={t("ที่ไหน (ที่สาธารณะ)", "Where (somewhere public)")} name="place" value={plan?.ideaKey ? place : plan?.placeName} maxlength={PLACE_MAX} required />
              <Select label={t("เขต", "District")} name="district" options={districtsAZ(lang)} value={plan?.district} lang={lang} blank={t("ไม่ระบุ", "Not set")} />
              <Field label={t("วันและเวลา", "Day and time")} name="startsAt" type="datetime-local" value={plan?.startsAt ? toBangkokInput(plan.startsAt) : ""} required />
              <Button>{t("บันทึกแผน", "Save the plan")}</Button>
            </form>
          </details>
        )}
        <form method="post" action={back(p, "/note")} class="pk-note">
          <TextArea label={t("โน้ตของเรา", "Our note")} name="note" value={plan?.note ?? ""} rows={2} maxlength={NOTE_MAX} />
          {paused ? null : <Button kind="ghost">{t("บันทึก", "Save")}</Button>}
        </form>
      </section>

      {paused ? null : (
        <section class="pk-sec" aria-labelledby="pk-ideas">
          <h2 id="pk-ideas">{t("ไอเดียสำหรับเราสองคน", "Ideas for you two")}</h2>
          <ul class="pk-ideas">
            {ideas.ideas.map((i) => (
              <li class="pk-idea">
                <b>{lang === "en" ? i.place.en : i.place.th}</b>
                <small class="muted">
                  {label(DISTRICTS, i.district, lang)} · {lang === "en" ? i.when.en : i.when.th}
                </small>
                <p>{lang === "en" ? i.why.en : i.why.th}</p>
                <form method="post" action={back(p, "/idea")}>
                  <input type="hidden" name="idea" value={i.key} />
                  <Button kind="ghost">{t("ใช้ที่นี่", "Use this place")}</Button>
                </form>
              </li>
            ))}
          </ul>
          {ideas.more ? (
            <form method="post" action={back(p, "/ideas")}>
              <Button kind="ghost">{t("ไอเดียอื่น", "Other ideas")}</Button>
            </form>
          ) : (
            <p class="muted">{t("พอแค่นี้ก่อน เลือกสักที่แล้วไปกันเลย", "That's enough for today. Pick one and go.")}</p>
          )}
        </section>
      )}

      <section class="pk-sec">
        <a class="btn primary" href={`/chat/conn:${p.connectionId}`}>💬 {t("คุยกัน", "Talk")}</a>{" "}
        {/* Optional: my own plan to a friend I pick, through my phone. "Who" starts empty. Where and when travel in
            the URL fragment, which never reaches the server, so Jurrgun never receives or stores them. */}
        <a class="btn ghost" href={`/safety#plan&where=${shareWhere}&when=${shareWhen}`}>{t("ส่งแผนให้เพื่อนที่ไว้ใจ", "Send my plan to a friend I trust")}</a>
        <p class="pinky-safety">
          {t(FIRST_DATE_LINE.th, FIRST_DATE_LINE.en)} <a href="/learn/date-responsibly">{t("เดตอย่างปลอดภัย", "Date safely")}</a>
        </p>
      </section>

      <section class="pk-sec pk-out">
        {paused ? null : (
          <form method="post" action={back(p, "/pause")}>
            <Button kind="ghost">{t("พักไว้ก่อน", "Pause")}</Button>
          </form>
        )}
        <details class="how">
          <summary>{t("จบอย่างใจดี", "End kindly")}</summary>
          <form method="post" action={back(p, "/end")}>
            <fieldset class="choices">
              <legend>{t("ส่งข้อความสั้น ๆ ให้เขา", "Send them a short message")}</legend>
              {Object.entries(END_KINDLY).map(([k, m], i) => (
                <label class="toggle">
                  <input type="radio" name="message" value={k} required checked={i === 0} />
                  <span>{lang === "en" ? m.en : m.th}</span>
                </label>
              ))}
            </fieldset>
            <p class="muted">{t("แผน ไอเดีย และแชตของเกี่ยวก้อยนี้จะถูกลบทั้งหมด", "The plan, ideas and chat of this Pinky are all deleted.")}</p>
            <p class="muted">{t("ถ้ามีรายงานที่ยังตรวจอยู่ แชตจะเก็บไว้จนกว่าจะตรวจเสร็จ", "If there's an open report, the chat is kept until the review ends.")}</p>
            <Button kind="danger">{t("จบอย่างใจดี", "End kindly")}</Button>
          </form>
        </details>
        <p class="row muted">
          <a href={`/report?account=${encodeURIComponent(them)}`}>{t("รายงาน", "Report")}</a>
        </p>
        <form method="post" action={`/block/${them}`}>
          <input type="hidden" name="back" value="/connections" />
          <button class="btn ghost danger">⛔ {t("บล็อก", "Block")}</button>
        </form>
      </section>
    </>,
  );
});

// --------------------------------------------------------------- actions --

/** Every action but End kindly and Resume waits while the Pinky is paused. */
function writable(p: Pinky): boolean {
  return p.state === "active";
}

/** Upsert the plan with these fields; a change of place or time clears both confirms. */
function savePlan(db: Db, p: Pinky, current: PinkyPlan | null, next: { placeName: string | null; ideaKey: string | null; district: string | null; startsAt: Date | null }) {
  const moved =
    !current ||
    current.placeName !== next.placeName ||
    current.ideaKey !== next.ideaKey ||
    (current.startsAt?.getTime() ?? null) !== (next.startsAt?.getTime() ?? null);
  const confirms = moved ? { aConfirmedAt: null, bConfirmedAt: null } : {};
  return db
    .insert(pinkyPlans)
    .values({ id: newId(), pinkyId: p.id, ...next })
    .onConflictDoUpdate({ target: pinkyPlans.pinkyId, set: { ...next, ...confirms } });
}

pinkyRoutes.post("/pinky/:id/plan", requireMember, async (c) => {
  const got = await load(c);
  if (!got) return c.notFound();
  const { db, p } = got;
  if (!writable(p)) return c.redirect(back(p));
  const body = await c.req.parseBody();
  const place = str(body.place).trim().slice(0, PLACE_MAX);
  const district = str(body.district);
  const startsAt = fromBangkok(str(body.startsAt));
  if (!place || !startsAt) return c.redirect(back(p, "#pk-plan"));
  const current = await planOf(db, p.id);
  // Typing the idea's own name back keeps the idea; anything else is the pair's own place.
  const keepIdea = current?.ideaKey && [ideaByKey(current.ideaKey)?.place.en, ideaByKey(current.ideaKey)?.place.th].includes(place) ? current.ideaKey : null;
  await savePlan(db, p, current, {
    placeName: keepIdea ? current!.placeName : place,
    ideaKey: keepIdea,
    district: DISTRICTS.some((d) => d.value === district) ? district : null,
    startsAt,
  }).execute();
  return c.redirect(back(p, "#pk-plan"));
});

pinkyRoutes.post("/pinky/:id/idea", requireMember, async (c) => {
  const got = await load(c);
  if (!got) return c.notFound();
  const { db, p } = got;
  if (!writable(p)) return c.redirect(back(p));
  const idea = ideaByKey(str((await c.req.parseBody()).idea));
  if (!idea) return c.redirect(back(p));
  const current = await planOf(db, p.id);
  await savePlan(db, p, current, { placeName: idea.place.en, ideaKey: idea.key, district: idea.district, startsAt: current?.startsAt ?? null }).execute();
  return c.redirect(back(p, "?edit=1#pk-form"));
});

pinkyRoutes.post("/pinky/:id/confirm", requireMember, async (c) => {
  const got = await load(c);
  if (!got) return c.notFound();
  const { db, p, mine } = got;
  if (!writable(p)) return c.redirect(back(p));
  const plan = await planOf(db, p.id);
  if (plan && (plan.placeName || plan.ideaKey) && plan.startsAt) {
    await db
      .update(pinkyPlans)
      .set(sideOf(p, mine) === "a" ? { aConfirmedAt: new Date() } : { bConfirmedAt: new Date() })
      .where(eq(pinkyPlans.id, plan.id));
  }
  return c.redirect(back(p, "#pk-plan"));
});

pinkyRoutes.post("/pinky/:id/note", requireMember, async (c) => {
  const got = await load(c);
  if (!got) return c.notFound();
  const { db, p } = got;
  if (!writable(p)) return c.redirect(back(p));
  const note = str((await c.req.parseBody()).note).trim().slice(0, NOTE_MAX);
  // One shared note: last save wins. No history, no "edited by", no timestamps.
  await db
    .insert(pinkyPlans)
    .values({ id: newId(), pinkyId: p.id, note })
    .onConflictDoUpdate({ target: pinkyPlans.pinkyId, set: { note } });
  return c.redirect(back(p, "#pk-plan"));
});

pinkyRoutes.post("/pinky/:id/ideas", requireMember, async (c) => {
  const got = await load(c);
  if (!got) return c.notFound();
  const { db, p } = got;
  if (writable(p)) await showMoreIdeas(db, p).execute();
  return c.redirect(back(p, "#pk-ideas"));
});

pinkyRoutes.post("/pinky/:id/pause", requireMember, async (c) => {
  const got = await load(c);
  if (!got) return c.notFound();
  const { db, p, mine } = got;
  if (writable(p)) await db.update(pinkies).set({ state: "paused", pausedBy: mine, pausedAt: new Date() }).where(and(eq(pinkies.id, p.id), eq(pinkies.state, "active")));
  return c.redirect(back(p));
});

pinkyRoutes.post("/pinky/:id/resume", requireMember, async (c) => {
  const got = await load(c);
  if (!got) return c.notFound();
  const { db, p, mine } = got;
  // Only the person who paused resumes; the other can always End kindly instead.
  if (p.state === "paused" && p.pausedBy === mine) await db.update(pinkies).set({ state: "active", pausedBy: null, pausedAt: null }).where(eq(pinkies.id, p.id));
  return c.redirect(back(p));
});

/**
 * End kindly (either person, paused or not): back to friends, both taps
 * cleared, no new tap on this pairing, and the Pinky, its plan and the
 * Pinky-period chat deleted. If either has an open report about the other, the
 * whole period's chat is held until the review ends (Trust & Operations).
 * Then the gentle preset goes as an ordinary chat message, with the usual
 * neutral "New message" notification.
 */
pinkyRoutes.post("/pinky/:id/end", requireMember, async (c) => {
  const got = await load(c);
  if (!got) return c.notFound();
  const { db, p, mine } = got;
  const key = str((await c.req.parseBody()).message);
  const message = isEndKindly(key) ? END_KINDLY[key] : END_KINDLY.thanks;
  const them = otherOf(p, mine);
  const now = new Date();
  await batch(c.env, [
    withdrawPairTaps(db, mine, them, p.sourceKey),
    db
      .insert(connectionChoices)
      .values({ id: newId(), eventId: endedKey(p.sourceKey), fromAccount: mine, toAccount: them, choice: "none" })
      .onConflictDoNothing({ target: [connectionChoices.eventId, connectionChoices.fromAccount, connectionChoices.toAccount] }),
    ...endPinkyOnConnection(db, p.connectionId, now),
    db
      .update(connections)
      .set({ level: p.source === "buddy" ? "activity" : "friend" })
      .where(and(eq(connections.id, p.connectionId), eq(connections.level, "romance"))),
  ]);
  const th = await resolveThread(db, `conn:${p.connectionId}`, mine, now);
  if (th) {
    const [{ locale } = { locale: "th" }] = await db.select({ locale: profiles.locale }).from(profiles).where(eq(profiles.accountId, mine)).limit(1);
    await batch(c.env, [
      // Just after the Pinky's end time, so a held period never includes this message.
      db.insert(chatMessages).values({ id: newId(), thread: th.key, sender: mine, body: locale === "en" ? message.en : message.th, createdAt: new Date(now.getTime() + 1000) }),
      db.insert(notifications).values({ id: newId(), accountId: them, kind: CHAT_KIND, titleTh: "มีข้อความใหม่", titleEn: "New message", link: `/chat/conn:${p.connectionId}`, createdAt: notifyAt(now) }),
    ]);
  }
  return c.redirect("/connections?notice=back_to_friends");
});

