/**
 * Events, feedback part (split from routes/events.tsx, Core Platform C3: a pure move).
 * See ./index.ts for the route list.
 */
import { researchConsent } from "../pulse";
import { PLACE_COMFORT, PLACE_REACH } from "../../content/pulse";
import { bkkMonth } from "../../domain/pulse-heard";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { newId } from "../../lib/crypto";
import { requireMember } from "../../lib/session";
import { feedback, placeChecks, type Event } from "../../schema";
import { Button, Choices, Notice, page, str, TextArea, view, type View } from "../../ui/kit";
import { eventRoutes } from "./app";
import { forbidden, notFound } from "./detail";
import { checkedInRegistration } from "./live";
import { me, title } from "./shared";
import type { Ctx } from "./shared";

// ------------------------------------------------------------ feedback --

const YES_NO = [
  { value: "yes", th: "ใช่", en: "Yes" },
  { value: "no", th: "ไม่", en: "No" },
];
const SCALE = ["1", "2", "3", "4", "5"].map((n) => ({ value: n, th: n, en: n }));

async function feedbackGate(c: Ctx, id: string) {
  const { event, reg } = await checkedInRegistration(c, id);
  if (!event) return { event: null, reg: null, error: notFound(c) };
  if (!reg) return { event, reg: null, error: forbidden(c, "ให้ความคิดเห็นได้เฉพาะคนที่เช็กอินแล้ว", "Only checked-in attendees can give feedback.", `/events/${id}`) };
  if (event.endsAt.getTime() > Date.now()) {
    return { event, reg, error: forbidden(c, "ให้ความคิดเห็นได้หลังกิจกรรมจบ", "Feedback opens when the event ends.", `/events/${id}`) };
  }
  return { event, reg, error: null };
}

function FeedbackForm(props: { v: View; event: Event; values: Record<string, string>; error?: string; placeCheck?: boolean }) {
  const { t, lang } = props.v;
  const val = props.values;
  return (
    <>
      <h1>{t("กิจกรรมเป็นยังไงบ้าง?", "How was it?")}</h1>
      <p class="muted">{title(props.event, lang)}</p>
      {props.error ? <Notice kind="error">{props.error}</Notice> : null}
      <form method="post">
        <Choices legend={t("ได้รู้จักคนใหม่ไหม?", "Did you meet someone new?")} name="metNewPerson" type="radio" options={YES_NO} values={[val.metNewPerson ?? ""]} lang={lang} required />
        <Choices legend={t("อยากเจอใครจากวันนี้อีกไหม?", "Would you meet someone from today again?")} name="wouldMeetAgain" type="radio" options={YES_NO} values={[val.wouldMeetAgain ?? ""]} lang={lang} required />
        <Choices legend={t("รู้สึกปลอดภัยแค่ไหน (1-5)", "How safe did you feel? (1-5)")} name="feltSafe" type="radio" options={SCALE} values={[val.feltSafe ?? ""]} lang={lang} required />
        <Choices legend={t("รู้สึกว่ามีคนฟังคุณแค่ไหน (1-5)", "Did you feel heard? (1-5)")} name="feltHeard" type="radio" options={SCALE} values={[val.feltHeard ?? ""]} lang={lang} />
        <Choices legend={t("ให้คะแนนโต๊ะของคุณ (1-5)", "Rate your table (1-5)")} name="groupRating" type="radio" options={SCALE} values={[val.groupRating ?? ""]} lang={lang} required />
        <TextArea label={t("อยากบอกอะไรเพิ่มไหม (ไม่บังคับ)", "Anything else? (optional)")} name="comment" value={val.comment} maxlength={500} />
        {props.placeCheck ? (
          // City Pulse place check (owner D66): optional, research consent only, kept with the place and month, never with you.
          <fieldset class="place-check">
            <legend>{t("เรื่องสถานที่ สำหรับ City Pulse (ไม่บังคับ)", "About the place, for City Pulse (optional)")}</legend>
            <p class="muted">{t("เก็บไว้กับชื่อสถานที่และเดือนเท่านั้น ไม่ผูกกับคุณ ใช้เลือกสถานที่ที่ดีขึ้นเมื่อมีคนตอบอย่างน้อย 10 คน", "Kept with the place and month only, never with you. Used to pick better places once 10 or more people answer.")}</p>
            <Choices legend={t("มาถึงที่นี่ง่ายไหม?", "Was it easy to get here?")} name="placeReach" type="radio" options={PLACE_REACH} values={[val.placeReach ?? ""]} lang={lang} />
            <Choices legend={t("มีร่มเงาหรือที่นั่งพอไหม?", "Was there shade or somewhere to sit?")} name="placeComfort" type="radio" options={PLACE_COMFORT} values={[val.placeComfort ?? ""]} lang={lang} />
          </fieldset>
        ) : null}
        <Button>{t("ส่งความคิดเห็น", "Send feedback")}</Button>
      </form>
    </>
  );
}

