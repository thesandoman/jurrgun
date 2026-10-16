/**
 * Bangkok Buddy (docs/BANGKOK-BUDDY.md).
 *
 *   GET  /buddy                    opt in, your buddy this week, the quest
 *   POST /buddy/optin              turn on / change what you're open to (private)
 *   POST /buddy/pause              stop new matches
 *   POST /buddy/:id/meet           say yes to this week's buddy
 *   POST /buddy/:id/pass           not this one (before both said yes)
 *   POST /buddy/:id/end            wrap up kindly (no ghosting): agree to a wrap-up,
 *                                  end at once if both moved off the app, or ask (7-day notice)
 *   POST /buddy/:id/keep           take back my own wrap-up request
 *   POST /buddy/:id/quest          "we did it" (weekly quest or the monthly big quest):
 *                                  both tapping it stamps the district
 *   GET  /buddy/passport           your 50-district passport
 *
 * Hard rules, the same as People I Met:
 *  - Bangkok Buddy is friends only for now (owner, Phase 2A). Older opt-ins
 *    stored as "open" or "dating" still load, and count as friends: they
 *    don't steer matching and never unlock romance. A mutual
 *    "เกี่ยวก้อย · Pinky" mode will come later as its own feature.
 *  - No messaging: once both say "meet", the pair becomes a connection in My
 *    Bangkok circle, where contact sharing, reporting and blocking already live.
 *  - Blocked either way, outside each other's age range or with no shared
 *    language: never matched.
 *  - Matching is a daily clearinghouse round (domain/buddy.ts clearBuddies),
 *    run by the first /buddy visit of the day, so nothing runs on a timer.
 *    Quests stay weekly, plus one themed big quest a month (domain/seasons.ts).
 *  - No ghosting: an active pairing ends only when both agree, when both have
 *    shared a contact (they moved off the app), or after a kind wrap-up note
 *    and WRAP_NOTICE_DAYS. Blocking ends it at once (safety first).
 */
import { SafeArrivalForm } from "./safety";
import { ALL_INTERESTS, ENERGY, WEEKEND_RHYTHM, cleanBio } from "../content/profile";
import { canHost } from "../domain/hosting";
import { Hono, type Context } from "hono";
import { and, desc, eq, inArray, isNotNull, isNull, lt, ne, or } from "drizzle-orm";
import { batch, getDb } from "../db";
import {
  BUDDY_INTENTS,
  PROPOSAL_DAYS,
  WRAP_NOTES,
  WRAP_NOTICE_DAYS,
  clearBuddies,
  clickReason,
  dayKey,
  deckFor,
  isBuddyIntent,
  isWrapNote,
  pickQuest,
  questText,
  weekKey,
  type PoolMember,
} from "../domain/buddy";
import { monthKey, seasonQuestFor } from "../domain/seasons";
import { ageOn, isPaused } from "../domain/rules";
import { DISTRICTS, districtsAZ } from "../lib/constants";
import { newId } from "../lib/crypto";
import type { AppEnv } from "../lib/env";
import { fmtDay, L, type Lang } from "../lib/i18n";
import { audit, notify } from "../lib/records";
import { requireMember } from "../lib/session";
import { accounts, blocks, buddyMatches, buddySwipes, meetFeedback, buddyRounds, buddyOptins, buddyQuests, connections, contactShares, passportStamps, profiles, vibes, type BuddyMatch, type BuddyQuest } from "../schema";
import { Button, Card, Choices, LinkButton, Notice, page, str, view, type View } from "../ui/kit";
import { AvatarStack, Bento, Big, Pill, PostcardFan, Stamps, Tile, artFor } from "../ui/visual";
import type { Child } from "hono/jsx";
import { ARCHETYPES, isArchetypeKey, normalizeType, type ArchetypeKey } from "../vibe/archetypes";

export const buddyRoutes = new Hono<AppEnv>();
type Ctx = Context<AppEnv>;
type Db = ReturnType<typeof getDb>;
type Write = { toSQL(): { sql: string; params: unknown[] } };


const INTENT_OPTS = [
  { value: "friends", th: "เพื่อนใหม่", en: "New friends" },
  { value: "activity", th: "เพื่อนทำกิจกรรม", en: "An activity buddy" },
] satisfies { value: (typeof BUDDY_INTENTS)[number]; th: string; en: string }[];

/**
 * What a stored intent means today: friends only. "open" and "dating" rows
 * from before Phase 2A read as "friends"; nothing romantic follows from them.
 */
const friendlyIntent = (x: string | undefined): "friends" | "activity" => (x === "activity" ? "activity" : "friends");

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
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Today's clearinghouse round (domain/buddy.ts clearBuddies), run by the
 * first /buddy visit of the day (Bangkok time). Inserting the day's row in
 * social_buddy_rounds (its `week` column holds the round key) is the lock, so
 * it runs once. Everyone opted in, without a current buddy, is matched
 * together in one fair batch; Bangkok is big enough that a daily pool is large.
 */
export async function roundIfDue(env: AppEnv["Bindings"], now = new Date()): Promise<void> {
  const db = getDb(env);
  const round = dayKey(now);
  const week = weekKey(now);
  const [done] = await db.select({ week: buddyRounds.week }).from(buddyRounds).where(eq(buddyRounds.week, round)).limit(1);
  if (done) return;
  const claimed = await db.insert(buddyRounds).values({ week: round, method: "empty", pool: 0, pairs: 0, ranAt: now }).onConflictDoNothing().returning({ week: buddyRounds.week });
  if (!claimed.length) return;

  // A proposal neither answered closes after PROPOSAL_DAYS, so nobody waits forever.
  await db
    .update(buddyMatches)
    .set({ state: "ended", endedBy: "expired", endReason: "expired", endedAt: now })
    .where(and(eq(buddyMatches.state, "proposed"), lt(buddyMatches.createdAt, new Date(now.getTime() - PROPOSAL_DAYS * DAY_MS))));
  // A kind wrap-up with no reply closes after WRAP_NOTICE_DAYS: the other buddy was told, so it isn't ghosting.
  const lapsed = await db
    .select()
    .from(buddyMatches)
    .where(and(eq(buddyMatches.state, "active"), isNotNull(buddyMatches.endRequestedAt), lt(buddyMatches.endRequestedAt, new Date(now.getTime() - WRAP_NOTICE_DAYS * DAY_MS))))
    .limit(500);
  if (lapsed.length) {
    await batch(env, [
      db
        .update(buddyMatches)
        .set({ state: "ended", endReason: "notice", endedAt: now })
        .where(inArray(buddyMatches.id, lapsed.map((m) => m.id))),
      ...lapsed.flatMap((m) =>
        [m.aAccount, m.bAccount].map((x) => notify(db, x, "buddy_ended", "บัดดี้รอบนี้ปิดลงแบบดี ๆ แล้ว เราจะหาบัดดี้ใหม่ให้เร็ว ๆ นี้", "Your buddy pairing has wrapped up kindly. A new match is coming soon.", "/buddy")),
      ),
    ]);
  }
  const pool = await loadPool(db, now);
  if (pool.length < 2) return;
  const result = clearBuddies(pool, round);
  const writes: Write[] = [db.update(buddyRounds).set({ method: result.method, pool: pool.length, pairs: result.pairs.length }).where(eq(buddyRounds.week, round))];
  for (const [a, b] of result.pairs) {
    writes.push(
      db.insert(buddyMatches).values({ id: newId(), aAccount: a, bAccount: b, week, state: "proposed", createdAt: now }),
      notify(db, a, "buddy_match", "คุณมีบัดดี้กรุงเทพฯ คนใหม่แล้ว", "You have a new Bangkok Buddy", "/buddy"),
      notify(db, b, "buddy_match", "คุณมีบัดดี้กรุงเทพฯ คนใหม่แล้ว", "You have a new Bangkok Buddy", "/buddy"),
    );
  }
  writes.push(audit(db, "system", "buddy.round", { type: "buddy_round", id: round }));
  await batch(env, writes);
}

