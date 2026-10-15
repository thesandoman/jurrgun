/**
 * The weekly plan, "hands-free" (rules in src/domain/plan.ts).
 *
 *   GET  /plan                 this week's two picks, and pitches from my buddy and circle
 *   POST /plan/accept          take a pick (then RSVP on the event, or go to the quest)
 *   POST /plan/skip            skip this week, with a reason (feeds M&E, never shown to anyone)
 *   POST /plan/pitch           pitch my own plan to my buddy or circle
 *   POST /plan/pitch/:id/join  "I'm in"
 *
 * The plan is made once a week, on the first visit (like buddy rounds), and
 * kept, so it doesn't reshuffle every time the page loads.
 */
import { Hono, type Context } from "hono";
import { and, count, desc, eq, gt, gte, inArray, isNull, lt, ne, or } from "drizzle-orm";
import { getDb } from "../db";
import { weekKey } from "../domain/buddy";
import { isSkipReason, pickPlan, SKIP_REASONS, type PlanEvent } from "../domain/plan";
import { ageOn, romanceEligible } from "../domain/rules";
import { budgetMax, cleanBio, TIME_WINDOWS } from "../content/profile";
import { DISTRICTS, districtsAZ, EVENT_TAGS, label } from "../lib/constants";
import { newId } from "../lib/crypto";
import type { AppEnv } from "../lib/env";
import { fmtDate, L } from "../lib/i18n";
import { notify } from "../lib/records";
import { requireMember } from "../lib/session";
import { buddyMatches, buddyQuests, connections, contactShares, events, passportStamps, pitchJoins, planPitches, profiles, registrations, vibes, weeklyPlans, type Event } from "../schema";
import { SEAT_STATUSES } from "../services/events";
import { ARCHETYPES, isArchetypeKey } from "../vibe/archetypes";
import { Button, Card, Field, LinkButton, Notice, page, Select, str, view, type View } from "../ui/kit";

export const planRoutes = new Hono<AppEnv>();
planRoutes.use("/plan", requireMember);
planRoutes.use("/plan/*", requireMember);

type C = Context<AppEnv>;
type Db = ReturnType<typeof getDb>;
const DAY = 86_400_000;
const WHAT_MAX = 80;
const WHEN_MAX = 40;

/** My circle: people I'm connected with, plus my current buddy. */
async function circleOf(db: Db, me: string): Promise<{ ids: string[]; buddy: string | null; matchId: string | null }> {
  const [conns, [match]] = await Promise.all([
    db
      .select({ a: connections.aAccount, b: connections.bAccount })
      .from(connections)
      .where(and(or(eq(connections.aAccount, me), eq(connections.bAccount, me)), isNull(connections.removedAt)))
      .limit(200),
    db
      .select()
      .from(buddyMatches)
      .where(and(or(eq(buddyMatches.aAccount, me), eq(buddyMatches.bAccount, me)), eq(buddyMatches.state, "active")))
      .limit(1),
  ]);
  const buddy = match ? (match.aAccount === me ? match.bAccount : match.aAccount) : null;
  const ids = [...new Set([...conns.map((x) => (x.a === me ? x.b : x.a)), ...(buddy ? [buddy] : [])])];
  return { ids, buddy, matchId: match?.id ?? null };
}

