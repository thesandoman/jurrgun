/**
 * Profile cards (the "bio"):
 *
 *   GET /me/profile                     my own card, as others see it, with Edit
 *   GET /people/:accountId              someone's card
 *   GET /people/:accountId/photo/:slot  their main photo ("main") or a photo
 *                                       prompt's image (slot = prompt id)
 *
 * Who may see a card (else 404, so nobody learns whether an account exists):
 * the person themself, or a member who checked in at the same event as them
 * or has an active connection with them, as long as neither has blocked the
 * other and the account is active.
 *
 * Mounted at "/", so middleware is attached per route, never with use("*").
 */
import { Hono, type Context } from "hono";
import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { getDb } from "../db";
import { cleanBio, currentDeck, universityKey } from "../content/profile";
import type { AppEnv } from "../lib/env";
import { requireMember } from "../lib/session";
import { accounts, blocks, connections, profiles, registrations, type Account, type Profile } from "../schema";
import { getObject, getObjectUrl } from "../storage";
import { LinkButton, page, view } from "../ui/kit";
import { ProfileCard, type CardPerson } from "../ui/profile-card";
import { ResidentTag, showsResidentBadge, TypeSpark, vibesFor } from "./people";

export const profileRoutes = new Hono<AppEnv>();

type Ctx = Context<AppEnv>;
type Db = ReturnType<typeof getDb>;

/** Active, or a suspension that has already run out (same rule as people.tsx). */
function isActive(a: { status: string; suspendedUntil: Date | null }, now = new Date()): boolean {
  if (a.status === "active") return true;
  return a.status === "suspended" && !!a.suspendedUntil && a.suspendedUntil.getTime() <= now.getTime();
}

/** Display-safe fields only. Never age, username, relationship or romance data. */
export function cardPerson(p: Profile): CardPerson {
  const bio = cleanBio(p.bio);
  return {
    accountId: p.accountId,
    nickname: p.nickname,
    pronouns: p.showPronouns && p.pronouns ? p.pronouns : null,
    district: p.district,
    languages: p.languages,
    interests: p.interests,
    intents: p.intents.filter((i) => i !== "romance"),
    newcomer: p.newcomer,
    legacy: p.prompts ?? {},
    bio,
    deck: currentDeck(p.accountId, bio),
  };
}

/**
 * The target's account and profile if `viewerId` may see their card, else
 * null. Four small indexed queries, run together.
 */
export async function visibleProfile(db: Db, viewerId: string, targetId: string): Promise<{ account: Account; profile: Profile } | null> {
  const [rows, blocked, conn, shared] = await Promise.all([
    db.select({ account: accounts, profile: profiles }).from(accounts).innerJoin(profiles, eq(profiles.accountId, accounts.id)).where(eq(accounts.id, targetId)).limit(1),
    viewerId === targetId
      ? Promise.resolve([])
      : db
          .select({ id: blocks.id })
          .from(blocks)
          .where(or(and(eq(blocks.blocker, viewerId), eq(blocks.blocked, targetId)), and(eq(blocks.blocker, targetId), eq(blocks.blocked, viewerId))))
          .limit(1),
    viewerId === targetId
      ? Promise.resolve([])
      : db
          .select({ id: connections.id })
          .from(connections)
          .where(
            and(
              isNull(connections.removedAt),
              or(and(eq(connections.aAccount, viewerId), eq(connections.bAccount, targetId)), and(eq(connections.aAccount, targetId), eq(connections.bAccount, viewerId))),
            ),
          )
          .limit(1),
    viewerId === targetId
      ? Promise.resolve([])
      : db
          .select({ id: registrations.id })
          .from(registrations)
          .where(
            and(
              eq(registrations.accountId, targetId),
              isNotNull(registrations.checkedInAt),
              inArray(
                registrations.eventId,
                db
                  .select({ eventId: registrations.eventId })
                  .from(registrations)
                  .where(and(eq(registrations.accountId, viewerId), isNotNull(registrations.checkedInAt))),
              ),
            ),
          )
          .limit(1),
  ]);
  const row = rows[0];
  if (!row || !row.profile.onboardedAt) return null;
  if (viewerId === targetId) return row;
  if (!isActive(row.account)) return null;
  if (blocked.length) return null;
  if (!conn.length && !shared.length) return null;
  return row;
}

