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
 *  - Your "open to more" choice is never shown to your buddy. Romance only
 *    surfaces when both chose it, both are eligible and compatible, after two
 *    finished quests (domain/buddy.ts romanceUnlocked).
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
import { cleanPrefs } from "../content/dating";
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
  romanceUnlocked,
  weekKey,
  type PoolMember,
} from "../domain/buddy";
import { monthKey, seasonQuestFor } from "../domain/seasons";
import { ageOn, romanceCompatible, romanceEligible } from "../domain/rules";
import { DATING_INTENTS } from "../domain/buddy";
import { DISTRICTS, districtsAZ } from "../lib/constants";
import { newId } from "../lib/crypto";
import type { AppEnv } from "../lib/env";
import { fmtDay, L, type Lang } from "../lib/i18n";
import { audit, notify } from "../lib/records";
import { requireMember } from "../lib/session";
import { accounts, blocks, buddyMatches, buddySwipes, datingIntents, buddyRounds, buddyOptins, buddyQuests, connections, contactShares, passportStamps, profiles, vibes, type BuddyMatch, type BuddyQuest, type Profile } from "../schema";
import { Button, Card, Choices, LinkButton, Notice, page, str, view, type View } from "../ui/kit";
import { AvatarStack, Bento, Big, Pill, PostcardFan, Ring, Stamps, Tile, artFor } from "../ui/visual";
import type { Child } from "hono/jsx";
import { ARCHETYPES, isArchetypeKey, normalizeType, type ArchetypeKey } from "../vibe/archetypes";

export const buddyRoutes = new Hono<AppEnv>();
type Ctx = Context<AppEnv>;
type Db = ReturnType<typeof getDb>;
type Write = { toSQL(): { sql: string; params: unknown[] } };