/** This week's plan, made on first visit. */
async function planFor(c: C) {
  const db = getDb(c.env);
  const user = c.var.user!;
  const me = user.account.id;
  const now = new Date();
  const week = weekKey(now);
  const [existing] = await db.select().from(weeklyPlans).where(and(eq(weeklyPlans.accountId, me), eq(weeklyPlans.week, week))).limit(1);
  if (existing) return existing;

  const p = user.profile!;
  const bio = cleanBio(p.bio);
  const [circle, [vibe], upcoming, mine] = await Promise.all([
    circleOf(db, me),
    db.select({ archetype: vibes.archetype }).from(vibes).where(eq(vibes.accountId, me)).limit(1),
    db
      .select()
      .from(events)
      .where(and(eq(events.status, "published"), eq(events.visibility, "public"), gt(events.startsAt, now), lt(events.startsAt, new Date(now.getTime() + 14 * DAY))))
      .limit(200),
    db.select({ eventId: registrations.eventId }).from(registrations).where(eq(registrations.accountId, me)).limit(500),
  ]);
  const ids = upcoming.map((e) => e.id);
  const [taken, friends, quest] = await Promise.all([
    ids.length
      ? db.select({ eventId: registrations.eventId, n: count() }).from(registrations).where(and(inArray(registrations.eventId, ids), inArray(registrations.status, [...SEAT_STATUSES]))).groupBy(registrations.eventId).limit(ids.length)
      : [],
    ids.length && circle.ids.length
      ? db.select({ eventId: registrations.eventId, n: count() }).from(registrations).where(and(inArray(registrations.eventId, ids), inArray(registrations.accountId, circle.ids), inArray(registrations.status, ["confirmed", "offered", "waitlisted"]))).groupBy(registrations.eventId).limit(ids.length)
      : [],
    circle.matchId
      ? db.select().from(buddyQuests).where(and(eq(buddyQuests.matchId, circle.matchId), eq(buddyQuests.week, week))).limit(1)
      : [],
  ]);
  const takenOf = new Map(taken.map((x) => [x.eventId, Number(x.n)]));
  const friendsOf = new Map(friends.map((x) => [x.eventId, Number(x.n)]));
  const already = new Set(mine.map((x) => x.eventId));
  const code = vibe && isArchetypeKey(vibe.archetype) ? vibe.archetype : null;
  const typeDistricts = code ? ARCHETYPES[code].hangouts.map((h) => h.district) : [];
  const cands: PlanEvent[] = upcoming
    .filter((e) => !already.has(e.id))
    .map((e: Event) => ({
      id: e.id,
      tags: e.tags,
      district: e.district,
      costThb: e.costThb,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      languages: e.languages,
      intensity: e.intensity,
      groupMax: e.groupMax,
      ageMin: e.ageMin,
      ageMax: e.ageMax,
      seatsLeft: e.capacity - (takenOf.get(e.id) ?? 0),
      friendsGoing: friendsOf.get(e.id) ?? 0,
    }));
  const q = quest[0];
  const questTodo = q && !(q.aDoneAt && q.bDoneAt) ? { id: q.id } : null;
  const picks = pickPlan(
    {
      id: me,
      age: ageOn(p.birthDate, now),
      district: p.district,
      languages: p.languages,
      interests: p.interests,
      typeDistricts,
      activities: bio.activities ?? [],
      budgetMax: budgetMax(bio.budget),
      times: bio.times ?? [],
      access: bio.access ?? [],
      energy: bio.energy,
      groupSize: bio.groupSize,
      socialEnergy: bio.socialEnergy,
      gender: p.gender,
      romance: romanceEligible(p),
    },
    cands,
    now,
    questTodo,
  ).map((x) => ({ kind: x.kind, ref: x.ref, reasons: x.reasons }));
  await db.insert(weeklyPlans).values({ id: newId(), accountId: me, week, picks }).onConflictDoNothing();
  const [row] = await db.select().from(weeklyPlans).where(and(eq(weeklyPlans.accountId, me), eq(weeklyPlans.week, week))).limit(1);
  return row;
}

/** A pick's reasons in plain words. */
function reasonText(v: View, r: string): string {
  const { t, lang } = v;
  const [key, arg] = r.split(":");
  switch (key) {
    case "likes":
      return t(`คุณชอบ${label(EVENT_TAGS, arg, "th")}`, `You like ${label(EVENT_TAGS, arg, "en").toLowerCase()}`);
    case "near":
      return t(`ใกล้บ้าน (${label(DISTRICTS, arg, "th")})`, `Near you (${label(DISTRICTS, arg, "en")})`);
    case "type_spot":
      return t(`${label(DISTRICTS, arg, "th")} เข้ากับไทป์ของคุณ`, `${label(DISTRICTS, arg, "en")} suits your Bangkok Type`);
    case "free":
      return t("ฟรี", "Free");
    case "budget":
      return t(`อยู่ในงบ (฿${arg})`, `In your budget (฿${arg})`);
    case "time":
      return t(`${label(TIME_WINDOWS, arg, "th")} คุณว่าง`, `${label(TIME_WINDOWS, arg, "en")} work for you`);
    case "friends":
      return t(`คนรู้จักของคุณไป ${arg} คน`, `${arg} from your circle going`);
    case "step_free":
      return t("ไม่มีขั้นบันได", "Step-free");
    case "short":
      return t("ไม่เกิน 90 นาที", "90 minutes or less");
    case "calm":
      return t("บรรยากาศชิล ๆ", "Calm and easy");
    case "lively":
      return t("คึกคัก", "Lively");
    case "small":
    case "table":
      return t("ขนาดกลุ่มที่คุณชอบ", "Your kind of group size");
    case "buddy":
      return t("เควสต์กับบัดดี้สัปดาห์นี้", "This week's quest with your buddy");
    default:
      return lang === "en" ? r : r;
  }
}

