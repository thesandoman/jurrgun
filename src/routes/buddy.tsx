/**
 * Bangkok Buddy (docs/BANGKOK-BUDDY.md).
 *
 *   GET  /buddy                    opt in, your buddy this week, the quest
 *   POST /buddy/optin              turn on / change what you're open to (private)
 *   POST /buddy/pause              stop new matches
 *   POST /buddy/:id/meet           say yes to this week's buddy
 *   POST /buddy/:id/pass           not this one (before both said yes)
 *   POST /buddy/:id/end            end an active buddy, no blame
 *   POST /buddy/:id/quest          "we did it": both tapping it stamps the district
 *   GET  /buddy/passport           your 50-district passport
 *
 * Hard rules, the same as People I Met:
 *  - Your "open to more" choice is never shown to your buddy. Romance only
 *    surfaces when both chose it, both are eligible and compatible, after two
 *    finished quests (domain/buddy.ts romanceUnlocked).
 *  - No messaging: once both say "meet", the pair becomes a connection in My
 *    Bangkok circle, where contact sharing, reporting and blocking already live.
 *  - Blocked either way, outside each other's age range or with no shared
 *    language: never matched.
 *  - Matching is a weekly clearinghouse round (domain/buddy.ts clearBuddies),
 *    run by the first /buddy visit of the week, so nothing runs on a timer.
 */
