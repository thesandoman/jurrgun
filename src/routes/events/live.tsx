/**
 * Events, live part (split from routes/events.tsx, Core Platform C3: a pure move).
 * See ./index.ts for the route list.
 */
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../../db";
import { romanceEligible } from "../../domain/rules";
import { SIGNALS, label, values } from "../../lib/constants";
import { requireMember } from "../../lib/session";
import { accounts, profiles, registrations } from "../../schema";
import { ResidentTag, showsResidentBadge, TypeSpark, vibesFor } from "../people";
import { Button, Card, Choices, Empty, Field, LinkButton, Notice, page, str, Tag, view } from "../../ui/kit";
import { eventRoutes } from "./app";
import { BuddyBox, buddyNicknames, forbidden, myRegistration, notFound, visibleEvent } from "./detail";
import { blockedWith, me, title } from "./shared";
import type { Ctx } from "./shared";

// ---------------------------------------------------------------- live --

export async function checkedInRegistration(c: Ctx, id: string) {
  const user = me(c);
  const db = getDb(c.env);
  const event = await visibleEvent(c, id);
  if (!event) return { event: null, reg: null };
  const reg = await myRegistration(db, id, user.account.id);
  return { event, reg: reg && reg.status === "confirmed" && reg.checkedInAt ? reg : null };
}

function signalOptions(eligible: boolean) {
  return SIGNALS.filter((s) => s.value !== "open_to_spark" || eligible);
}