planRoutes.get("/plan", async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const now = new Date();
  const plan = await planFor(c);
  const eventIds = plan.picks.filter((x) => x.kind === "event").map((x) => x.ref);
  const [evs, circle, lastWeek] = await Promise.all([
    eventIds.length ? db.select().from(events).where(inArray(events.id, eventIds)).limit(2) : [],
    circleOf(db, me),
    db.select({ status: weeklyPlans.status }).from(weeklyPlans).where(and(eq(weeklyPlans.accountId, me), ne(weeklyPlans.week, plan.week))).orderBy(desc(weeklyPlans.createdAt)).limit(1),
  ]);
  const evOf = new Map(evs.map((e) => [e.id, e]));
  // Pitches from my buddy and circle this past week, and my own.
  const authors = [me, ...circle.ids];
  const pitches = await db
    .select({ p: planPitches, nickname: profiles.nickname })
    .from(planPitches)
    .innerJoin(profiles, eq(profiles.accountId, planPitches.accountId))
    .where(and(inArray(planPitches.accountId, authors), gte(planPitches.createdAt, new Date(now.getTime() - 7 * DAY))))
    .orderBy(desc(planPitches.createdAt))
    .limit(20);
  const visible = pitches.filter(({ p }) => p.accountId === me || p.audience === "circle" || (p.audience === "buddy" && p.accountId === circle.buddy));
  const joins = visible.length
    ? await db.select().from(pitchJoins).where(inArray(pitchJoins.pitchId, visible.map((x) => x.p.id))).limit(500)
    : [];
  const restHint = plan.status === "skipped" && lastWeek[0]?.status === "skipped";
  const bio = cleanBio(c.var.user!.profile!.bio);
  const askEnergy = !bio.energyAt || now.getTime() - Date.parse(bio.energyAt) > 30 * DAY;
  const lowTwice = bio.socialEnergy === "low" && bio.energyPrev === "low";
  return page(
    c,
    { title: t("แผนสัปดาห์นี้", "This week's plan"), tab: "events" },
    <>
      <h1>🗓️ {t("แผนสัปดาห์นี้", "This week's plan")}</h1>
      <p class="muted">{t("เราเลือกให้ 2 อย่างจากสิ่งที่คุณบอกไว้ ไม่ต้องไล่ดูทั้งหมด ไม่ต้องเพอร์เฟกต์ก็สนุกได้", "Two picks made for you from what you told us. No scrolling needed: good enough is great.")}</p>
      {askEnergy ? (
        <Card class="hint energy">
          <strong>🔋 {t("เดือนนี้พลังโซเชียลของคุณเป็นยังไง?", "How's your social energy this month?")}</strong>
          <p class="muted">{t("เป็นความลับ เราใช้ปรับแผนให้เหมาะกับคุณ", "Private. We use it to fit your plan to you.")}</p>
          <form method="post" action="/plan/energy" class="row">
            <button class="btn ghost" name="energy" value="low">🪫 {t("น้อย", "Low")}</button>
            <button class="btn ghost" name="energy" value="okay">🔋 {t("กลาง ๆ", "Okay")}</button>
            <button class="btn ghost" name="energy" value="full">⚡ {t("เต็มที่", "Full")}</button>
          </form>
        </Card>
      ) : null}
      {bio.socialEnergy === "low" ? (
        <Notice kind="info">
          {t("พลังน้อย: เราเลือกแผนที่ใกล้กว่า เล็กกว่า และสั้นกว่าให้ จะพักก่อนก็ได้นะ", "Low energy: we picked closer, smaller, shorter plans. Resting is fine too.")}
        </Notice>
      ) : null}
      {lowTwice ? (
        <Card class="hint">
          <strong>💚 {t("เหนื่อยมาสักพักแล้ว", "It's been a heavy stretch")}</strong>
          <p class="muted">
            {t("ถ้าอยากมีคนคุยด้วย โทรสายด่วนสุขภาพจิต 1323 ได้ตลอด 24 ชม. หรืออ่านคู่มือเรื่องความเหงา", "If you'd like someone to talk to, the mental health line 1323 is open 24 hours, or read our guide on loneliness.")}
          </p>
          <p class="row">
            <a class="btn ghost" href="tel:1323">📞 1323</a>
            <a class="btn ghost" href="/learn/loneliness-and-mental-health">{t("อ่านคู่มือ", "Read the guide")}</a>
          </p>
        </Card>
      ) : null}
      {plan.status === "accepted" ? <Notice kind="ok">{t("เยี่ยมเลย แล้วเจอกันที่นั่นนะ", "Lovely. See you there.")}</Notice> : null}
      {plan.status === "skipped" ? <Notice kind="info">{t("ข้ามสัปดาห์นี้แล้ว ไม่เป็นไรเลย", "Skipped this week. That's fine.")}</Notice> : null}
      {restHint ? (
        <Card class="hint">
          <strong>🌿 {t("อยากพักสักสัปดาห์ไหม?", "Fancy a rest week?")}</strong>
          <p class="muted">{t("ข้ามมา 2 สัปดาห์ติดแล้ว พักได้นะ คนรู้จักของคุณยังอยู่ตรงนี้", "Two skips in a row. Taking a break is fine; your circle stays.")}</p>
          <LinkButton href="/settings/habits" kind="ghost">{t("พัก Jurrgun", "Take a break")}</LinkButton>
        </Card>
      ) : null}
      {plan.picks.length === 0 ? (
        <Notice kind="info">{t("สัปดาห์นี้ยังไม่มีอะไรที่ตรงกับคุณ ลองเพิ่มสิ่งที่ชอบในโปรไฟล์ หรือเสนอแผนเองด้านล่าง", "Nothing fits you this week yet. Add meetup preferences to your profile, or pitch your own below.")}</Notice>
      ) : (
        <div class="plan-picks">
          {plan.picks.map((pk, i) => {
            const e = pk.kind === "event" ? evOf.get(pk.ref) : null;
            if (pk.kind === "event" && !e) return null;
            return (
              <Card class={`plan-pick ${plan.acceptedRef === pk.ref ? "on" : ""}`}>
                <span class="eyebrow">{t(`ตัวเลือกที่ ${i + 1}`, `Pick ${i + 1}`)}</span>
                <h2 style="margin:4px 0">{e ? (lang === "en" ? (e.titleEn ?? e.title) : e.title) : t("🗺️ เควสต์กับบัดดี้", "🗺️ Quest with your buddy")}</h2>
                {e ? (
                  <p class="muted">
                    {fmtDate(e.startsAt, lang)} · 📍 {label(DISTRICTS, e.district, lang)} · {e.costThb > 0 ? `฿${e.costThb}` : t("ฟรี", "Free")}
                  </p>
                ) : null}
                <p class="chips2">
                  {pk.reasons.map((r) => (
                    <span>✓ {reasonText(v, r)}</span>
                  ))}
                </p>
                {plan.status === "open" ? (
                  <form method="post" action="/plan/accept">
                    <input type="hidden" name="ref" value={pk.ref} />
                    <Button>{t("ไปอันนี้", "I'll go")}</Button>
                  </form>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
      {plan.status === "open" ? (
        <details class="how">
          <summary>{t("สัปดาห์นี้ข้ามก่อน", "Skip this week")}</summary>
          <form method="post" action="/plan/skip" class="row">
            {SKIP_REASONS.map((r) => (
              <button class="btn ghost" name="reason" value={r}>
                {L(lang, SKIP_TEXT[r])}
              </button>
            ))}
          </form>
        </details>
      ) : null}

      <h2>💡 {t("ตัวเลือกที่ 3: เสนอแผนเอง", "Pick 3: pitch your own")}</h2>
      <Card>
        <form method="post" action="/plan/pitch">
          <Field label={t("ทำอะไร", "What")} name="what" maxlength={WHAT_MAX} required placeholder={t("เช่น เดินตลาดน้ำตอนเช้า", "e.g. A morning floating-market walk")} />
          <Select label={t("ย่าน", "Where")} name="district" options={districtsAZ(lang)} value={c.var.user!.profile!.district} lang={lang} required />
          <Field label={t("เมื่อไหร่", "When")} name="when" maxlength={WHEN_MAX} required placeholder={t("เช่น เสาร์เช้า", "e.g. Saturday morning")} />
          <Select
            label={t("ชวนใคร", "Who")}
            name="audience"
            options={[
              ...(circle.buddy ? [{ value: "buddy", th: "บัดดี้ของฉัน", en: "My buddy" }] : []),
              { value: "circle", th: "คนรู้จักของฉัน", en: "My circle" },
            ]}
            value={circle.buddy ? "buddy" : "circle"}
            lang={lang}
            required
          />
          <Button kind="ghost">{t("ส่งไอเดีย", "Send pitch")}</Button>
        </form>
      </Card>
      {visible.length ? (
        <>
          <h3>🙌 {t("ไอเดียจากคนรู้จักของคุณ", "Pitches from your circle")}</h3>
          {visible.map(({ p, nickname }) => {
            const going = joins.filter((j) => j.pitchId === p.id);
            const iJoined = going.some((j) => j.accountId === me);
            return (
              <Card>
                <strong>{p.what}</strong>
                <p class="muted">
                  {p.accountId === me ? t("ของคุณ", "Yours") : nickname} · 📍 {label(DISTRICTS, p.district, lang)} · {p.whenText} · {t(`ไป ${going.length} คน`, `${going.length} in`)}
                </p>
                {p.accountId !== me && !iJoined ? (
                  <form method="post" action={`/plan/pitch/${p.id}/join`}>
                    <Button kind="ghost">{t("ไปด้วย", "I'm in")}</Button>
                  </form>
                ) : null}
              </Card>
            );
          })}
        </>
      ) : null}
    </>,
  );
});

const SKIP_TEXT: Record<string, { th: string; en: string }> = {
  time: { th: "ไม่มีเวลา", en: "No time" },
  money: { th: "งบไม่พอ", en: "Money's tight" },
  distance: { th: "ไกลไป", en: "Too far" },
  mood: { th: "ไม่มีอารมณ์", en: "Not in the mood" },
  other: { th: "อื่น ๆ", en: "Other" },
};

planRoutes.post("/plan/accept", async (c) => {
  const plan = await planFor(c);
  const ref = str((await c.req.parseBody()).ref);
  const pick = plan.picks.find((x) => x.ref === ref);
  if (!pick || plan.status !== "open") return c.redirect("/plan");
  await getDb(c.env).update(weeklyPlans).set({ status: "accepted", acceptedRef: ref, decidedAt: new Date() }).where(eq(weeklyPlans.id, plan.id));
  return c.redirect(pick.kind === "event" ? `/events/${ref}` : "/buddy");
});

planRoutes.post("/plan/skip", async (c) => {
  const plan = await planFor(c);
  const reason = str((await c.req.parseBody()).reason);
  if (!isSkipReason(reason) || plan.status !== "open") return c.redirect("/plan");
  await getDb(c.env).update(weeklyPlans).set({ status: "skipped", skipReason: reason, decidedAt: new Date() }).where(eq(weeklyPlans.id, plan.id));
  return c.redirect("/plan");
});

planRoutes.post("/plan/pitch", async (c) => {
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const body = await c.req.parseBody();
  const what = str(body.what).slice(0, WHAT_MAX);
  const whenText = str(body.when).slice(0, WHEN_MAX);
  const district = str(body.district);
  const audience = str(body.audience) === "buddy" ? "buddy" : "circle";
  if (!what || !whenText || !DISTRICTS.some((d) => d.value === district)) return c.redirect("/plan");
  const circle = await circleOf(db, me);
  const to = audience === "buddy" ? (circle.buddy ? [circle.buddy] : []) : circle.ids;
  const week = weekKey(new Date());
  // One pitch at a time per week keeps it intentional.
  const [mine] = await db.select({ n: count() }).from(planPitches).where(and(eq(planPitches.accountId, me), eq(planPitches.week, week)));
  if (Number(mine?.n ?? 0) >= 2) return c.redirect("/plan");
  await db.insert(planPitches).values({ id: newId(), accountId: me, week, what, district, whenText, audience });
  const nick = c.var.user!.profile!.nickname;
  for (const id of to.slice(0, 50)) await notify(db, id, "pitch", `${nick} ชวนไป: ${what}`, `${nick} pitched: ${what}`, "/plan");
  return c.redirect("/plan");
});

planRoutes.post("/plan/pitch/:id/join", async (c) => {
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const [p] = await db.select().from(planPitches).where(eq(planPitches.id, c.req.param("id"))).limit(1);
  if (!p || p.accountId === me) return c.redirect("/plan");
  const circle = await circleOf(db, me);
  const allowed = p.audience === "circle" ? circle.ids.includes(p.accountId) : circle.buddy === p.accountId;
  if (!allowed) return c.redirect("/plan");
  await db.insert(pitchJoins).values({ pitchId: p.id, accountId: me }).onConflictDoNothing();
  await notify(db, p.accountId, "pitch", `${c.var.user!.profile!.nickname} ไปด้วย: ${p.what}`, `${c.var.user!.profile!.nickname} is in: ${p.what}`, "/plan");
  return c.redirect("/plan");
});

/** Monthly social-energy check-in (self only). It shapes the weekly plan, never anyone's view of you. */
planRoutes.post("/plan/energy", async (c) => {
  const energy = str((await c.req.parseBody()).energy);
  if (!["low", "okay", "full"].includes(energy)) return c.redirect("/plan");
  const user = c.var.user!;
  const bio = cleanBio(user.profile!.bio);
  const db = getDb(c.env);
  await db
    .update(profiles)
    .set({ bio: { ...bio, energyPrev: bio.socialEnergy, socialEnergy: energy, energyAt: new Date().toISOString() }, updatedAt: new Date() })
    .where(eq(profiles.accountId, user.account.id));
  // Re-pick this week's plan with the new energy, if it hasn't been decided yet.
  await db.delete(weeklyPlans).where(and(eq(weeklyPlans.accountId, user.account.id), eq(weeklyPlans.week, weekKey(new Date())), eq(weeklyPlans.status, "open")));
  return c.redirect("/plan");
});

/** "Your month in people": who you met and where, never minutes on the app. */
planRoutes.get("/me/month", requireMember, async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const since = new Date(Date.now() - 30 * DAY);
  const [went, conns, shared, stamps] = await Promise.all([
    db
      .select({ district: events.district })
      .from(registrations)
      .innerJoin(events, eq(events.id, registrations.eventId))
      .where(and(eq(registrations.accountId, me), gte(registrations.checkedInAt, since)))
      .limit(100),
    db
      .select({ id: connections.id })
      .from(connections)
      .where(and(or(eq(connections.aAccount, me), eq(connections.bAccount, me)), gte(connections.createdAt, since)))
      .limit(200),
    db.select({ id: contactShares.id }).from(contactShares).where(and(eq(contactShares.accountId, me), gte(contactShares.createdAt, since))).limit(200),
    db.select({ district: passportStamps.district }).from(passportStamps).where(and(eq(passportStamps.accountId, me), gte(passportStamps.createdAt, since))).limit(60),
  ]);
  const places = [...new Set([...went.map((x) => x.district), ...stamps.map((x) => x.district)])];
  const tiles: [string, number, string][] = [
    ["🍽️", went.length, t("โต๊ะที่ได้ไปนั่ง", "Tables you sat at")],
    ["🫂", conns.length, t("คนรู้จักใหม่", "New people in your circle")],
    ["💬", shared.length, t("คนที่ยังคุยกันต่อ", "People you kept in touch with")],
    ["📍", places.length, t("ย่านที่ได้ไป", "Districts you explored")],
  ];
  return page(
    c,
    { title: t("เดือนนี้ของฉัน", "My month in people"), tab: "me" },
    <>
      <h1>🌱 {t("เดือนนี้ คุณได้เจอใครบ้าง", "Your month, in people")}</h1>
      <p class="muted">{t("30 วันที่ผ่านมา เรานับคนและสถานที่ ไม่นับเวลาที่อยู่หน้าจอ", "The last 30 days. We count people and places, never time on screen.")}</p>
      <div class="stats month">
        {tiles.map(([e, n, label]) => (
          <div class="fact">
            <b aria-hidden="true">{e}</b>
            <span class="big-n">{n}</span>
            <small>{label}</small>
          </div>
        ))}
      </div>
      {places.length ? (
        <p class="chips2">
          {places.map((d) => (
            <span>📍 {label(DISTRICTS, d, lang)}</span>
          ))}
        </p>
      ) : null}
      <Card class="hint">
        <strong>{went.length === 0 ? t("เดือนหน้าลองสักโต๊ะไหม?", "Try one table next month?") : t("เยี่ยมเลย ใช้ชีวิตนอกจอต่อไปนะ", "Lovely. Keep living off-screen.")}</strong>
        <p class="row">
          <LinkButton href="/plan">{t("แผนสัปดาห์นี้", "This week's plan")}</LinkButton>
        </p>
      </Card>
    </>,
  );
});