import { Hono, type Context } from "hono";
import { and, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { batch, getDb } from "../db";
import { BUDDY_INTENTS, clearBuddies, clickReason, isBuddyIntent, pickQuest, questText, romanceUnlocked, weekKey, type PoolMember } from "../domain/buddy";
import { ageOn, romanceCompatible, romanceEligible } from "../domain/rules";
import { DISTRICTS } from "../lib/constants";
import { newId } from "../lib/crypto";
import type { AppEnv } from "../lib/env";
import { L, type Lang } from "../lib/i18n";
import { audit, notify } from "../lib/records";
import { requireMember } from "../lib/session";
import { accounts, blocks, buddyMatches, buddyRounds, buddyOptins, buddyQuests, connections, passportStamps, profiles, vibes, type BuddyMatch, type BuddyQuest, type Profile } from "../schema";
import { Button, Card, Choices, LinkButton, Notice, page, str, view, type View } from "../ui/kit";
import { ARCHETYPES, isArchetypeKey, normalizeType, type ArchetypeKey } from "../vibe/archetypes";

export const buddyRoutes = new Hono<AppEnv>();
type Ctx = Context<AppEnv>;
type Db = ReturnType<typeof getDb>;
type Write = { toSQL(): { sql: string; params: unknown[] } };


const INTENT_OPTS = [
  { value: "friends", th: "เพื่อนใหม่", en: "New friends" },
  { value: "activity", th: "เพื่อนทำกิจกรรม", en: "An activity buddy" },
  { value: "open", th: "เปิดใจมากกว่าเพื่อน ถ้าทั้งคู่รู้สึกตรงกัน", en: "Open to more, only if it's mutual" },
] satisfies { value: (typeof BUDDY_INTENTS)[number]; th: string; en: string }[];

const districtName = (lang: Lang, key: string) => {
  const d = DISTRICTS.find((x) => x.value === key);
  return d ? (lang === "en" ? d.en : d.th) : key;
};

function isActiveAccount(a: { status: string; suspendedUntil: Date | null }, now = new Date()): boolean {
  if (a.status === "active") return true;
  return a.status === "suspended" && !!a.suspendedUntil && a.suspendedUntil.getTime() <= now.getTime();
}

const other = (m: Pick<BuddyMatch, "aAccount" | "bAccount">, me: string) => (m.aAccount === me ? m.bAccount : m.aAccount);
const side = (m: Pick<BuddyMatch, "aAccount">, me: string): "a" | "b" => (m.aAccount === me ? "a" : "b");

async function typeOfAccount(db: Db, ids: string[]): Promise<Map<string, ArchetypeKey>> {
  const out = new Map<string, ArchetypeKey>();
  if (!ids.length) return out;
  const rows = await db.select({ accountId: vibes.accountId, archetype: vibes.archetype, modifier: vibes.modifier, vector: vibes.vector }).from(vibes).where(inArray(vibes.accountId, ids)).limit(ids.length);
  for (const r of rows) {
    const { archetype } = normalizeType(r);
    if (isArchetypeKey(archetype)) out.set(r.accountId, archetype);
  }
  return out;
}

/** My current (not ended) match, newest first. */
async function currentMatch(db: Db, me: string): Promise<BuddyMatch | null> {
  const [m] = await db
    .select()
    .from(buddyMatches)
    .where(and(ne(buddyMatches.state, "ended"), or(eq(buddyMatches.aAccount, me), eq(buddyMatches.bAccount, me))))
    .orderBy(desc(buddyMatches.createdAt))
    .limit(1);
  return m ?? null;
}

const POOL_LIMIT = 1000;
const WEEK_MS = 7 * 86_400_000;

/**
 * This week's clearinghouse round (domain/buddy.ts clearBuddies), run by the
 * first /buddy visit of the week. Inserting the week's row is the lock, so it
 * runs once. Everyone opted in by then, without a current buddy, is matched
 * together; whoever joins later is in next week's round.
 */
export async function roundIfDue(env: AppEnv["Bindings"], now = new Date()): Promise<void> {
  const db = getDb(env);
  const week = weekKey(now);
  const [done] = await db.select({ week: buddyRounds.week }).from(buddyRounds).where(eq(buddyRounds.week, week)).limit(1);
  if (done) return;
  const claimed = await db.insert(buddyRounds).values({ week, method: "empty", pool: 0, pairs: 0, ranAt: now }).onConflictDoNothing().returning({ week: buddyRounds.week });
  if (!claimed.length) return;

  // A proposal nobody answered by the next round expires, so nobody waits forever.
  await db
    .update(buddyMatches)
    .set({ state: "ended", endedBy: "expired", endedAt: now })
    .where(and(eq(buddyMatches.state, "proposed"), ne(buddyMatches.week, week)));
  const optins = await db.select().from(buddyOptins).where(eq(buddyOptins.active, true)).orderBy(desc(buddyOptins.updatedAt)).limit(POOL_LIMIT);
  let ids = optins.map((o) => o.accountId);
  if (ids.length < 2) return;
  const [history, blockRows, people, types] = await Promise.all([
    db
      .select({ a: buddyMatches.aAccount, b: buddyMatches.bAccount, state: buddyMatches.state, endedAt: buddyMatches.endedAt })
      .from(buddyMatches)
      .where(or(inArray(buddyMatches.aAccount, ids), inArray(buddyMatches.bAccount, ids)))
      .limit(10_000),
    db
      .select({ blocker: blocks.blocker, blocked: blocks.blocked })
      .from(blocks)
      .where(or(inArray(blocks.blocker, ids), inArray(blocks.blocked, ids)))
      .limit(10_000),
    db.select({ account: accounts, profile: profiles }).from(accounts).innerJoin(profiles, eq(profiles.accountId, accounts.id)).where(inArray(accounts.id, ids)).limit(ids.length),
    typeOfAccount(db, ids),
  ]);
  const busy = new Set(history.filter((m) => m.state !== "ended").flatMap((m) => [m.a, m.b]));
  const excluded = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
  const lastEnded = new Map<string, number>();
  for (const m of history) {
    excluded.get(m.a)?.add(m.b);
    excluded.get(m.b)?.add(m.a);
    if (m.endedAt) for (const x of [m.a, m.b]) lastEnded.set(x, Math.max(lastEnded.get(x) ?? 0, m.endedAt.getTime()));
  }
  for (const b of blockRows) {
    excluded.get(b.blocker)?.add(b.blocked);
    excluded.get(b.blocked)?.add(b.blocker);
  }
  const since = new Map(optins.map((o) => [o.accountId, o.updatedAt.getTime()]));
  const pool: PoolMember[] = [];
  for (const { account, profile } of people) {
    const code = types.get(account.id);
    if (!code || busy.has(account.id) || !isActiveAccount(account, now) || !profile.onboardedAt) continue;
    const availableFrom = Math.max(since.get(account.id) ?? now.getTime(), lastEnded.get(account.id) ?? 0);
    pool.push({
      accountId: account.id,
      archetype: code,
      district: profile.district,
      languages: profile.languages,
      age: ageOn(profile.birthDate, now),
      ageMin: profile.ageMin,
      ageMax: profile.ageMax,
      excluded: excluded.get(account.id) ?? new Set(),
      weeksWaiting: Math.floor((now.getTime() - availableFrom) / WEEK_MS),
    });
  }
  ids = pool.map((p) => p.accountId);
  const result = clearBuddies(pool, week);
  const writes: Write[] = [db.update(buddyRounds).set({ method: result.method, pool: pool.length, pairs: result.pairs.length }).where(eq(buddyRounds.week, week))];
  for (const [a, b] of result.pairs) {
    writes.push(
      db.insert(buddyMatches).values({ id: newId(), aAccount: a, bAccount: b, week, state: "proposed", createdAt: now }),
      notify(db, a, "buddy_match", "คุณมีบัดดี้กรุงเทพฯ คนใหม่สัปดาห์นี้", "You have a new Bangkok Buddy this week", "/buddy"),
      notify(db, b, "buddy_match", "คุณมีบัดดี้กรุงเทพฯ คนใหม่สัปดาห์นี้", "You have a new Bangkok Buddy this week", "/buddy"),
    );
  }
  writes.push(audit(db, "system", "buddy.round", { type: "buddy_round", id: week }));
  await batch(env, writes);
}

/** This week's quest for an active match, created on first view. */
async function weekQuest(db: Db, m: BuddyMatch, types: Map<string, ArchetypeKey>, now: Date): Promise<BuddyQuest | null> {
  const week = weekKey(now);
  const [existing] = await db.select().from(buddyQuests).where(and(eq(buddyQuests.matchId, m.id), eq(buddyQuests.week, week))).limit(1);
  if (existing) return existing;
  const ta = types.get(m.aAccount);
  const tb = types.get(m.bAccount);
  if (!ta || !tb) return null;
  const stamps = await db
    .select({ district: passportStamps.district })
    .from(passportStamps)
    .where(inArray(passportStamps.accountId, [m.aAccount, m.bAccount]))
    .limit(200);
  const pick = pickQuest(m.id, week, [ta, tb], new Set(stamps.map((s: { district: string }) => s.district)));
  const quest: BuddyQuest = { id: newId(), matchId: m.id, week, scenario: pick.scenario, typeCode: pick.typeCode, district: pick.district, aDoneAt: null, bDoneAt: null, createdAt: now };
  await db.insert(buddyQuests).values(quest).onConflictDoNothing({ target: [buddyQuests.matchId, buddyQuests.week] });
  const [row] = await db.select().from(buddyQuests).where(and(eq(buddyQuests.matchId, m.id), eq(buddyQuests.week, week))).limit(1);
  return row ?? null;
}

// ------------------------------------------------------------------ views --

const SAFETY = (v: View) => (
  <details class="buddy-safety">
    <summary>🛡️ {v.t("ปลอดภัยไว้ก่อน", "Stay safe")}</summary>
    <ul>
      <li>{v.t("นัดเจอในที่สาธารณะเสมอ ทุกเควสต์อยู่ในที่สาธารณะ", "Always meet in public places. Every quest is in one.")}</li>
      <li>{v.t("สองครั้งแรกนัดช่วงกลางวันหรือหัวค่ำ", "Make the first two meetups daytime or early evening.")}</li>
      <li>{v.t("บอกเพื่อนหรือคนในบ้านว่าไปไหน กับใคร ด้วยปุ่มเช็กอินด้านล่าง", "Tell a friend where you're going and with whom, using the check-in button.")}</li>
      <li>{v.t("รู้สึกไม่สบายใจ ออกจากที่นั่นได้ทันที แล้วรายงานหรือบล็อกได้เสมอ", "If anything feels off, leave. You can always report or block.")}</li>
    </ul>
  </details>
);

function OptIn(props: { v: View; intent?: string; hasType: boolean }) {
  const { t, lang } = props.v;
  return (
    <Card>
      <h2>🤝 {t("หาบัดดี้กรุงเทพฯ", "Get a Bangkok Buddy")}</h2>
      <p>
        {t(
          "ทุกสัปดาห์เราจับคู่คุณกับหนึ่งคนที่ไทป์เข้ากันและอยู่ย่านใกล้กัน แล้วให้เควสต์ไปเที่ยวที่จริงในกรุงเทพฯ ทำเควสต์ครบ ได้แสตมป์เขตลงพาสปอร์ต 50 เขตของทั้งคู่",
          "Each week we pair you with one person whose type clicks with yours and who lives nearby, with a quest to a real Bangkok place. Finish it together and you both stamp that district in your 50-district passport.",
        )}
      </p>
      {!props.hasType ? (
        <>
          <Notice kind="info">{t("ทำแบบทดสอบไทป์กรุงเทพฯ ก่อน เพื่อจับคู่บัดดี้ที่เข้ากับคุณ", "Take the Bangkok Type quiz first, so we can find a buddy who clicks with you.")}</Notice>
          <LinkButton href="/quiz">{t("ทำแบบทดสอบ", "Take the quiz")}</LinkButton>
        </>
      ) : (
        <form method="post" action="/buddy/optin">
          <Choices
            legend={t("คุณเปิดรับอะไร (เป็นความลับ บัดดี้ไม่เห็น)", "What you're open to (private: your buddy never sees this)")}
            name="intent"
            type="radio"
            required
            options={INTENT_OPTS}
            values={[props.intent ?? "friends"]}
            lang={lang}
          />
          <p class="muted">
            {t(
              "บัดดี้จะเห็นชื่อเล่นและไทป์กรุงเทพฯ ของคุณ ความโรแมนติกจะขึ้นเฉพาะเมื่อทั้งคู่เลือก 'เปิดใจ' และทำเควสต์ด้วยกันครบสองครั้ง ถ้าไม่ตรงกัน จะไม่มีใครรู้",
              "Your buddy sees your nickname and Bangkok Type. Romance only comes up if you BOTH chose 'open to more' and finished two quests together. If not, nobody ever finds out.",
            )}
          </p>
          <Button>{props.intent ? t("บันทึก", "Save") : t("เริ่มเลย", "Start")}</Button>
        </form>
      )}
    </Card>
  );
}

function BuddyHeader(props: { v: View; nickname: string; theirs: ArchetypeKey | undefined; mine: ArchetypeKey | undefined }) {
  const { t, lang } = props.v;
  const a = props.theirs ? ARCHETYPES[props.theirs] : null;
  const why = props.theirs && props.mine ? clickReason(props.mine, props.theirs) : null;
  return (
    <div class="buddy-head">
      <span class="type-emoji" aria-hidden="true">{a?.emoji ?? "🙂"}</span>
      <div>
        <h2>{props.nickname}</h2>
        {a ? <p class="muted">{L(lang, a.name)} · {L(lang, a.tagline)}</p> : null}
        {why ? <p>🤝 {L(lang, why)}</p> : props.mine && props.theirs ? <p>✨ {t("ไทป์ต่างกัน เรื่องคุยไม่มีวันหมด", "Different types: you'll never run out of things to say.")}</p> : null}
      </div>
    </div>
  );
}

function QuestCard(props: { v: View; m: BuddyMatch; q: BuddyQuest; me: string; buddyName: string; types: Map<string, ArchetypeKey> }) {
  const { t, lang } = props.v;
  const text = questText(props.q);
  const mineDone = side(props.m, props.me) === "a" ? props.q.aDoneAt : props.q.bDoneAt;
  const theirsDone = side(props.m, props.me) === "a" ? props.q.bDoneAt : props.q.aDoneAt;
  const picker = ARCHETYPES[props.q.typeCode as ArchetypeKey];
  const place = districtName(lang, props.q.district);
  const shareText = t(
    `ฉันนัดเจอบัดดี้จาก Jurrgun (${props.buddyName}) ที่${place} จะทักหาเมื่อถึงบ้าน`,
    `I'm meeting my Jurrgun buddy (${props.buddyName}) in ${place}. I'll message you when I'm home.`,
  );
  const hostHref = `/host/new?district=${encodeURIComponent(props.q.district)}&title=${encodeURIComponent(text ? (lang === "en" ? text.en : text.th) : "")}`;
  return (
    <Card>
      <span class="eyebrow">{t("เควสต์สัปดาห์นี้", "This week's quest")}</span>
      {text ? (
        <h3>
          <span aria-hidden="true">{text.icon}</span> {L(lang, text)}
        </h3>
      ) : null}
      <p class="muted">
        📍 {place} · {picker ? t(`สไตล์${L(lang, picker.name)}`, `${L(lang, picker.name)}'s pick`) : null}
      </p>
      {mineDone && theirsDone ? (
        <Notice kind="ok">{t(`สำเร็จ! แสตมป์เขต${place}ลงพาสปอร์ตแล้ว`, `Done! ${place} is stamped in both your passports.`)}</Notice>
      ) : mineDone ? (
        <Notice kind="info">{t("คุณกดเสร็จแล้ว รอบัดดี้กดอีกคน", "You've marked it done. Waiting for your buddy.")}</Notice>
      ) : (
        <form method="post" action={`/buddy/${props.m.id}/quest`}>
          <Button>✅ {t("ไปมาแล้ว", "We did it")}</Button>
        </form>
      )}
      <div class="row">
        <button type="button" class="btn ghost" data-share={shareText}>
          📍 {t("เช็กอินกับเพื่อน", "Check in with a friend")}
        </button>
        <LinkButton href={hostHref} kind="ghost">
          🍽️ {t("ชวนคนอื่นมาเป็นโต๊ะ", "Make it a table")}
        </LinkButton>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.querySelectorAll("[data-share]").forEach(function(b){b.addEventListener("click",function(){var s=b.getAttribute("data-share");if(navigator.share){navigator.share({text:s}).catch(function(){})}else if(navigator.clipboard){navigator.clipboard.writeText(s);b.textContent="✓"}})})`,
        }}
      />
    </Card>
  );
}

function Passport(props: { v: View; stamped: Set<string>; compact?: boolean }) {
  const { t, lang } = props.v;
  return (
    <Card>
      <h2>
        🛂 {t("พาสปอร์ตกรุงเทพฯ", "Bangkok Passport")} <small class="muted">{props.stamped.size} / 50</small>
      </h2>
      <div class="passport-bar" role="img" aria-label={`${props.stamped.size} / 50`}>
        <i style={`width:${(props.stamped.size / 50) * 100}%`} />
      </div>
      {props.compact ? (
        <a href="/buddy/passport">{t("ดูทั้ง 50 เขต", "See all 50 districts")} →</a>
      ) : (
        <ul class="passport">
          {DISTRICTS.map((d) => (
            <li class={props.stamped.has(d.value) ? "on" : ""}>
              <span aria-hidden="true">{props.stamped.has(d.value) ? "✅" : "▫️"}</span> {lang === "en" ? d.en : d.th}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ----------------------------------------------------------------- routes --

buddyRoutes.get("/buddy", requireMember, async (c) => {
  const v = view(c);
  const { t } = v;
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const now = new Date();
  await roundIfDue(c.env, now);
  const [[optin], match] = await Promise.all([db.select().from(buddyOptins).where(eq(buddyOptins.accountId, me)).limit(1), currentMatch(db, me)]);
  const otherId = match ? other(match, me) : null;
  const [types, buddyRows, stamps] = await Promise.all([
    typeOfAccount(db, otherId ? [me, otherId] : [me]),
    otherId ? db.select({ nickname: profiles.nickname }).from(profiles).where(eq(profiles.accountId, otherId)).limit(1) : Promise.resolve([]),
    db.select({ district: passportStamps.district }).from(passportStamps).where(eq(passportStamps.accountId, me)).limit(60),
  ]);
  const stamped = new Set(stamps.map((s) => s.district));
  const buddyName = buddyRows[0]?.nickname ?? "";
  const quest = match?.state === "active" ? await weekQuest(db, match, types, now) : null;
  const iSaidMeet = match ? (side(match, me) === "a" ? match.aMeetAt : match.bMeetAt) : null;

  return page(
    c,
    { title: t("บัดดี้กรุงเทพฯ", "Bangkok Buddy"), tab: "me" },
    <>
      <h1>🤝 {t("บัดดี้กรุงเทพฯ", "Bangkok Buddy")}</h1>
      <p class="muted">{t("หนึ่งคน หนึ่งเมือง 50 เขต ไปสำรวจด้วยกันทีละสัปดาห์", "One person, one city, 50 districts. Explore it together, a week at a time.")}</p>
      {!optin || !optin.active ? (
        <OptIn v={v} intent={optin?.intent} hasType={types.has(me)} />
      ) : !match ? (
        <Card>
          <h2>⏳ {t("กำลังหาบัดดี้ให้คุณ", "Finding your buddy")}</h2>
          <p>
            {t(
              "เราจับคู่ทุกคนพร้อมกันสัปดาห์ละครั้ง ทุกวันจันทร์ ให้ทุกคนได้คู่ที่เข้ากันที่สุดอย่างยุติธรรม ไม่ใช่ใครมาก่อนได้ก่อน ถ้ายังไม่มีคนที่เข้ากันพอ ยิ่งรอ เกณฑ์จะค่อย ๆ ผ่อนลง เราจะแจ้งเตือนเมื่อมีบัดดี้",
              "Everyone is matched together once a week, on Monday, so each person gets the best fit fairly, not first come first served. If there's no good fit yet, the bar eases a little each week you wait. We'll notify you when you have a buddy.",
            )}
          </p>
        </Card>
      ) : match.state === "proposed" ? (
        <Card>
          <span class="eyebrow">{t("บัดดี้ของคุณสัปดาห์นี้", "Your buddy this week")}</span>
          <BuddyHeader v={v} nickname={buddyName} theirs={otherId ? types.get(otherId) : undefined} mine={types.get(me)} />
          <p>{t("ทั้งคู่ต้องกด 'นัดเจอ' ก่อน จึงจะเห็นโปรไฟล์ แชร์ช่องทางติดต่อ และได้เควสต์แรก", "You both need to tap 'Meet' to see each other's card, share a contact and get your first quest.")}</p>
          {iSaidMeet ? (
            <Notice kind="info">{t("คุณกดนัดเจอแล้ว รออีกฝ่าย", "You said meet. Waiting for your buddy.")}</Notice>
          ) : (
            <div class="row">
              <form method="post" action={`/buddy/${match.id}/meet`}>
                <Button>👋 {t("นัดเจอ", "Meet")}</Button>
              </form>
              <form method="post" action={`/buddy/${match.id}/pass`}>
                <Button kind="ghost">{t("ไม่ใช่คนนี้", "Not this one")}</Button>
              </form>
            </div>
          )}
        </Card>
      ) : (
        <>
          <Card>
            <span class="eyebrow">{t("บัดดี้ของคุณ", "Your buddy")}</span>
            <BuddyHeader v={v} nickname={buddyName} theirs={otherId ? types.get(otherId) : undefined} mine={types.get(me)} />
            <div class="row">
              <LinkButton href={`/people/${otherId}`} kind="ghost">{t("ดูโปรไฟล์", "See their card")}</LinkButton>
              <LinkButton href="/connections" kind="ghost">💬 {t("แชร์ช่องทางติดต่อ", "Share a contact")}</LinkButton>
            </div>
          </Card>
          {quest ? <QuestCard v={v} m={match} q={quest} me={me} buddyName={buddyName} types={types} /> : null}
          {SAFETY(v)}
          <div class="row">
            <form method="post" action={`/buddy/${match.id}/end`}>
              <Button kind="ghost">{t("ขอบคุณนะ ขอบัดดี้ใหม่", "Thanks, new buddy")}</Button>
            </form>
            <a href={`/report?account=${otherId}`}>{t("รายงาน", "Report")}</a>
            <form method="post" action={`/block/${otherId}`}>
              <input type="hidden" name="back" value="/buddy" />
              <Button kind="danger">{t("บล็อก", "Block")}</Button>
            </form>
          </div>
        </>
      )}
      <Passport v={v} stamped={stamped} compact />
      {optin?.active ? (
        <details>
          <summary>{t("ตั้งค่าบัดดี้", "Buddy settings")}</summary>
          <OptIn v={v} intent={optin.intent} hasType={types.has(me)} />
          <form method="post" action="/buddy/pause">
            <Button kind="ghost">{t("หยุดรับบัดดี้ใหม่", "Stop new buddies")}</Button>
          </form>
        </details>
      ) : null}
    </>,
  );
});

buddyRoutes.get("/buddy/passport", requireMember, async (c) => {
  const v = view(c);
  const db = getDb(c.env);
  const stamps = await db.select({ district: passportStamps.district }).from(passportStamps).where(eq(passportStamps.accountId, c.var.user!.account.id)).limit(60);
  return page(
    c,
    { title: v.t("พาสปอร์ตกรุงเทพฯ", "Bangkok Passport"), tab: "me" },
    <>
      <p>
        <a href="/buddy">← {v.t("บัดดี้กรุงเทพฯ", "Bangkok Buddy")}</a>
      </p>
      <Passport v={v} stamped={new Set(stamps.map((s) => s.district))} />
    </>,
  );
});

buddyRoutes.post("/buddy/optin", requireMember, async (c) => {
  const body = await c.req.parseBody();
  const intent = str(body.intent);
  if (!isBuddyIntent(intent)) return c.redirect("/buddy");
  const me = c.var.user!.account.id;
  const db = getDb(c.env);
  const now = new Date();
  await db
    .insert(buddyOptins)
    .values({ accountId: me, intent, active: true, updatedAt: now })
    .onConflictDoUpdate({ target: buddyOptins.accountId, set: { intent, active: true, updatedAt: now } });
  return c.redirect("/buddy?notice=saved");
});

buddyRoutes.post("/buddy/pause", requireMember, async (c) => {
  const me = c.var.user!.account.id;
  await getDb(c.env).update(buddyOptins).set({ active: false, updatedAt: new Date() }).where(eq(buddyOptins.accountId, me));
  return c.redirect("/buddy?notice=saved");
});

/** A match I'm part of, by id. */
async function myMatch(c: Ctx): Promise<{ m: BuddyMatch; me: string; them: string } | null> {
  const me = c.var.user!.account.id;
  const [m] = await getDb(c.env).select().from(buddyMatches).where(eq(buddyMatches.id, c.req.param("id") ?? "")).limit(1);
  if (!m || (m.aAccount !== me && m.bAccount !== me)) return null;
  return { m, me, them: other(m, me) };
}

buddyRoutes.post("/buddy/:id/meet", requireMember, async (c) => {
  const found = await myMatch(c);
  if (!found || found.m.state !== "proposed") return c.redirect("/buddy");
  const { m, me, them } = found;
  const db = getDb(c.env);
  const now = new Date();
  const mySide = side(m, me);
  const theyAgreed = mySide === "a" ? m.bMeetAt : m.aMeetAt;
  if (!theyAgreed) {
    await db
      .update(buddyMatches)
      .set(mySide === "a" ? { aMeetAt: now } : { bMeetAt: now })
      .where(and(eq(buddyMatches.id, m.id), eq(buddyMatches.state, "proposed")));
    return c.redirect("/buddy?notice=saved");
  }
  // Both said meet: they become a connection in My Bangkok circle.
  const connectionId = newId();
  await batch(c.env, [
    db
      .update(buddyMatches)
      .set({ ...(mySide === "a" ? { aMeetAt: now } : { bMeetAt: now }), state: "active", connectionId })
      .where(and(eq(buddyMatches.id, m.id), eq(buddyMatches.state, "proposed"))),
    db
      .insert(connections)
      .values({ id: connectionId, aAccount: m.aAccount, bAccount: m.bAccount, level: "activity", eventId: `buddy:${m.id}` })
      .onConflictDoNothing({ target: [connections.aAccount, connections.bAccount, connections.eventId] }),
    notify(db, me, "buddy_active", "คุณกับบัดดี้พร้อมออกสำรวจแล้ว ดูเควสต์แรกได้เลย", "You and your buddy are on! Your first quest is ready.", "/buddy"),
    notify(db, them, "buddy_active", "คุณกับบัดดี้พร้อมออกสำรวจแล้ว ดูเควสต์แรกได้เลย", "You and your buddy are on! Your first quest is ready.", "/buddy"),
    audit(db, me, "buddy.active", { type: "buddy_match", id: m.id }),
  ]);
  return c.redirect("/buddy?notice=connected");
});

async function endMatch(c: Ctx, allowed: string) {
  const found = await myMatch(c);
  if (!found || found.m.state !== allowed) return c.redirect("/buddy");
  const { m, me, them } = found;
  const db = getDb(c.env);
  await batch(c.env, [
    db.update(buddyMatches).set({ state: "ended", endedBy: me, endedAt: new Date() }).where(and(eq(buddyMatches.id, m.id), ne(buddyMatches.state, "ended"))),
    notify(db, them, "buddy_ended", "บัดดี้รอบนี้จบแล้ว สัปดาห์หน้ามีบัดดี้ใหม่", "This buddy match has ended. A new buddy comes next week.", "/buddy"),
    audit(db, me, allowed === "proposed" ? "buddy.pass" : "buddy.end", { type: "buddy_match", id: m.id }),
  ]);
  return c.redirect("/buddy?notice=done");
}

buddyRoutes.post("/buddy/:id/pass", requireMember, (c) => endMatch(c, "proposed"));
buddyRoutes.post("/buddy/:id/end", requireMember, (c) => endMatch(c, "active"));

buddyRoutes.post("/buddy/:id/quest", requireMember, async (c) => {
  const found = await myMatch(c);
  if (!found || found.m.state !== "active") return c.redirect("/buddy");
  const { m, me, them } = found;
  const db = getDb(c.env);
  const now = new Date();
  const [q] = await db.select().from(buddyQuests).where(and(eq(buddyQuests.matchId, m.id), eq(buddyQuests.week, weekKey(now)))).limit(1);
  if (!q) return c.redirect("/buddy");
  const mySide = side(m, me);
  if ((mySide === "a" ? q.aDoneAt : q.bDoneAt) !== null) return c.redirect("/buddy");
  const theyDone = mySide === "a" ? q.bDoneAt : q.aDoneAt;
  const mark = db
    .update(buddyQuests)
    .set(mySide === "a" ? { aDoneAt: now } : { bDoneAt: now })
    .where(and(eq(buddyQuests.id, q.id), mySide === "a" ? isNull(buddyQuests.aDoneAt) : isNull(buddyQuests.bDoneAt)));
  if (!theyDone) {
    await batch(c.env, [mark, notify(db, them, "buddy_quest", "บัดดี้กด 'ไปมาแล้ว' กดยืนยันเพื่อรับแสตมป์", "Your buddy marked the quest done. Confirm to get the stamp.", "/buddy")]);
    return c.redirect("/buddy?notice=saved");
  }
  // Both done: stamp the district for both.
  const writes: Write[] = [
    mark,
    db
      .insert(passportStamps)
      .values([m.aAccount, m.bAccount].map((accountId) => ({ id: newId(), accountId, district: q.district, source: "buddy", questId: q.id, createdAt: now })))
      .onConflictDoNothing({ target: [passportStamps.accountId, passportStamps.district] }),
    notify(db, them, "buddy_stamp", "ได้แสตมป์เขตใหม่ในพาสปอร์ตแล้ว", "New district stamped in your passport", "/buddy/passport"),
  ];
  // Romance only when both chose "open to more", both eligible and compatible, after two finished quests.
  const [intents, people, finished] = await Promise.all([
    db.select().from(buddyOptins).where(inArray(buddyOptins.accountId, [m.aAccount, m.bAccount])).limit(2),
    db.select().from(profiles).where(inArray(profiles.accountId, [m.aAccount, m.bAccount])).limit(2),
    db.select({ a: buddyQuests.aDoneAt, b: buddyQuests.bDoneAt, id: buddyQuests.id }).from(buddyQuests).where(eq(buddyQuests.matchId, m.id)).limit(60),
  ]);
  const finishedCount = finished.filter((f) => (f.id === q.id ? true : f.a && f.b)).length;
  const pa = people.find((p) => p.accountId === m.aAccount) as Profile | undefined;
  const pb = people.find((p) => p.accountId === m.bAccount) as Profile | undefined;
  const ia = intents.find((i) => i.accountId === m.aAccount)?.intent ?? "friends";
  const ib = intents.find((i) => i.accountId === m.bAccount)?.intent ?? "friends";
  if (
    m.connectionId &&
    pa &&
    pb &&
    romanceUnlocked({ intents: [ia, ib], eligible: [romanceEligible(pa), romanceEligible(pb)], compatible: romanceCompatible(pa, pb), finishedQuests: finishedCount })
  ) {
    const [conn] = await db.select({ level: connections.level }).from(connections).where(eq(connections.id, m.connectionId)).limit(1);
    if (conn && conn.level !== "romance") {
      writes.push(
        db.update(connections).set({ level: "romance" }).where(eq(connections.id, m.connectionId)),
        notify(db, m.aAccount, "buddy_mutual", "คุณทั้งคู่บอกว่าเปิดใจมากกว่าเพื่อน", "You both said you're open to more", "/connections"),
        notify(db, m.bAccount, "buddy_mutual", "คุณทั้งคู่บอกว่าเปิดใจมากกว่าเพื่อน", "You both said you're open to more", "/connections"),
      );
    }
  }
  await batch(c.env, writes);
  return c.redirect("/buddy?notice=stamped");
});