const photoUrl = (accountId: string, slot: string) => `/people/${encodeURIComponent(accountId)}/photo/${encodeURIComponent(slot)}`;

async function renderCard(c: Ctx, target: { account: Account; profile: Profile }, self: boolean) {
  const v = view(c);
  const { t } = v;
  const me = c.var.user!;
  const db = getDb(c.env);
  const person = cardPerson(target.profile);
  const vibes = await vibesFor(db, self ? [me.account.id] : [target.account.id, me.account.id]);
  const theirVibe = vibes.get(target.account.id);
  const resident = showsResidentBadge(target.account, target.profile);
  const badges =
    resident || theirVibe?.visible ? (
      <>
        {resident ? <ResidentTag v={v} /> : null}
        <TypeSpark v={v} theirs={theirVibe} mine={self ? undefined : vibes.get(me.account.id)} />
      </>
    ) : null;
  const answered = Object.keys(person.bio.answers ?? {}).filter((id) => person.deck.includes(id)).length;
  return page(
    c,
    { title: self ? t("โปรไฟล์ของฉัน", "My profile") : person.nickname, tab: self ? "me" : "connections" },
    <>
      <p>
        <a href={self ? "/settings" : "/connections"}>← {self ? t("ฉัน", "Me") : t("คนรู้จัก", "My circle")}</a>
      </p>
      {self ? (
        <p class="muted">{t("นี่คือสิ่งที่คนที่เคยเจอกันในกิจกรรมจะเห็น", "This is what people you've met at events will see.")}</p>
      ) : null}
      <ProfileCard
        v={v}
        person={person}
        photo={target.profile.photoKey ? photoUrl(target.account.id, "main") : null}
        promptPhoto={(id) => photoUrl(target.account.id, id)}
        badges={badges}
        viewerInterests={self ? null : (me.profile?.interests ?? [])}
        viewerUniversity={self ? null : universityKey(cleanBio(me.profile?.bio))}
        actions={
          self ? (
            <>
              <LinkButton href="/settings/profile">✏️ {t("แก้ไขโปรไฟล์", "Edit profile")}</LinkButton>
              {answered < 3 ? <LinkButton href="/settings/profile#prompts" kind="ghost">💬 {t("ตอบคำถามเพิ่ม", "Answer a few prompts")}</LinkButton> : null}
            </>
          ) : undefined
        }
      />
      {self ? null : (
        <p class="row muted">
          <a href={`/report?account=${encodeURIComponent(target.account.id)}`}>{t("รายงาน", "Report")}</a>
        </p>
      )}
    </>,
  );
}

profileRoutes.get("/me/profile", requireMember, async (c) => {
  const me = c.var.user!;
  return renderCard(c, { account: me.account, profile: me.profile! }, true);
});

profileRoutes.get("/people/:accountId", requireMember, async (c) => {
  const me = c.var.user!;
  const id = c.req.param("accountId");
  if (id === me.account.id) return c.redirect("/me/profile");
  const target = await visibleProfile(getDb(c.env), me.account.id, id);
  if (!target) return c.notFound();
  return renderCard(c, target, false);
});

/** A card photo. Same access rule as the card. Deployed: redirect to a signed URL; locally: the bytes. */
profileRoutes.get("/people/:accountId/photo/:slot", requireMember, async (c) => {
  const me = c.var.user!;
  const id = c.req.param("accountId");
  const slot = c.req.param("slot");
  const target = await visibleProfile(getDb(c.env), me.account.id, id);
  if (!target) return c.notFound();
  const key = slot === "main" ? target.profile.photoKey : (cleanBio(target.profile.bio).answers?.[slot]?.photoKey ?? null);
  if (!key || !key.startsWith(`uploads/${id}/`)) return c.notFound();
  if (c.env.FILES) {
    return new Response(null, { status: 302, headers: { location: await getObjectUrl(c.env, key), "cache-control": "private, max-age=60" } });
  }
  const obj = await getObject(c.env, key).catch(() => null);
  if (!obj) return c.notFound();
  return new Response(obj.body, { headers: { "content-type": obj.metadata.contentType ?? "application/octet-stream", "cache-control": "private, max-age=60" } });
});