/**
 * Everyone available for a buddy right now (opted in, no current buddy, an
 * active onboarded account with a Bangkok Type), with what they told us:
 * blocks, past buddies and their deck picks.
 *
 * Friends only for now: a stored "open" or "dating" intent no longer limits
 * who someone is paired with, and private dating prefs don't score pairs
 * (PoolMember.datesWith and datingPrefs stay unset). A mutual
 * "เกี่ยวก้อย · Pinky" mode will come later and decide that on its own.
 */
async function loadPool(db: Db, now: Date): Promise<PoolMember[]> {
  const optins = await db.select().from(buddyOptins).where(eq(buddyOptins.active, true)).orderBy(desc(buddyOptins.updatedAt)).limit(POOL_LIMIT);
  const ids = optins.map((o) => o.accountId);
  if (ids.length < 2) return [];
  const [history, blockRows, people, types, swipes] = await Promise.all([
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
    db.select({ accountId: buddySwipes.accountId, targetId: buddySwipes.targetId, choice: buddySwipes.choice }).from(buddySwipes).where(inArray(buddySwipes.accountId, ids)).limit(50_000),
  ]);
  const busy = new Set(history.filter((m) => m.state !== "ended").flatMap((m) => [m.a, m.b]));
  const excluded = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
  const lastEnded = new Map<string, number>();
  for (const m of history) {
    excluded.get(m.a)?.add(m.b);
    excluded.get(m.b)?.add(m.a);
    if (m.endedAt) for (const x of [m.a, m.b]) lastEnded.set(x, Math.max(lastEnded.get(x) ?? 0, m.endedAt.getTime()));
  }
  // The deck: "not now" (stored as pass) rules someone out; "I'd meet them" (keen) ranks them higher.
  const keen = new Map<string, Set<string>>();
  for (const sw of swipes) {
    if (sw.choice === "pass") excluded.get(sw.accountId)?.add(sw.targetId);
    else if (sw.choice === "keen") {
      if (!keen.has(sw.accountId)) keen.set(sw.accountId, new Set());
      keen.get(sw.accountId)!.add(sw.targetId);
    }
  }
  for (const b of blockRows) {
    excluded.get(b.blocker)?.add(b.blocked);
    excluded.get(b.blocked)?.add(b.blocker);
  }
  const since = new Map(optins.map((o) => [o.accountId, o.updatedAt.getTime()]));
  const pool: PoolMember[] = [];
  for (const { account, profile } of people) {
    const code = types.get(account.id);
    if (!code || busy.has(account.id) || !isActiveAccount(account, now) || !profile.onboardedAt || isPaused(profile, now)) continue;
    const availableFrom = Math.max(since.get(account.id) ?? now.getTime(), lastEnded.get(account.id) ?? 0);
    // The reservation bar eases weekly (domain/buddy.ts reservation), even though rounds are daily.
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
      keen: keen.get(account.id),
      gender: profile.gender,
      womenOnly: profile.womenOnly,
    });
  }
  return pool;
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
  return saveQuest(db, { id: newId(), matchId: m.id, week, scenario: pick.scenario, typeCode: pick.typeCode, district: pick.district, aDoneAt: null, bDoneAt: null, createdAt: now });
}

/** This month's themed big quest (domain/seasons.ts), created on first view. */
async function monthQuest(db: Db, m: BuddyMatch, now: Date): Promise<BuddyQuest | null> {
  const key = monthKey(now);
  const season = seasonQuestFor(key);
  if (!season) return null;
  const [existing] = await db.select().from(buddyQuests).where(and(eq(buddyQuests.matchId, m.id), eq(buddyQuests.week, key))).limit(1);
  if (existing) return existing;
  return saveQuest(db, { id: newId(), matchId: m.id, week: key, scenario: "season", typeCode: String(season.month), district: season.district, aDoneAt: null, bDoneAt: null, createdAt: now });
}

async function saveQuest(db: Db, quest: BuddyQuest): Promise<BuddyQuest | null> {
  await db.insert(buddyQuests).values(quest).onConflictDoNothing({ target: [buddyQuests.matchId, buddyQuests.week] });
  const [row] = await db.select().from(buddyQuests).where(and(eq(buddyQuests.matchId, quest.matchId), eq(buddyQuests.week, quest.week))).limit(1);
  return row ?? null;
}

/** Both buddies have shared a contact in the circle: the friendship can carry on off the app. */
async function movedOffApp(db: Db, m: BuddyMatch): Promise<boolean> {
  if (!m.connectionId) return false;
  const rows = await db.select({ accountId: contactShares.accountId }).from(contactShares).where(eq(contactShares.connectionId, m.connectionId)).limit(4);
  return [m.aAccount, m.bAccount].every((x) => rows.some((r) => r.accountId === x));
}

/** Season badges: monthly big quests I finished with any buddy. */
async function seasonBadges(db: Db, me: string): Promise<{ key: string; icon: string; theme: { en: string; th: string } }[]> {
  const matches = await db
    .select({ id: buddyMatches.id })
    .from(buddyMatches)
    .where(or(eq(buddyMatches.aAccount, me), eq(buddyMatches.bAccount, me)))
    .limit(500);
  if (!matches.length) return [];
  const done = await db
    .select({ week: buddyQuests.week })
    .from(buddyQuests)
    .where(and(inArray(buddyQuests.matchId, matches.map((m) => m.id)), eq(buddyQuests.scenario, "season"), isNotNull(buddyQuests.aDoneAt), isNotNull(buddyQuests.bDoneAt)))
    .limit(200);
  const out = new Map<string, { key: string; icon: string; theme: { en: string; th: string } }>();
  for (const d of done) {
    const sq = seasonQuestFor(d.week);
    if (sq) out.set(d.week, { key: d.week, icon: sq.icon, theme: sq.theme });
  }
  return [...out.values()].sort((a, b) => a.key.localeCompare(b.key));
}

// ------------------------------------------------------------------ views --

const SAFETY = (v: View) => (
  <details class="buddy-safety">
    <summary>🛡️ {v.t("ปลอดภัยไว้ก่อน", "Stay safe")}</summary>
    <ul>
      <li>{v.t("นัดเจอในที่สาธารณะเสมอ ทุกเควสต์อยู่ในที่สาธารณะ", "Always meet in public places. Every quest is in one.")}</li>
      <li>{v.t("สองครั้งแรกนัดช่วงกลางวันหรือหัวค่ำ", "Make the first two meetups daytime or early evening.")}</li>
      <li>{v.t("บอกเพื่อนหรือคนในบ้านว่าไปไหน กับใคร ด้วยปุ่มเช็กอินด้านล่าง", "Tell a friend where you're going and with whom, using the check-in button.")}</li>
      <li>{v.t("ถ้ารู้สึกไม่สบายใจ ออกมาได้ทันที แล้วรายงานหรือบล็อกได้ตลอด", "If anything feels off, leave. You can always report or block.")}</li>
    </ul>
  </details>
);