const INTENT_OPTS = [
  { value: "friends", th: "เพื่อนใหม่", en: "New friends" },
  { value: "activity", th: "เพื่อนทำกิจกรรม", en: "An activity buddy" },
  { value: "open", th: "เปิดใจมากกว่าเพื่อน ถ้าทั้งคู่รู้สึกตรงกัน", en: "Open to more, only if it's mutual" },
  { value: "dating", th: "หาเดทอย่างเดียว", en: "Dating only" },
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
        [m.aAccount, m.bAccount].map((x) => notify(db, x, "buddy_ended", "ปิดบัดดี้รอบนี้แบบดี ๆ แล้ว เดี๋ยวจับคู่รอบใหม่ให้เร็ว ๆ นี้", "Your buddy pairing has wrapped up kindly. A new match is coming soon.", "/buddy")),
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
 * blocks and past buddies, deck flicks, intents and private dating prefs.
 */
async function loadPool(db: Db, now: Date): Promise<PoolMember[]> {
  const optins = await db.select().from(buddyOptins).where(eq(buddyOptins.active, true)).orderBy(desc(buddyOptins.updatedAt)).limit(POOL_LIMIT);
  const ids = optins.map((o) => o.accountId);
  if (ids.length < 2) return [];
  const [history, blockRows, people, types, swipes, prefsRows] = await Promise.all([
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
    db.select({ accountId: datingIntents.accountId, prefs: datingIntents.prefs }).from(datingIntents).where(inArray(datingIntents.accountId, ids)).limit(ids.length),
  ]);
  const busy = new Set(history.filter((m) => m.state !== "ended").flatMap((m) => [m.a, m.b]));
  const excluded = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
  const lastEnded = new Map<string, number>();
  for (const m of history) {
    excluded.get(m.a)?.add(m.b);
    excluded.get(m.b)?.add(m.a);
    if (m.endedAt) for (const x of [m.a, m.b]) lastEnded.set(x, Math.max(lastEnded.get(x) ?? 0, m.endedAt.getTime()));
  }
  // The deck: a pass rules someone out; a keen flick ranks them higher.
  const keen = new Map<string, Set<string>>();
  for (const sw of swipes) {
    if (sw.choice === "pass") excluded.get(sw.accountId)?.add(sw.targetId);
    else if (sw.choice === "keen") {
      if (!keen.has(sw.accountId)) keen.set(sw.accountId, new Set());
      keen.get(sw.accountId)!.add(sw.targetId);
    }
  }
  const prefsOf = new Map(prefsRows.map((r) => [r.accountId, cleanPrefs(r.prefs)]));
  for (const b of blockRows) {
    excluded.get(b.blocker)?.add(b.blocked);
    excluded.get(b.blocked)?.add(b.blocker);
  }
  const since = new Map(optins.map((o) => [o.accountId, o.updatedAt.getTime()]));
  const intentOf = new Map(optins.map((o) => [o.accountId, o.intent]));
  const profileOf = new Map(people.map((x) => [x.account.id, x.profile]));
  /** Who a dating-only member can date: open to dating too, both eligible, compatible. */
  const datesWith = (id: string): Set<string> | undefined => {
    if (intentOf.get(id) !== "dating") return undefined;
    const me = profileOf.get(id)!;
    const out = new Set<string>();
    if (!romanceEligible(me)) return out;
    for (const [other, p] of profileOf) {
      if (other !== id && DATING_INTENTS.includes(intentOf.get(other) ?? "") && romanceEligible(p) && romanceCompatible(me, p)) out.add(other);
    }
    return out;
  };
  const pool: PoolMember[] = [];
  for (const { account, profile } of people) {
    const code = types.get(account.id);
    if (!code || busy.has(account.id) || !isActiveAccount(account, now) || !profile.onboardedAt) continue;
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
      datesWith: datesWith(account.id),
      keen: keen.get(account.id),
      datingPrefs: DATING_INTENTS.includes(intentOf.get(account.id) ?? "") ? prefsOf.get(account.id) : undefined,
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

function OptIn(props: { v: View; intent?: string; hasType: boolean; defaultIntent?: string; canDate?: boolean; compact?: boolean }) {
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
            <span class="ico" aria-hidden="true">🏅</span>
            <Big n="12" label={t("เทศกาลต่อปี", "festival quests")} />
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
              legend={t("มองหาอะไรอยู่ 🔒", "What you're open to 🔒")}
              hint={t("ความลับ บัดดี้ไม่เห็น", "Private: your buddy never sees this")}
              name="intent"
              type="radio"
              required
              options={props.canDate ? INTENT_OPTS : INTENT_OPTS.filter((o) => o.value !== "dating")}
              values={[props.intent ?? props.defaultIntent ?? "friends"]}
              lang={lang}
            />
            <details class="how">
              <summary>{t("ใช้งานยังไง", "How it works")}</summary>
              <ul>
                <li>👀 {t("บัดดี้เห็นชื่อเล่นและไทป์ของคุณ", "Your buddy sees your nickname and type.")}</li>
                <li>💘 {t("เรื่องหัวใจจะขึ้นก็ต่อเมื่อเลือกตรงกันทั้งคู่ และทำเควสต์ด้วยกันครบสองครั้ง", "Romance shows only if you both chose it, after two quests.")}</li>
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
    `ฉันนัดเจอบัดดี้จาก Jurrgun (${props.buddyName}) ที่${place} จะทักหาเมื่อถึงบ้าน`,
    `I'm meeting my Jurrgun buddy (${props.buddyName}) in ${place}. I'll message you when I'm home.`,
  );
  const hostHref = `/host/new?district=${encodeURIComponent(props.q.district)}&title=${encodeURIComponent(text ? (lang === "en" ? text.en : text.th) : "")}`;
  return (
    <Card class={season ? "quest season" : "quest"}>
      <span class="eyebrow">{season ? t(`🏅 เควสต์ใหญ่เดือนนี้ · ${season.theme.th}`, `🏅 This month · ${season.theme.en}`) : t("🗺️ เควสต์สัปดาห์นี้", "🗺️ This week's quest")}</span>
      <PostcardFan cards={cards} lang={lang} />
      {text ? <h3 class="quest-title">{L(lang, text)}</h3> : null}
      <p class="chips2">
        <span>📍 {place}</span>
        {season ? <span>🏅 {t("เหรียญประจำฤดู", "Season badge")}</span> : picker ? <span>{picker.emoji} {t(`สไตล์${L(lang, picker.name)}`, `${L(lang, picker.name)}'s pick`)}</span> : null}
        <span>{mineDone ? "✅" : "⬜"} {t("คุณ", "You")}</span>
        <span>{theirsDone ? "✅" : "⬜"} {props.buddyName}</span>
      </p>
      {mineDone && theirsDone ? (
        <Notice kind="ok">{t(`สำเร็จ! ได้แสตมป์${place}แล้ว`, `Done! ${place} stamped.`)}</Notice>
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

/** "Phra Nakhon" → "PN", "Chatuchak" → "CHA". */
const shortName = (en: string) => {
  const words = en.split(/\s+/).filter(Boolean);
  return words.length > 1 ? words.map((w) => w[0]).join("").slice(0, 3) : en.slice(0, 3);
};

function Passport(props: { v: View; stamped: Set<string>; compact?: boolean; badges?: { key: string; icon: string; theme: { en: string; th: string } }[] }) {
  const { t, lang } = props.v;
  const items = districtsAZ(lang).map((d) => ({ key: d.value, short: shortName(d.en), name: lang === "en" ? d.en : d.th, on: props.stamped.has(d.value) }));
  // Stamped first in the compact view, so progress is visible at a glance.
  const preview = [...items.filter((x) => x.on), ...items.filter((x) => !x.on)].slice(0, 12);
  return (
    <Card class="passport-card">
      <div class="passport-head">
        <Ring value={props.stamped.size} max={50} label={t("เขต", "districts")} />
        <div>
          <h2>🛂 {t("พาสปอร์ตกรุงเทพฯ", "Bangkok Passport")}</h2>
          <small class="muted">{t("เก็บแสตมป์ให้ครบทุกเขตด้วยกัน", "Stamp every district together")}</small>
        </div>
      </div>
      {props.compact ? (
        <>
          <Stamps items={preview} />
          <a href="/buddy/passport">{t("ดูทั้ง 50 เขต", "All 50 districts")} →</a>
        </>
      ) : (
        <>
          {props.badges?.length ? (
            <p class="season-badges">
              {props.badges.map((b) => (
                <span class="season-badge" title={L(lang, b.theme)}>
                  {b.icon} {L(lang, b.theme)}
                </span>
              ))}
            </p>
          ) : (
            <p class="muted">🏅 {t("ทำเควสต์ใหญ่ประจำเดือน เพื่อสะสมเหรียญ", "Finish monthly big quests to collect season badges.")}</p>
          )}
          <Stamps items={items} />
          <p class="chips2">
            {items.filter((x) => x.on).map((x) => (
              <span>✅ {x.name}</span>
            ))}
          </p>
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
            `คุณขอปิดบัดดี้รอบนี้แล้ว บัดดี้ได้รับข้อความแล้ว ถ้าบัดดี้ยังไม่ตอบตกลง จะปิดเองวันที่ ${fmtDay(closes, lang)}`,
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
            "กดตกลงเพื่อปิดแบบดี ๆ หรือถ้าอยากคุยกันต่อ แชร์ช่องทางติดต่อในหน้าคนรู้จักได้เลย ถ้าไม่ตอบ จะปิดเองใน 7 วัน",
            "Agree to close it kindly. Want to keep in touch? Share a contact in your circle. If you don't reply, it closes on its own in 7 days.",
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
      <summary>{t("ปิดบัดดี้รอบนี้อย่างสุภาพ", "Wrap up kindly")}</summary>
      <p class="muted">
        {props.offApp
          ? t("คุณทั้งคู่แชร์ช่องทางติดต่อกันแล้ว จึงปิดในแอปได้ทันที แล้วคุยกันต่อนอกแอป", "You've both shared a contact, so you can close here right away and carry on off the app.")
          : t(
              "ไม่หายเงียบ: บัดดี้จะได้รับข้อความของคุณ แล้วจะปิดเมื่อบัดดี้ตกลง หรือปิดเองใน 7 วัน ถ้ารู้สึกไม่ปลอดภัย บล็อกได้ทันทีด้านล่าง",
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
    db.select({ district: passportStamps.district }).from(passportStamps).where(eq(passportStamps.accountId, me)).limit(60),
  ]);
  const stamped = new Set(stamps.map((s) => s.district));
  const buddyName = buddyRows[0]?.nickname ?? "";
  const [quest, bigQuest, offApp] = match?.state === "active" ? await Promise.all([weekQuest(db, match, types, now), monthQuest(db, match, now), movedOffApp(db, match)]) : [null, null, false];
  const [dating] = await db.select({ mode: datingIntents.mode }).from(datingIntents).where(eq(datingIntents.accountId, me)).limit(1);
  const canDate = !!c.var.user!.profile && romanceEligible(c.var.user!.profile);
  const defaultIntent = dating?.mode === "dating_only" && canDate ? "dating" : dating?.mode === "dating" || c.var.user!.profile?.romanceOn ? "open" : "friends";
  const iSaidMeet = match ? (side(match, me) === "a" ? match.aMeetAt : match.bMeetAt) : null;

  return page(
    c,
    { title: t("บัดดี้กรุงเทพฯ", "Bangkok Buddy"), tab: "buddy" },
    <>
      <h1>🤝 {t("บัดดี้กรุงเทพฯ", "Bangkok Buddy")}</h1>
      <p class="muted">{t("หนึ่งคน หนึ่งเมือง 50 เขต", "One person, one city, 50 districts.")}</p>
      {!optin || !optin.active ? (
        <OptIn v={v} intent={optin?.intent} hasType={types.has(me)} defaultIntent={defaultIntent} canDate={canDate} />
      ) : !match ? (
        <div class="stack-card">
          <Tile tone="brand" art={{ tone: "dawn", icons: [], seed: 11 }} lang={v.lang}>
            <Pill dot>{t("จับคู่ทุกวัน", "Matching daily")}</Pill>
            <AvatarStack items={[{ label: "You", emoji: "🙂", seed: "you" }, { label: "?", emoji: "⏳", seed: "q" }]} size={54} />
            <h2>{t("กำลังหาบัดดี้ให้คุณ", "Finding your buddy")}</h2>
            <small>{t("เราจะแจ้งเตือนคุณ", "We'll notify you")}</small>
            <span class="acts">
              <a class="glass-btn" href="/buddy/deck">🃏 {t("ปัดดูคนที่อาจเป็นบัดดี้", "Flick through people")}</a>
            </span>
          </Tile>
        </div>
      ) : match.state === "proposed" ? (
        <Card>
          <BuddyCard v={v} eyebrow={t("บัดดี้คนใหม่", "New buddy")} nickname={buddyName} theirs={otherId ? types.get(otherId) : undefined} mine={types.get(me)} />
          <p class="muted">{t("กด 'นัดเจอ' ทั้งคู่ถึงจะเริ่มได้", "You both tap 'Meet' to start.")}</p>
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
              <a class="glass-btn" href={`/people/${otherId}`}>👤 {t("โปรไฟล์", "Card")}</a>
              <a class="glass-btn" href="/connections">💬 {t("แชร์ช่องทางติดต่อ", "Share contact")}</a>
            </span>
          </BuddyCard>
          {quest ? <QuestCard v={v} m={match} q={quest} me={me} buddyName={buddyName} types={types} /> : null}
          {bigQuest ? <QuestCard v={v} m={match} q={bigQuest} me={me} buddyName={buddyName} types={types} /> : null}
          {SAFETY(v)}
          <WrapUp v={v} m={match} me={me} offApp={offApp} />
          <div class="row">
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
          <OptIn v={v} intent={optin.intent} hasType={types.has(me)} defaultIntent={defaultIntent} canDate={canDate} compact />
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
    db.select({ district: passportStamps.district }).from(passportStamps).where(eq(passportStamps.accountId, me)).limit(60),
    seasonBadges(db, me),
  ]);
  return page(
    c,
    { title: v.t("พาสปอร์ตกรุงเทพฯ", "Bangkok Passport"), tab: "buddy" },
    <>
      <p>
        <a href="/buddy">← {v.t("บัดดี้กรุงเทพฯ", "Bangkok Buddy")}</a>
      </p>
      <Passport v={v} stamped={new Set(stamps.map((s) => s.district))} badges={badges} />
    </>,
  );
});

buddyRoutes.post("/buddy/optin", requireMember, async (c) => {
  const body = await c.req.parseBody();
  let intent = str(body.intent);
  if (!isBuddyIntent(intent)) return c.redirect("/buddy");
  // "Dating only" needs romance mode on (Single, consented); otherwise it's "open to more".
  const profile = c.var.user!.profile;
  if (intent === "dating" && !(profile && romanceEligible(profile))) intent = "open";
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
  // Romance only when both chose "open to more", both eligible and compatible, after two finished quests.
  const [intents, people, finished] = await Promise.all([
    db.select().from(buddyOptins).where(inArray(buddyOptins.accountId, [m.aAccount, m.bAccount])).limit(2),
    db.select().from(profiles).where(inArray(profiles.accountId, [m.aAccount, m.bAccount])).limit(2),
    db.select({ a: buddyQuests.aDoneAt, b: buddyQuests.bDoneAt, id: buddyQuests.id }).from(buddyQuests).where(eq(buddyQuests.matchId, m.id)).limit(60),
  ]);
  const finishedCount = finished.filter((f) => (f.id === q.id ? true : !!f.a && !!f.b)).length;
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

// ------------------------------------------------------------- the deck --
//
// While someone waits for a buddy they can flick through people in the pool:
// keen or pass. It is a stated preference for the next daily round, never a
// match on its own, and the other person never sees it. No photos: people
// choose on vibe. A short daily deck, so it never becomes endless swiping.

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
        <span class="deck-stamp keen" aria-hidden="true">{t("สนใจ", "Keen")}</span>
        <span class="deck-stamp pass" aria-hidden="true">{t("ผ่าน", "Pass")}</span>
        <div class="deck-face" aria-hidden="true">{a?.emoji ?? "🙂"}</div>
        <h2>{person.nickname}</h2>
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
    { title: t("ปัดดูบัดดี้", "Buddy deck"), tab: "buddy" },
    <>
      <p class="spread">
        <a href="/buddy">← {t("บัดดี้", "Buddy")}</a>
        <small class="muted">{t(`วันนี้เหลือ ${st.left}`, `${st.left} left today`)}</small>
      </p>
      <h1>🃏 {t("ปัดดูคนที่อาจเป็นบัดดี้", "Flick through people")}</h1>
      <p class="muted">
        {t(
          "สนใจ = ช่วยให้รอบจับคู่ถัดไปเลือกคนนี้ก่อน ไม่ใช่การจับคู่ทันที และอีกฝ่ายจะไม่รู้ ไม่มีรูป เลือกจากตัวตน",
          "Keen helps the next daily round put this person first. It isn't a match, and they never see it. No photos: pick on vibe.",
        )}
      </p>
      {!st.self ? (
        <Notice kind="info">{t("ทำแบบทดสอบไทป์กรุงเทพฯ ก่อน แล้วค่อยมาปัดดู", "Take the Bangkok Type quiz first, then come back.")}</Notice>
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
              <button class="deck-btn pass" aria-label={t("ผ่าน", "Pass")}>✕</button>
            </form>
            <form method="post" action="/buddy/deck" data-choice="keen">
              <input type="hidden" name="target" value={next} />
              <input type="hidden" name="choice" value="keen" />
              <button class="deck-btn keen" aria-label={t("สนใจ", "Keen")}>★</button>
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

/** Drag the top card left (pass) or right (keen); the buttons do the same without a pointer. */
const DECK_JS = `(function(){var c=document.querySelector("[data-deck]");if(!c)return;var x0=null,dx=0;
function send(k){var f=document.querySelector('form[data-choice="'+k+'"]');c.style.transition="transform .25s ease";c.style.transform="translateX("+(k==="keen"?600:-600)+"px) rotate("+(k==="keen"?18:-18)+"deg)";setTimeout(function(){f.submit()},180)}
c.addEventListener("pointerdown",function(e){x0=e.clientX;dx=0;c.setPointerCapture(e.pointerId);c.style.transition="none"});
c.addEventListener("pointermove",function(e){if(x0===null)return;dx=e.clientX-x0;c.style.transform="translateX("+dx+"px) rotate("+dx/18+"deg)";c.classList.toggle("is-keen",dx>40);c.classList.toggle("is-pass",dx<-40)});
function up(){if(x0===null)return;x0=null;if(dx>110)send("keen");else if(dx<-110)send("pass");else{c.style.transition="transform .2s ease";c.style.transform="";c.classList.remove("is-keen","is-pass")}}
c.addEventListener("pointerup",up);c.addEventListener("pointercancel",up);
document.querySelectorAll("form[data-choice]").forEach(function(f){f.addEventListener("submit",function(e){if(f.dataset.sent)return;e.preventDefault();f.dataset.sent="1";send(f.dataset.choice)})})})()`;