eventRoutes.get("/events/:id/feedback", requireMember, async (c) => {
  const v = view(c);
  const id = c.req.param("id");
  const gate = await feedbackGate(c, id);
  if (gate.error) return gate.error;
  const db = getDb(c.env);
  const [fb] = await db
    .select()
    .from(feedback)
    .where(and(eq(feedback.eventId, id), eq(feedback.accountId, me(c).account.id)))
    .limit(1);
  const yn = (b: boolean | null | undefined) => (b === true ? "yes" : b === false ? "no" : "");
  const vals: Record<string, string> = fb
    ? {
        metNewPerson: yn(fb.metNewPerson),
        wouldMeetAgain: yn(fb.wouldMeetAgain),
        feltSafe: fb.feltSafe ? String(fb.feltSafe) : "",
        feltHeard: fb.feltHeard ? String(fb.feltHeard) : "",
        groupRating: fb.groupRating ? String(fb.groupRating) : "",
        comment: fb.comment,
      }
    : {};
  // Offered only with the first feedback for an event, so nothing per person needs to record whether it was answered.
  const placeCheck = !fb && !!me(c).account.researchId && (await researchConsent(c, me(c).account.id));
  return page(c, { title: v.t("ความคิดเห็น", "Feedback"), tab: "mine" }, <FeedbackForm v={v} event={gate.event!} values={vals} placeCheck={placeCheck} />);
});

eventRoutes.post("/events/:id/feedback", requireMember, async (c) => {
  const v = view(c);
  const { t } = v;
  const user = me(c);
  const id = c.req.param("id");
  const gate = await feedbackGate(c, id);
  if (gate.error) return gate.error;
  const body = await c.req.parseBody();
  const vals = {
    metNewPerson: str(body.metNewPerson),
    wouldMeetAgain: str(body.wouldMeetAgain),
    feltSafe: str(body.feltSafe),
    feltHeard: str(body.feltHeard),
    groupRating: str(body.groupRating),
    comment: str(body.comment),
    placeReach: str(body.placeReach),
    placeComfort: str(body.placeComfort),
  };
  const yn = (s: string) => (s === "yes" ? true : s === "no" ? false : undefined);
  const scale = (s: string) => (/^[1-5]$/.test(s) ? Number(s) : undefined);
  const met = yn(vals.metNewPerson);
  const again = yn(vals.wouldMeetAgain);
  const safe = scale(vals.feltSafe);
  const rating = scale(vals.groupRating);
  if (met === undefined || again === undefined || safe === undefined || rating === undefined || vals.comment.length > 500) {
    return page(
      c,
      { title: t("ความคิดเห็น", "Feedback"), tab: "mine", status: 400 },
      <FeedbackForm v={v} event={gate.event!} values={vals} error={t("ตอบให้ครบทุกข้อ (ความเห็นไม่เกิน 500 ตัวอักษร)", "Please answer every question (comment up to 500 characters).")} />,
    );
  }
  const data = { metNewPerson: met, wouldMeetAgain: again, feltSafe: safe, feltHeard: scale(vals.feltHeard) ?? null, groupRating: rating, comment: vals.comment };
  const db = getDb(c.env);
  // City Pulse place check (D66): research consent only, and only with the first feedback for this event
  // (the form offers it then). The answer is stored with the venue, district and month alone; nothing
  // records who answered or even whether you did.
  const reach = PLACE_REACH.some((o) => o.value === vals.placeReach) ? vals.placeReach : null;
  const comfort = PLACE_COMFORT.some((o) => o.value === vals.placeComfort) ? vals.placeComfort : null;
  if ((reach || comfort) && user.account.researchId && (await researchConsent(c, user.account.id))) {
    const [prev] = await db.select({ id: feedback.id }).from(feedback).where(and(eq(feedback.eventId, id), eq(feedback.accountId, user.account.id))).limit(1);
    if (!prev) {
      const ev = gate.event!;
      await db.insert(placeChecks).values({ id: newId(), venue: ev.venueName.trim().slice(0, 120), district: ev.district, reach, comfort, month: bkkMonth(new Date()) });
    }
  }
  await db
    .insert(feedback)
    .values({ id: newId(), eventId: id, accountId: user.account.id, ...data })
    .onConflictDoUpdate({ target: [feedback.eventId, feedback.accountId], set: data });
  // Felt unsafe: make reporting one tap away.
  if (safe <= 2) return c.redirect(`/report?event=${encodeURIComponent(id)}&from=feedback`);
  return c.redirect("/me/events?notice=thanks");
});