eventRoutes.get("/events/:id/live", requireMember, async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const user = me(c);
  const id = c.req.param("id");
  const db = getDb(c.env);
  const { event, reg } = await checkedInRegistration(c, id);
  if (!event) return notFound(c);
  if (!reg) return forbidden(c, "หน้านี้เปิดหลังจากโฮสต์เช็กอินให้คุณแล้ว", "This page opens once your host has checked you in.", `/events/${id}`);
  const eligible = romanceEligible(user.profile);

  let mates: { accountId: string; nickname: string; pronouns: string | null; signal: string | null; topics: string[]; resident: boolean }[] = [];
  if (event.groupsPublishedAt && reg.groupNo !== null) {
    const rows = await db
      .select({
        accountId: registrations.accountId,
        signal: registrations.socialSignal,
        topics: registrations.signalTopics,
        nickname: profiles.nickname,
        pronouns: profiles.pronouns,
        showPronouns: profiles.showPronouns,
        showResidentBadge: profiles.showResidentBadge,
        bkkRegistered: accounts.bkkRegistered,
      })
      .from(registrations)
      .innerJoin(profiles, eq(profiles.accountId, registrations.accountId))
      .innerJoin(accounts, eq(accounts.id, registrations.accountId))
      .where(
        and(
          eq(registrations.eventId, id),
          eq(registrations.groupNo, reg.groupNo),
          eq(registrations.status, "confirmed"),
          ne(registrations.accountId, user.account.id),
        ),
      )
      .limit(50);
    const hidden = await blockedWith(db, user.account.id, rows.map((r) => r.accountId));
    mates = rows
      .filter((r) => !hidden.has(r.accountId))
      .map((r) => ({
        accountId: r.accountId,
        resident: showsResidentBadge(r, r),
        nickname: r.nickname,
        pronouns: r.showPronouns ? r.pronouns : null,
        // Never show romance signals to someone who isn't romance-eligible.
        signal: r.signal === "open_to_spark" && !eligible ? null : r.signal,
        topics: r.topics ?? [],
      }));
  }
  const [buddies, vibeMap] = await Promise.all([
    buddyNicknames(db, event, user.account.id),
    vibesFor(db, [...mates.map((m) => m.accountId), user.account.id]),
  ]);
  const myVibe = vibeMap.get(user.account.id);
  const opts = [{ value: "", th: "ไม่เลือก", en: "No signal" }, ...signalOptions(eligible)];

  return page(
    c,
    { title: t("ในงาน", "Live"), tab: "mine" },
    <>
      <h1>{title(event, lang)}</h1>
      <p class="muted">{t("เช็กอินแล้ว ขอให้สนุกนะ", "You're checked in. Enjoy!")}</p>

      <Card>
        <h2>{t("โต๊ะของฉัน", "My table")}</h2>
        {/* A private talk never lists who else is there (D52). */}
        {event.groupsPublishedAt && reg.groupNo !== null && !event.talkMode ? (
          <>
            <p>
              <Tag tone="accent">{t(`โต๊ะ ${reg.groupNo}`, `Table ${reg.groupNo}`)}</Tag>
            </p>
            {mates.length === 0 ? (
              <Empty>{t("ยังไม่มีใครอื่นที่โต๊ะของคุณ", "No one else at your table yet.")}</Empty>
            ) : (
              <ul class="people">
                {mates.map((m) => (
                  <li class="person">
                    <span class="avatar" aria-hidden="true">{m.nickname.slice(0, 1).toUpperCase()}</span>
                    <span>
                      <a href={`/people/${m.accountId}`}>
                        <strong>{m.nickname}</strong>
                      </a>
                      {m.pronouns ? <small> ({m.pronouns})</small> : null}
                      {m.resident ? (
                        <>
                          {" "}
                          <ResidentTag v={v} />
                        </>
                      ) : null}
                      <TypeSpark v={v} theirs={vibeMap.get(m.accountId)} mine={myVibe} />
                      {m.signal ? (
                        <>
                          {" "}
                          <Tag tone={m.signal === "open_to_spark" ? "love" : undefined}>{label(SIGNALS, m.signal, lang)}</Tag>
                        </>
                      ) : null}
                      {m.topics.length ? <small> {m.topics.join(" · ")}</small> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p class="muted">{t("โฮสต์จะจัดกลุ่มหลังปิดเช็กอิน", "Your host will announce groups once check-in closes.")}</p>
        )}
      </Card>

      {event.activePrompt ? (
        <Card class="prompt">
          <h2>💡 {t("คำถามชวนคุยจากโฮสต์", "Icebreaker from your host")}</h2>
          <p>{event.activePrompt}</p>
        </Card>
      ) : null}

      <BuddyBox names={buddies} event={event} t={t} />

      <Card>
        <h2>{t("สัญญาณทักทายของฉัน", "My social signal")}</h2>
        <p class="muted">{t("ไม่บังคับ เปลี่ยนได้ตลอด คนที่โต๊ะจะเห็น", "Optional and easy to change. Your table can see it.")}</p>
        <form method="post" action={`/events/${id}/signal`}>
          <Choices legend={t("เลือกสัญญาณ", "Pick a signal")} name="signal" type="radio" options={opts} values={[reg.socialSignal ?? ""]} lang={lang} />
          <Field
            label={t("คุยกับฉันเรื่อง… (คั่นด้วยจุลภาค ไม่เกิน 3 เรื่อง)", "Talk to me about (comma-separated, up to 3)")}
            name="signalTopics"
            value={(reg.signalTopics ?? []).join(", ")}
            maxlength={100}
          />
          <Button>{t("บันทึก", "Save")}</Button>
        </form>
      </Card>

      <Card>
        <h2>🛟 {t("ความปลอดภัย", "Safety")}</h2>
        {event.safetyInfo ? <p>{event.safetyInfo}</p> : null}
        <p>
          {t("ติดต่อฉุกเฉิน: ", "Emergency contact: ")}
          <strong>{event.emergencyContact || "1555"}</strong>
        </p>
        <p class="muted">
          {t("ไม่สบายใจ? บอกโฮสต์ได้ทันที หรือ", "Feeling uncomfortable? Tell your host any time, or")} <a href="/report">{t("รายงาน", "make a report")}</a>
        </p>
      </Card>
    </>,
  );
});

eventRoutes.post("/events/:id/signal", requireMember, async (c) => {
  const { t } = view(c);
  const user = me(c);
  const id = c.req.param("id");
  const db = getDb(c.env);
  const { event, reg } = await checkedInRegistration(c, id);
  if (!event) return notFound(c);
  if (!reg) return forbidden(c, "ตั้งสัญญาณได้หลังเช็กอิน", "You can set a signal after check-in.", `/events/${id}`);
  const body = await c.req.parseBody();
  const signal = str(body.signal);
  const bad = (th: string, en: string) =>
    page(
      c,
      { title: t("ในงาน", "Live"), tab: "mine", status: 400 },
      <>
        <Notice kind="error">{t(th, en)}</Notice>
        <LinkButton href={`/events/${id}/live`} kind="ghost">{t("← กลับ", "← Back")}</LinkButton>
      </>,
    );
  if (signal && !values(signalOptions(romanceEligible(user.profile))).includes(signal)) {
    return bad("เลือกสัญญาณนี้ไม่ได้", "That signal isn't available.");
  }
  const topics = str(body.signalTopics)
    .split(/[,،、，]/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (topics.length > 3 || topics.some((x) => x.length > 30)) {
    return bad("หัวข้อได้สูงสุด 3 เรื่อง เรื่องละไม่เกิน 30 ตัวอักษร", "Up to 3 topics, 30 characters each.");
  }
  await db
    .update(registrations)
    .set({ socialSignal: signal || null, signalTopics: topics.length ? topics : null })
    .where(eq(registrations.id, reg.id));
  return c.redirect(`/events/${id}/live?notice=saved`);
});