function OptIn(props: { v: View; intent?: string; hasType: boolean; compact?: boolean }) {
  const { t, lang } = props.v;
  return (
    <>
      {props.compact ? null : (
        <Bento>
          <Tile size="wide" tone="deep">
            <AvatarStack items={[{ label: "You", emoji: "🙂", seed: "you" }, { label: "?", emoji: "❔", seed: "q" }]} size={54} />
            <h2>{t("หาบัดดี้กรุงเทพฯ", "Get a Bangkok Buddy")}</h2>
          </Tile>
          <Tile>
            <span class="ico" aria-hidden="true">🗺️</span>
            <Big n="52" label={t("เควสต์ต่อปี", "quests a year")} />
          </Tile>
          <Tile tone="gold">
            <span class="ico" aria-hidden="true">🎏</span>
            <Big n="12" label={t("เควสต์เทศกาลต่อปี", "festival quests")} />
          </Tile>
        </Bento>
      )}
      {!props.hasType ? (
        <Card>
          <Notice kind="info">{t("ทำแบบทดสอบไทป์กรุงเทพฯ ก่อน", "Take the Bangkok Type quiz first.")}</Notice>
          <LinkButton href="/quiz">🧭 {t("ทำแบบทดสอบ", "Take the quiz")}</LinkButton>
        </Card>
      ) : (
        <Card>
          <form method="post" action="/buddy/optin">
            <Choices
              legend={t("อยากได้บัดดี้แบบไหน 🔒", "What kind of buddy 🔒")}
              hint={t("เป็นความลับ บัดดี้ไม่เห็น", "Private: your buddy never sees this")}
              name="intent"
              type="radio"
              required
              options={INTENT_OPTS}
              values={[friendlyIntent(props.intent)]}
              lang={lang}
            />
            <details class="how">
              <summary>{t("ใช้งานยังไง", "How it works")}</summary>
              <ul>
                <li>👀 {t("บัดดี้เห็นชื่อเล่นและไทป์ของคุณ", "Your buddy sees your nickname and type.")}</li>
                <li>🤝 {t("บัดดี้คือเพื่อนที่ออกไปสำรวจเมืองด้วยกัน", "A buddy is a friend to explore the city with.")}</li>
                <li>🤝 {t("ไม่หายเงียบ: ปิดได้เมื่อตกลงกัน ย้ายไปคุยนอกแอป หรือส่งข้อความปิดท้าย (7 วัน)", "No ghosting: end by agreeing, moving off the app, or a kind wrap-up (7 days).")}</li>
                <li>🛡️ <a href="/safety">{t("ตัวช่วยความปลอดภัย", "Safety net")}</a></li>
              </ul>
            </details>
            <Button>{props.intent ? t("บันทึก", "Save") : t("เริ่มเลย", "Start")}</Button>
          </form>
        </Card>
      )}
    </>
  );
}

/** Your buddy as a layered card: both types' avatars overlapping, name, and why you click. */
function BuddyCard(props: { v: View; nickname: string; theirs: ArchetypeKey | undefined; mine: ArchetypeKey | undefined; eyebrow: string; children?: Child }) {
  const { t, lang } = props.v;
  const a = props.theirs ? ARCHETYPES[props.theirs] : null;
  const mine = props.mine ? ARCHETYPES[props.mine] : null;
  const why = props.theirs && props.mine ? clickReason(props.mine, props.theirs) : null;
  return (
    <div class="stack-card">
      <Tile tone="deep">
        <Pill dot>{props.eyebrow}</Pill>
        <AvatarStack
          items={[
            { label: mine ? L(lang, mine.name) : "You", emoji: mine?.emoji ?? "🙂", seed: props.mine ?? "me" },
            { label: a ? L(lang, a.name) : props.nickname, emoji: a?.emoji ?? "🙂", seed: props.theirs ?? "them" },
          ]}
          size={58}
        />
        <h2>{props.nickname}</h2>
        {a ? <small>{L(lang, a.name)}</small> : null}
        {why ? <small>🤝 {L(lang, why)}</small> : mine && a ? <small>✨ {t("ไทป์ต่างกัน คุยไม่มีวันหมด", "Different types, endless conversation")}</small> : null}
        {props.children}
      </Tile>
    </div>
  );
}

function QuestCard(props: { v: View; m: BuddyMatch; q: BuddyQuest; me: string; buddyName: string; types: Map<string, ArchetypeKey> }) {
  const { t, lang } = props.v;
  const season = props.q.scenario === "season" ? seasonQuestFor(props.q.week) : null;
  const text = season ? { ...season.quest, icon: season.icon } : questText(props.q);
  const mineDone = side(props.m, props.me) === "a" ? props.q.aDoneAt : props.q.bDoneAt;
  const theirsDone = side(props.m, props.me) === "a" ? props.q.bDoneAt : props.q.aDoneAt;
  const picker = ARCHETYPES[props.q.typeCode as ArchetypeKey];
  const place = districtName(lang, props.q.district);
  const caption = { en: districtName("en", props.q.district), th: districtName("th", props.q.district) };
  const ta = ARCHETYPES[props.types.get(props.m.aAccount) as ArchetypeKey];
  const tb = ARCHETYPES[props.types.get(props.m.bAccount) as ArchetypeKey];
  const cards = [
    artFor(props.q.district + "a", ta?.emoji ?? "🙂"),
    { ...artFor(props.q.district, text?.icon ?? "📍", caption), tone: season ? ("evening" as const) : artFor(props.q.district, "").tone },
    artFor(props.q.district + "b", tb?.emoji ?? "🙂"),
  ];
  const shareText = t(
    `ฉันนัดเจอบัดดี้จาก Jurrgun (${props.buddyName}) ที่${place} ถึงบ้านแล้วจะทักไปบอกนะ`,
    `I'm meeting my Jurrgun buddy (${props.buddyName}) in ${place}. I'll message you when I'm home.`,
  );
  const hostHref = `/host/new?district=${encodeURIComponent(props.q.district)}&title=${encodeURIComponent(text ? (lang === "en" ? text.en : text.th) : "")}`;
  return (
    <Card class={season ? "quest season" : "quest"}>
      <span class="eyebrow">{season ? t(`${season.icon} เควสต์ใหญ่เดือนนี้ · ${season.theme.th}`, `${season.icon} This month · ${season.theme.en}`) : t("🗺️ เควสต์สัปดาห์นี้", "🗺️ This week's quest")}</span>
      <PostcardFan cards={cards} lang={lang} />
      {text ? <h3 class="quest-title">{L(lang, text)}</h3> : null}
      <p class="chips2">
        <span>📍 {place}</span>
        {season ? <span>🗓️ {t("แสตมป์ประจำฤดู", "Season stamp")}</span> : picker ? <span>{picker.emoji} {t(`สไตล์${L(lang, picker.name)}`, `${L(lang, picker.name)}'s pick`)}</span> : null}
        <span>{mineDone ? "✅" : "⬜"} {t("คุณ", "You")}</span>
        <span>{theirsDone ? "✅" : "⬜"} {props.buddyName}</span>
      </p>
      {mineDone && theirsDone ? (
        <>
          <Notice kind="ok">{t(`สำเร็จ! ได้แสตมป์${place}แล้ว`, `Done! ${place} stamped.`)}</Notice>
          <LinkButton href={`/buddy/quest/${props.q.id}/feedback`} kind="ghost">
            📝 {t("เจอกันเป็นยังไงบ้าง (ส่วนตัว)", "How was the meet? (private)")}
          </LinkButton>
        </>
      ) : mineDone ? null : (
        <form method="post" action={`/buddy/${props.m.id}/quest`}>
          <input type="hidden" name="quest" value={props.q.week} />
          <Button>✅ {t("ไปมาแล้ว", "We did it")}</Button>
        </form>
      )}
      <div class="acts">
        <button type="button" class="btn ghost" data-share={shareText}>
          📍 {t("เช็กอิน", "Check in")}
        </button>
        {props.v.user && canHost(props.v.user.account, true) ? (
          <LinkButton href={hostHref} kind="ghost">
            🍽️ {t("ชวนคนอื่นมาร่วมโต๊ะ", "Make it a table")}
          </LinkButton>
        ) : null}
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.querySelectorAll("[data-share]").forEach(function(b){if(b.dataset.ready)return;b.dataset.ready=1;b.addEventListener("click",function(){var s=b.getAttribute("data-share");if(navigator.share){navigator.share({text:s}).catch(function(){})}else if(navigator.clipboard){navigator.clipboard.writeText(s);b.textContent="✓"}})})`,
        }}
      />
    </Card>
  );
}

/**
 * "Phra Nakhon" → "PN", "Chatuchak" → "CHA". Every district gets its own code:
 * Bang Kapi, Bang Khae and Bang Khen would all be "BK", so later ones take a
 * letter or two more from the last word ("BKh", "BKn").
 */
const SHORT_NAMES: Map<string, string> = (() => {
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const d of [...DISTRICTS].sort((a, b) => a.value.localeCompare(b.value))) {
    const words = d.en.split(/\s+/).filter(Boolean);
    const last = words[words.length - 1];
    const head = words.slice(0, -1).map((w) => w[0]).join("");
    const tries = words.length > 1 ? [words.map((w) => w[0]).join("").slice(0, 3), head + last.slice(0, 2), head + last[0] + last[last.length - 1], head + last.slice(0, 3)] : [d.en.slice(0, 3), d.en.slice(0, 4)];
    const code = tries.find((x) => !used.has(x)) ?? d.en.slice(0, 5);
    used.add(code);
    out.set(d.en, code);
  }
  return out;
})();
const shortName = (en: string) => SHORT_NAMES.get(en) ?? en.slice(0, 3);

/**
 * Thai stamps show Thai initials (owner card): the first consonant of a common
 * prefix (บาง, คลอง, ลาด...) and of the rest, so บางกะปิ → บก, ปทุมวัน → ปท,
 * with a consonant more where two would match.
 */
const TH_PREFIX = ["บาง", "คลอง", "ลาด", "หนอง", "ทุ่ง", "ดอน", "ห้วย", "สะพาน", "ราษฎร์", "ภาษี", "ป้อม", "บึง", "มีน", "สาย", "ประ", "ราช", "สาม", "วัง", "พระ", "ดิน", "จอม", "ตลิ่ง", "ทวี", "ยาน", "สวน", "หลัก", "คัน"];
const SHORT_TH: Map<string, string> = (() => {
  const consonants = (x: string) => x.replace(/[^\u0E01-\u0E2E]/g, "");
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const d of [...DISTRICTS].sort((a, b) => a.value.localeCompare(b.value))) {
    const all = consonants(d.th);
    const pre = TH_PREFIX.find((x) => d.th.startsWith(x) && d.th.length > x.length + 1);
    const rest = pre ? consonants(d.th.slice(pre.length)) : "";
    const tries = pre ? [consonants(pre)[0] + rest[0], consonants(pre)[0] + rest.slice(0, 2), all.slice(0, 3)] : [all.slice(0, 2), all[0] + all[2], all.slice(0, 3)];
    const code = tries.find((x) => x && !x.includes("undefined") && !used.has(x)) ?? all.slice(0, 4);
    used.add(code);
    out.set(d.value, code);
  }
  return out;
})();

/**
 * The passport as a quiet memory map (owner, Phase 2A): it leads with the
 * districts you have been to, with a plain "so far" line in small text. No
 * progress ring, no big number, no medal, and stamps land without a show.
 */
function Passport(props: {
  v: View;
  stamped: Set<string>;
  compact?: boolean;
  badges?: { key: string; icon: string; theme: { en: string; th: string } }[];
  /** Districts the member hasn't been to yet ("My Bangkok" reflections from the quiz). */
  wish?: string[];
}) {
  const { t, lang } = props.v;
  const items = districtsAZ(lang).map((d) => ({ key: d.value, short: lang === "en" ? shortName(d.en) : SHORT_TH.get(d.value) ?? d.th.slice(0, 2), name: lang === "en" ? d.en : d.th, on: props.stamped.has(d.value) }));
  const been = items.filter((x) => x.on);
  const shown = props.compact ? been.slice(0, 8) : been;
  const wish = new Set((props.wish ?? []).filter((d) => !props.stamped.has(d)));
  const next = items.filter((x) => wish.has(x.key));
  const nextLine = next.length ? (
    <p class="chips2" aria-label={t("อยากไปสำรวจ", "Next to explore")}>
      {next.map((x) => (
        <span>🗺️ {x.name}</span>
      ))}
    </p>
  ) : null;
  return (
    <Card class="passport-card">
      <h2>🛂 {t("พาสปอร์ตกรุงเทพฯ", "Bangkok Passport")}</h2>
      {been.length ? (
        <>
          <p class="chips2 passport-been" aria-label={t("เขตที่ไปมาแล้ว", "Districts you've been to")}>
            {shown.map((x) => (
              <span>📍 {x.name}</span>
            ))}
            {been.length > shown.length ? <span>{t(`อีก ${been.length - shown.length} เขต`, `${been.length - shown.length} more`)}</span> : null}
          </p>
          <small class="muted passport-count">{t(`ไปมาแล้ว ${been.length} จาก 50 เขต`, `${been.length} of 50 districts so far`)}</small>
        </>
      ) : (
        <p class="muted">{t("ยังไม่มีเขตที่ไปด้วยกัน เควสต์แรกกับบัดดี้จะพาไปเขตแรก", "No districts yet. Your first quest with a buddy takes you to one.")}</p>
      )}
      {props.compact ? (
        <>
          {nextLine}
          <a href="/buddy/passport">{t("ดูทั้ง 50 เขต", "All 50 districts")} →</a>
        </>
      ) : (
        <>
          {next.length ? <h3>🗺️ {t("อยากไปสำรวจ", "Next to explore")}</h3> : null}
          {nextLine}
          <h3>{t("แสตมป์ประจำฤดู", "Season stamps")}</h3>
          {props.badges?.length ? (
            <p class="chips2">
              {props.badges.map((b) => (
                <span>
                  {b.icon} {L(lang, b.theme)}
                </span>
              ))}
            </p>
          ) : (
            <p class="muted">{t("เควสต์ใหญ่ประจำเดือนที่ทำกับบัดดี้จะมาอยู่ตรงนี้", "Monthly big quests you finish with a buddy show up here.")}</p>
          )}
          <h3>{t("ทุกเขต", "Every district")}</h3>
          <Stamps items={items} />
        </>
      )}
    </Card>
  );
}

/** The no-ghosting wrap-up: ask kindly, agree, or close at once once you've moved off the app. */
function WrapUp(props: { v: View; m: BuddyMatch; me: string; offApp: boolean }) {
  const { t, lang } = props.v;
  const { m, me } = props;
  const notes = Object.entries(WRAP_NOTES);
  if (m.endRequestedBy === me) {
    const closes = new Date((m.endRequestedAt?.getTime() ?? Date.now()) + WRAP_NOTICE_DAYS * 86_400_000);
    return (
      <Card>
        <p>
          🌙{" "}
          {t(
            `คุณขอปิดบัดดี้รอบนี้แล้ว และบัดดี้ได้รับข้อความของคุณแล้ว ถ้าบัดดี้ไม่ตกลงก่อน รอบนี้จะปิดเองวันที่ ${fmtDay(closes, lang)}`,
            `You asked to wrap up. Your buddy has your note. It closes on ${fmtDay(closes, lang)} unless they agree sooner.`,
          )}
        </p>
        <form method="post" action={`/buddy/${m.id}/keep`}>
          <Button kind="ghost">{t("ไม่ปิดแล้ว ไปต่อกัน", "Keep going after all")}</Button>
        </form>
      </Card>
    );
  }
  if (m.endRequestedBy) {
    const note = m.endNote && isWrapNote(m.endNote) ? WRAP_NOTES[m.endNote] : null;
    return (
      <Card>
        <span class="eyebrow">{t("บัดดี้ขอปิดรอบนี้", "Your buddy would like to wrap up")}</span>
        {note ? <p>💬 “{L(lang, note)}”</p> : null}
        <p class="muted">
          {t(
            "กดตกลงเพื่อปิดแบบดี ๆ ถ้าอยากคุยกันต่อ แชร์ช่องทางติดต่อได้ในหน้าคนรู้จัก ถ้าไม่ตอบ รอบนี้จะปิดเองใน 7 วัน",
            "Agree to close it kindly. Want to keep in touch? Share a contact in My people. If you don't reply, it closes on its own in 7 days.",
          )}
        </p>
        <form method="post" action={`/buddy/${m.id}/end`}>
          <input type="hidden" name="note" value="lovely" />
          <Button>🤝 {t("ตกลง ขอบคุณนะ", "Agree, and say thanks")}</Button>
        </form>
      </Card>
    );
  }
  return (
    <details class="buddy-wrap">
      <summary>{t("ปิดบัดดี้รอบนี้แบบดี ๆ", "Wrap up kindly")}</summary>
      <p class="muted">
        {props.offApp
          ? t("คุณทั้งสองคนแชร์ช่องทางติดต่อกันแล้ว จึงปิดในแอปได้ทันที แล้วไปคุยกันต่อนอกแอปได้", "You've both shared a contact, so you can close here right away and carry on off the app.")
          : t(
              "ไม่หายเงียบ: บัดดี้จะได้รับข้อความของคุณ รอบนี้จะปิดเมื่อบัดดี้ตกลง หรือปิดเองใน 7 วัน ถ้ารู้สึกไม่ปลอดภัย บล็อกได้ทันทีด้านล่าง",
              "No ghosting: your buddy gets your note, and it closes when they agree, or on its own after 7 days. If you feel unsafe, block below at once.",
            )}
      </p>
      <form method="post" action={`/buddy/${m.id}/end`}>
        <fieldset class="choices">
          <legend>{t("ข้อความปิดท้าย", "Your wrap-up note")}</legend>
          <div class="pills">
            {notes.map(([key, text], i) => (
              <label class="pill">
                <input type="radio" name="note" value={key} checked={props.offApp ? key === "offapp" : i === 0} required />
                <span>{L(lang, text)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Button kind="ghost">{props.offApp ? t("ปิดในแอป", "Close here") : t("ส่งข้อความปิดท้าย", "Send the wrap-up")}</Button>
      </form>
    </details>
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
    db.select({ district: passportStamps.district, createdAt: passportStamps.createdAt }).from(passportStamps).where(eq(passportStamps.accountId, me)).limit(60),
  ]);
  const stamped = new Set(stamps.map((s) => s.district));
  const buddyName = buddyRows[0]?.nickname ?? "";
  const [quest, bigQuest, offApp] = match?.state === "active" ? await Promise.all([weekQuest(db, match, types, now), monthQuest(db, match, now), movedOffApp(db, match)]) : [null, null, false];
  const iSaidMeet = match ? (side(match, me) === "a" ? match.aMeetAt : match.bMeetAt) : null;

  return page(
    c,
    { title: t("บัดดี้กรุงเทพฯ", "Bangkok Buddy"), tab: "buddy" },
    <>
      <h1>🤝 {t("บัดดี้กรุงเทพฯ", "Bangkok Buddy")}</h1>
      <p class="muted">{t("หนึ่งคน หนึ่งเมือง 50 เขต", "One person, one city, 50 districts.")}</p>
      {!optin || !optin.active ? (
        <OptIn v={v} intent={optin?.intent} hasType={types.has(me)} />
      ) : !match ? (
        <div class="stack-card">
          <Tile tone="brand" art={{ tone: "dawn", icons: [], seed: 11 }} lang={v.lang}>
            <Pill dot>{t("จับคู่ทุกวัน", "Matching daily")}</Pill>
            <AvatarStack items={[{ label: "You", emoji: "🙂", seed: "you" }, { label: "?", emoji: "⏳", seed: "q" }]} size={54} />
            <h2>{t("กำลังหาบัดดี้ให้คุณ", "Finding your buddy")}</h2>
            <small>{t("เราจะแจ้งเตือนคุณ", "We'll notify you")}</small>
            <span class="acts">
              <a class="btn ghost" href="/buddy/deck">{t("ดูคนที่อาจเป็นบัดดี้", "Meet possible buddies")}</a>
            </span>
          </Tile>
        </div>
      ) : match.state === "proposed" ? (
        <Card>
          <BuddyCard v={v} eyebrow={t("บัดดี้คนใหม่", "New buddy")} nickname={buddyName} theirs={otherId ? types.get(otherId) : undefined} mine={types.get(me)} />
          <p class="muted">{t("ต้องกด 'นัดเจอ' ทั้งสองคนถึงจะเริ่มได้", "You both tap 'Meet' to start.")}</p>
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
          <BuddyCard v={v} eyebrow={t("บัดดี้ของคุณ", "Your buddy")} nickname={buddyName} theirs={otherId ? types.get(otherId) : undefined} mine={types.get(me)}>
            <span class="acts">
              <a class="btn ghost" href={`/people/${otherId}`}>👤 {t("โปรไฟล์", "Card")}</a>
              <a class="btn ghost" href={`/chat/buddy:${match.id}`}>💬 {t("แชต", "Chat")}</a>
            </span>
          </BuddyCard>
          {quest ? <QuestCard v={v} m={match} q={quest} me={me} buddyName={buddyName} types={types} /> : null}
          {bigQuest ? <QuestCard v={v} m={match} q={bigQuest} me={me} buddyName={buddyName} types={types} /> : null}
          {SAFETY(v)}
          <Card class="first-meet">
            <h3 style="margin-top:0">🛡️ {t("ก่อนเจอกัน", "Before you meet")}</h3>
            <p class="muted">{t("นัดในที่สาธารณะตอนกลางวัน บอกเพื่อนว่าไปไหน และตั้งให้เราถามว่าถึงบ้านปลอดภัยไหม", "Meet in public, in daylight. Tell a friend, and let us ask if you got home safe.")}</p>
            <SafeArrivalForm v={v} context={`buddy:${match.id}`} />
          </Card>
          <WrapUp v={v} m={match} me={me} offApp={offApp} />
          <div class="row safety-row">
            <a href={`/report?account=${otherId}`}>{t("รายงาน", "Report")}</a>
            <details class="more-menu">
              <summary aria-label={t("ตัวเลือกเพิ่มเติม", "More options")}>⋯ {t("เพิ่มเติม", "More")}</summary>
              <div>
                <form method="post" action={`/block/${otherId}`}>
                  <input type="hidden" name="back" value="/buddy" />
                  <Button kind="danger">{t("บล็อก", "Block")}</Button>
                </form>
              </div>
            </details>
          </div>
        </>
      )}
      <Passport v={v} stamped={stamped} compact wish={cleanBio(c.var.user!.profile?.bio).reflections?.notYet?.districts} />
      {optin?.active ? (
        <details>
          <summary>{t("ตั้งค่าบัดดี้", "Buddy settings")}</summary>
          <OptIn v={v} intent={optin.intent} hasType={types.has(me)} compact />
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
  const me = c.var.user!.account.id;
  const [stamps, badges] = await Promise.all([
    db.select({ district: passportStamps.district, createdAt: passportStamps.createdAt }).from(passportStamps).where(eq(passportStamps.accountId, me)).limit(60),
    seasonBadges(db, me),
  ]);
  return page(
    c,
    { title: v.t("พาสปอร์ตกรุงเทพฯ", "Bangkok Passport"), tab: "buddy" },
    <>
      <p>
        <a href="/buddy">← {v.t("บัดดี้กรุงเทพฯ", "Bangkok Buddy")}</a>
      </p>
      <Passport v={v} stamped={new Set(stamps.map((s) => s.district))} badges={badges} wish={cleanBio(c.var.user!.profile?.bio).reflections?.notYet?.districts} />
    </>,
  );
});

buddyRoutes.post("/buddy/optin", requireMember, async (c) => {
  const body = await c.req.parseBody();
  const raw = str(body.intent);
  if (!isBuddyIntent(raw)) return c.redirect("/buddy");
  // Friends only for now: an old form or a hand-made post asking for "open"
  // or "dating" is saved as friends.
  const intent = friendlyIntent(raw);
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

/** Before both said meet: "Not this one" is fine, it hadn't started. */
buddyRoutes.post("/buddy/:id/pass", requireMember, async (c) => {
  const found = await myMatch(c);
  if (!found || found.m.state !== "proposed") return c.redirect("/buddy");
  const { m, me, them } = found;
  const db = getDb(c.env);
  await batch(c.env, [
    db.update(buddyMatches).set({ state: "ended", endedBy: me, endReason: "pass", endedAt: new Date() }).where(and(eq(buddyMatches.id, m.id), eq(buddyMatches.state, "proposed"))),
    notify(db, them, "buddy_ended", "บัดดี้คู่นี้ไม่ได้ไปต่อ เราจะหาบัดดี้ใหม่ให้เร็ว ๆ นี้", "This buddy match didn't go ahead. A new buddy is coming soon.", "/buddy"),
    audit(db, me, "buddy.pass", { type: "buddy_match", id: m.id }),
  ]);
  return c.redirect("/buddy?notice=done");
});

/**
 * Wrapping up an active pairing, never by going quiet:
 *  - the other buddy already asked: agreeing closes it (mutual);
 *  - both shared a contact (moved off the app): it closes at once;
 *  - otherwise: a kind wrap-up note is sent and it closes when they agree, or
 *    after WRAP_NOTICE_DAYS (roundIfDue).
 */
buddyRoutes.post("/buddy/:id/end", requireMember, async (c) => {
  const found = await myMatch(c);
  if (!found || found.m.state !== "active") return c.redirect("/buddy");
  const { m, me, them } = found;
  const body = await c.req.parseBody();
  const noteRaw = str(body.note);
  const note = isWrapNote(noteRaw) ? noteRaw : "lovely";
  const db = getDb(c.env);
  const now = new Date();
  const close = (reason: string, th: string, en: string) =>
    batch(c.env, [
      db.update(buddyMatches).set({ state: "ended", endedBy: me, endReason: reason, endedAt: now }).where(and(eq(buddyMatches.id, m.id), eq(buddyMatches.state, "active"))),
      notify(db, them, "buddy_ended", th, en, "/buddy"),
      audit(db, me, "buddy.end", { type: "buddy_match", id: m.id }),
    ]);
  if (m.endRequestedBy === them) {
    await close("mutual", "บัดดี้ตกลงปิดรอบนี้แล้ว ขอบคุณที่ออกสำรวจด้วยกันนะ", "Your buddy agreed to wrap up. Thank you both for exploring together!");
    return c.redirect("/buddy?notice=done");
  }
  if (m.endRequestedBy === me) return c.redirect("/buddy");
  if (await movedOffApp(db, m)) {
    await close("moved_off_app", `บัดดี้ปิดรอบนี้ในแอปแล้ว: “${WRAP_NOTES[note].th}” คุยกันต่อได้ทางช่องทางที่แชร์ไว้`, `Your buddy closed the pairing on the app: “${WRAP_NOTES[note].en}” You can keep in touch on the contact you shared.`);
    return c.redirect("/buddy?notice=done");
  }
  await batch(c.env, [
    db.update(buddyMatches).set({ endRequestedBy: me, endRequestedAt: now, endNote: note }).where(and(eq(buddyMatches.id, m.id), eq(buddyMatches.state, "active"), isNull(buddyMatches.endRequestedBy))),
    notify(
      db,
      them,
      "buddy_wrap",
      `บัดดี้ขอปิดรอบนี้: “${WRAP_NOTES[note].th}” ตกลงในแอปได้เลย หรือจะปิดเองใน ${WRAP_NOTICE_DAYS} วัน`,
      `Your buddy would like to wrap up: “${WRAP_NOTES[note].en}” Agree in the app, or it closes on its own in ${WRAP_NOTICE_DAYS} days.`,
      "/buddy",
    ),
    audit(db, me, "buddy.wrap_request", { type: "buddy_match", id: m.id }),
  ]);
  return c.redirect("/buddy?notice=saved");
});

/** Take back my own wrap-up request. */
buddyRoutes.post("/buddy/:id/keep", requireMember, async (c) => {
  const found = await myMatch(c);
  if (!found || found.m.state !== "active" || found.m.endRequestedBy !== found.me) return c.redirect("/buddy");
  const db = getDb(c.env);
  await batch(c.env, [
    db.update(buddyMatches).set({ endRequestedBy: null, endRequestedAt: null, endNote: null }).where(eq(buddyMatches.id, found.m.id)),
    notify(db, found.them, "buddy_keep", "บัดดี้อยากไปต่อด้วยกัน", "Your buddy would like to keep going together", "/buddy"),
  ]);
  return c.redirect("/buddy?notice=saved");
});

buddyRoutes.post("/buddy/:id/quest", requireMember, async (c) => {
  const found = await myMatch(c);
  if (!found || found.m.state !== "active") return c.redirect("/buddy");
  const { m, me, them } = found;
  const db = getDb(c.env);
  const now = new Date();
  const body = await c.req.parseBody();
  const wanted = str(body.quest);
  // Only this week's quest or this month's big quest can be marked done.
  const key = wanted === monthKey(now) ? wanted : weekKey(now);
  const [q] = await db.select().from(buddyQuests).where(and(eq(buddyQuests.matchId, m.id), eq(buddyQuests.week, key))).limit(1);
  if (!q) return c.redirect("/buddy");
  const mySide = side(m, me);
  if ((mySide === "a" ? q.aDoneAt : q.bDoneAt) !== null) return c.redirect("/buddy");
  const theyDone = mySide === "a" ? q.bDoneAt : q.aDoneAt;
  const mark = db
    .update(buddyQuests)
    .set(mySide === "a" ? { aDoneAt: now } : { bDoneAt: now })
    .where(and(eq(buddyQuests.id, q.id), mySide === "a" ? isNull(buddyQuests.aDoneAt) : isNull(buddyQuests.bDoneAt)));
  if (!theyDone) {
    await batch(c.env, [mark, notify(db, them, "buddy_quest", "บัดดี้กด 'ไปมาแล้ว' แล้ว กดยืนยันเพื่อรับแสตมป์ได้เลย", "Your buddy marked the quest done. Confirm to get the stamp.", "/buddy")]);
    return c.redirect("/buddy?notice=saved");
  }
  // Both done: stamp the district for both.
  const writes: Write[] = [
    mark,
    db
      .insert(passportStamps)
      .values([m.aAccount, m.bAccount].map((accountId) => ({ id: newId(), accountId, district: q.district, source: q.scenario === "season" ? "season" : "buddy", questId: q.id, createdAt: now })))
      .onConflictDoNothing({ target: [passportStamps.accountId, passportStamps.district] }),
    notify(db, them, "buddy_stamp", "ได้แสตมป์เขตใหม่ในพาสปอร์ตแล้ว", "New district stamped in your passport", "/buddy/passport"),
  ];
  // Friends only for now: a buddy pairing stays a friendship, even when both
  // stored "open to more" before Phase 2A. domain/buddy.ts romanceUnlocked
  // is kept for the mutual "เกี่ยวก้อย · Pinky" mode that will come later.
  await batch(c.env, writes);
  return c.redirect("/buddy?notice=stamped");
});

// ------------------------------------------------------------- the deck --
//
// While someone waits for a buddy they can meet possible buddies from the
// pool, one card at a time: "I'd meet them" (stored as keen) or "Not now"
// (stored as pass). It is a stated preference for the next daily round, never
// a match on its own, and the other person never sees it. No photos and no
// dating details: people choose on vibe. A short daily deck, never endless.

export const DECK_PER_DAY = 15;

async function deckState(c: Ctx) {
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const now = new Date();
  const [[optin], match] = await Promise.all([db.select().from(buddyOptins).where(eq(buddyOptins.accountId, me)).limit(1), currentMatch(db, me)]);
  if (!optin?.active || match) return null;
  const [pool, mine] = await Promise.all([
    loadPool(db, now),
    db.select({ targetId: buddySwipes.targetId, createdAt: buddySwipes.createdAt }).from(buddySwipes).where(eq(buddySwipes.accountId, me)).limit(5000),
  ]);
  const self = pool.find((p) => p.accountId === me);
  const today = dayKey(now);
  const usedToday = mine.filter((x) => dayKey(x.createdAt) === today).length;
  const deck = self ? deckFor(self, pool, new Set(mine.map((x) => x.targetId)), today) : [];
  return { db, me, self, deck, left: Math.max(0, DECK_PER_DAY - usedToday) };
}

buddyRoutes.get("/buddy/deck", requireMember, async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const st = await deckState(c);
  if (!st) return c.redirect("/buddy");
  const next = st.left > 0 ? st.deck[0] : undefined;
  let card: Child = null;
  if (next) {
    const [[person], types] = await Promise.all([
      st.db.select().from(profiles).where(eq(profiles.accountId, next)).limit(1),
      typeOfAccount(st.db, [st.me, next]),
    ]);
    const mineP = c.var.user!.profile!;
    const theirs = types.get(next);
    const a = theirs ? ARCHETYPES[theirs] : null;
    const why = theirs && types.get(st.me) ? clickReason(types.get(st.me)!, theirs) : null;
    const bio = cleanBio(person.bio);
    const shared = person.interests.filter((i) => mineP.interests.includes(i));
    const chips = [...shared, ...person.interests.filter((i) => !shared.includes(i))].slice(0, 6);
    const energy = ENERGY.find((x) => x.value === bio.energy);
    const weekend = WEEKEND_RHYTHM.find((x) => x.value === bio.weekend);
    card = (
      <article class="deck-card" data-deck>
        <span class="deck-stamp keen" aria-hidden="true">{t("อยากลองเจอ", "I'd meet them")}</span>
        <span class="deck-stamp pass" aria-hidden="true">{t("ไว้ก่อน", "Not now")}</span>
        <div class="deck-face" aria-hidden="true">{a?.emoji ?? "🙂"}</div>
        <h2>
          {person.nickname}
          {person.showPronouns && person.pronouns ? <small class="muted"> {person.pronouns}</small> : null}
        </h2>
        <p class="deck-sub">
          {a ? L(lang, a.name) : null} · 📍 {DISTRICTS.find((d) => d.value === person.district)?.[lang === "en" ? "en" : "th"]}
        </p>
        {why ? <p class="deck-why">🤝 {L(lang, why)}</p> : null}
        <p class="chips2">
          {chips.map((i) => {
            const o = ALL_INTERESTS.find((x) => x.value === i);
            return o ? <span class={shared.includes(i) ? "on" : undefined}>{o.emoji} {L(lang, o)}</span> : null;
          })}
        </p>
        <p class="chips2">
          {energy ? <span>{energy.emoji} {L(lang, energy)}</span> : null}
          {weekend ? <span>{weekend.emoji} {L(lang, weekend)}</span> : null}
          <span>🗣️ {person.languages.join(" · ").toUpperCase()}</span>
        </p>
      </article>
    );
  }
  return page(
    c,
    { title: t("คนที่อาจเป็นบัดดี้", "Possible buddies"), tab: "buddy" },
    <>
      <p class="spread">
        <a href="/buddy">← {t("บัดดี้", "Buddy")}</a>
        <small class="muted">{t(`วันนี้เหลือ ${st.left}`, `${st.left} left today`)}</small>
      </p>
      <h1>{t("ดูคนที่อาจเป็นบัดดี้", "Meet possible buddies")}</h1>
      <p class="muted">
        {t(
          "กด อยากลองเจอ แล้วรอบจับคู่ถัดไปจะให้คนนี้มาก่อน แต่ยังไม่ใช่การจับคู่ และอีกฝ่ายจะไม่รู้ ไม่มีรูป เลือกกันจากตัวตน",
          "I'd meet them helps the next daily round put this person first. It isn't a match, and they never see it. No photos: pick on vibe.",
        )}
      </p>
      {!st.self ? (
        <Notice kind="info">{t("ทำแบบทดสอบไทป์กรุงเทพฯ ก่อน แล้วค่อยกลับมาดู", "Take the Bangkok Type quiz first, then come back.")}</Notice>
      ) : card ? (
        <>
          <div class="deck">
            {card}
            {st.deck[1] ? <div class="deck-under" aria-hidden="true" /> : null}
          </div>
          <div class="deck-acts">
            <form method="post" action="/buddy/deck" data-choice="pass">
              <input type="hidden" name="target" value={next} />
              <input type="hidden" name="choice" value="pass" />
              <button class="deck-btn pass" aria-label={t("ไว้ก่อน", "Not now")}>
                <span class="deck-ico" aria-hidden="true">✕</span>
                <span class="deck-lbl" aria-hidden="true">{t("ไว้ก่อน", "Not now")}</span>
              </button>
            </form>
            <form method="post" action="/buddy/deck" data-choice="keen">
              <input type="hidden" name="target" value={next} />
              <input type="hidden" name="choice" value="keen" />
              <button class="deck-btn keen" aria-label={t("อยากลองเจอ", "I'd meet them")}>
                <span class="deck-ico" aria-hidden="true">👋</span>
                <span class="deck-lbl" aria-hidden="true">{t("อยากลองเจอ", "I'd meet them")}</span>
              </button>
            </form>
          </div>
          <script dangerouslySetInnerHTML={{ __html: DECK_JS }} />
        </>
      ) : (
        <Card>
          <h2 style="margin-top:0">{st.left === 0 ? t("พอแค่นี้สำหรับวันนี้", "That's it for today") : t("ดูครบทุกคนแล้ว", "You've seen everyone for now")}</h2>
          <p class="muted">{t("รอบจับคู่จะใช้สิ่งที่คุณเลือก เราจะแจ้งเตือนเมื่อเจอบัดดี้", "The next round uses your picks. We'll tell you when you have a buddy.")}</p>
          <LinkButton href="/buddy">{t("กลับไปหน้าบัดดี้", "Back to Buddy")}</LinkButton>
        </Card>
      )}
    </>,
  );
});

buddyRoutes.post("/buddy/deck", requireMember, async (c) => {
  const body = await c.req.parseBody();
  const target = str(body.target);
  const choice = str(body.choice);
  if (choice !== "keen" && choice !== "pass") return c.redirect("/buddy/deck");
  const st = await deckState(c);
  // Only someone actually in your deck today, within the daily limit.
  if (!st || st.left <= 0 || !st.deck.includes(target)) return c.redirect("/buddy/deck");
  await st.db.insert(buddySwipes).values({ id: newId(), accountId: st.me, targetId: target, choice }).onConflictDoNothing();
  return c.redirect("/buddy/deck");
});

/**
 * Drag the top card left (pass) or right (keen); the buttons do the same
 * without a pointer. Fluid, after Apple's "Designing Fluid Interfaces"
 * (src/ui/spring.ts): the card tracks the finger 1:1 from where it was
 * grabbed, after ~8px of slop so vertical scrolling still works; stamps fade
 * in with the distance; the card underneath rises as the top one leaves.
 * On release the flick is projected forward: past the line it flies off at
 * the finger's speed, otherwise it springs home with a little bounce. A card
 * in motion can be grabbed again. Reduced motion: a short cross-fade.
 */
const DECK_JS = `(function(){var c=document.querySelector("[data-deck]");if(!c)return;var M=window.jgMotion,under=document.querySelector(".deck-under");
var x=0,anim=null,drag=null,tr=M.tracker(),gone=false,LINE=110;
var sK=c.querySelector(".deck-stamp.keen"),sP=c.querySelector(".deck-stamp.pass");
function paint(){c.style.transform="translate3d("+x+"px,0,0) rotate("+(x/20)+"deg)";var p=Math.min(1,Math.abs(x)/LINE);
if(sK)sK.style.opacity=x>0?p:0;if(sP)sP.style.opacity=x<0?p:0;
if(under)under.style.transform="scale("+(0.95+0.05*p)+") translateY("+(10*(1-p))+"px)"}
function fly(k,v){if(gone)return;gone=true;var f=document.querySelector('form[data-choice="'+k+'"]');M.tick();
if(M.still()){c.style.transition="opacity .18s ease";c.style.opacity="0";setTimeout(function(){f.submit()},180);return}
var to=(k==="keen"?1:-1)*(innerWidth+c.offsetWidth);if(anim)anim.stop();setTimeout(function(){if(!f.dataset.go){f.dataset.go="1";f.submit()}},700);
anim=M.spring({from:x,to:to,velocity:v||(k==="keen"?1800:-1800),damping:1,response:0.35,onUpdate:function(n){x=n;paint();if(Math.abs(x)>innerWidth*0.7&&!f.dataset.go){f.dataset.go="1";f.submit()}}})}
function home(v){if(anim)anim.stop();anim=M.spring({from:x,to:0,velocity:v,damping:0.8,response:0.35,onUpdate:function(n){x=n;paint()}})}
c.addEventListener("pointerdown",function(e){if(gone)return;if(anim){x=anim.stop().x}drag={id:e.pointerId,sx:e.clientX,sy:e.clientY,x0:x,on:false};tr.reset();tr.add(x)});
c.addEventListener("pointermove",function(e){if(!drag||e.pointerId!==drag.id)return;var dx=e.clientX-drag.sx,dy=e.clientY-drag.sy;
if(!drag.on){if(Math.abs(dx)<8&&Math.abs(dy)<8)return;if(Math.abs(dy)>Math.abs(dx)){drag=null;return}drag.on=true;try{c.setPointerCapture(e.pointerId)}catch(_){};c.classList.add("dragging")}
x=drag.x0+dx;tr.add(x);paint()});
function up(e){if(!drag)return;var was=drag.on;drag=null;c.classList.remove("dragging");if(!was)return;
var v=tr.velocity(),end=x+M.project(v,0.99);if(end>LINE)fly("keen",v);else if(end<-LINE)fly("pass",v);else home(v)}
c.addEventListener("pointerup",up);c.addEventListener("pointercancel",up);
document.querySelectorAll("form[data-choice]").forEach(function(f){f.addEventListener("submit",function(e){e.preventDefault();e.stopImmediatePropagation();fly(f.dataset.choice,0)},true)});
addEventListener("pageshow",function(ev){if(ev.persisted){gone=false;x=0;paint();c.style.opacity="";document.querySelectorAll("form[data-go]").forEach(function(f){delete f.dataset.go})}})})()`;

// ------------------------------------------------------ meet feedback --
//
// Private, mutual feedback after a quest: never shown to the buddy, only used
// in aggregate (k-anonymous M&E) and for safety. Felt unsafe offers a report.

const YN = [
  { value: "yes", th: "ใช่", en: "Yes" },
  { value: "no", th: "ไม่", en: "No" },
];
const FIVE = ["1", "2", "3", "4", "5"].map((n) => ({ value: n, th: n, en: n }));

async function questOfMine(c: Ctx) {
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const [q] = await db.select().from(buddyQuests).where(eq(buddyQuests.id, c.req.param("qid") ?? "")).limit(1);
  if (!q || !q.aDoneAt || !q.bDoneAt) return null;
  const [m] = await db.select().from(buddyMatches).where(eq(buddyMatches.id, q.matchId)).limit(1);
  if (!m || (m.aAccount !== me && m.bAccount !== me)) return null;
  return { db, me, q, other: m.aAccount === me ? m.bAccount : m.aAccount };
}

buddyRoutes.get("/buddy/quest/:qid/feedback", requireMember, async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const found = await questOfMine(c);
  if (!found) return c.redirect("/buddy");
  const [prev] = await found.db.select().from(meetFeedback).where(and(eq(meetFeedback.kind, "quest"), eq(meetFeedback.ref, found.q.id), eq(meetFeedback.accountId, found.me))).limit(1);
  const yn = (b?: boolean | null) => (b === true ? ["yes"] : b === false ? ["no"] : []);
  return page(
    c,
    { title: t("เจอกันเป็นยังไงบ้าง", "How was the meet?"), tab: "buddy" },
    <>
      <h1>📝 {t("เจอกันเป็นยังไงบ้าง?", "How was the meet?")}</h1>
      <p class="muted">{t("เป็นความลับ บัดดี้ไม่เห็นคำตอบ ใช้ปรับการจับคู่และความปลอดภัยเท่านั้น", "Private: your buddy never sees this. It only helps matching and safety.")}</p>
      {prev ? <Notice kind="ok">{t("ส่งแล้ว แก้ไขได้", "Sent. You can still change it.")}</Notice> : null}
      <Card>
        <form method="post">
          <Choices legend={t("บัดดี้มาตามนัดไหม", "Did your buddy show up?")} name="showedUp" type="radio" options={YN} values={yn(prev?.showedUp)} lang={lang} required />
          <Choices legend={t("มาตรงเวลาไหม", "On time?")} name="onTime" type="radio" options={YN} values={yn(prev?.onTime)} lang={lang} />
          <Choices legend={t("รู้สึกปลอดภัยแค่ไหน (1-5)", "How safe did you feel? (1-5)")} name="feltSafe" type="radio" options={FIVE} values={prev?.feltSafe ? [String(prev.feltSafe)] : []} lang={lang} required />
          <Choices legend={t("รู้สึกว่ามีคนฟังคุณแค่ไหน (1-5)", "Did you feel heard? (1-5)")} name="feltHeard" type="radio" options={FIVE} values={prev?.feltHeard ? [String(prev.feltHeard)] : []} lang={lang} />
          <Choices legend={t("อยากเจอกันอีกไหม", "Would you meet again?")} name="again" type="radio" options={YN} values={yn(prev?.wouldMeetAgain)} lang={lang} required />
          <Button>{t("ส่ง", "Send")}</Button>
        </form>
      </Card>
    </>,
  );
});

buddyRoutes.post("/buddy/quest/:qid/feedback", requireMember, async (c) => {
  const found = await questOfMine(c);
  if (!found) return c.redirect("/buddy");
  const body = await c.req.parseBody();
  const yn = (x: string) => (x === "yes" ? true : x === "no" ? false : null);
  const five = (x: string) => (/^[1-5]$/.test(x) ? Number(x) : null);
  const showedUp = yn(str(body.showedUp));
  const feltSafe = five(str(body.feltSafe));
  const again = yn(str(body.again));
  if (showedUp === null || feltSafe === null || again === null) return c.redirect(`/buddy/quest/${found.q.id}/feedback`);
  const data = { showedUp, onTime: yn(str(body.onTime)), feltSafe, feltHeard: five(str(body.feltHeard)), wouldMeetAgain: again };
  await found.db
    .insert(meetFeedback)
    .values({ id: newId(), kind: "quest", ref: found.q.id, accountId: found.me, aboutAccount: found.other, ...data })
    .onConflictDoUpdate({ target: [meetFeedback.kind, meetFeedback.ref, meetFeedback.accountId], set: data });
  if (feltSafe <= 2) return c.redirect(`/report?account=${encodeURIComponent(found.other)}&from=feedback`);
  return c.redirect("/buddy?notice=saved");
});
