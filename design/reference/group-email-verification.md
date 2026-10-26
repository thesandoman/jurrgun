# Verified groups by email domain (design, not built)

Owner card 4, 2026-10-26: **join codes only for now.** This note is the design for the rest of D57 (3), "verified groups only, by email domain or join code, never by ID documents". Build it when the first university or club partner asks for it. Owner: Partners.

## What members see

A partner university or club runs an event "for Chula students and staff". Today the member types a join code the club handed out. With this design, the member can instead prove they belong once:

1. On the event (or in Settings, "My groups"), they tap **Verify with my Chula email** / **ยืนยันด้วยอีเมล Chula**.
2. They type an address ending in one of the partner's domains, for example `@student.chula.ac.th`.
3. A 6-digit code arrives at that address. They type it back.
4. They now show as **Verified for Chula until 31 Jul 2027**. Every event of that partner restricted to that group lets them book, with no code.

The join code keeps working beside it. Organisers choose per event: code, email, or either.

## What is stored (and what is not)

- **Never stored:** the address itself, or any copy of it. It is used once to send the code and then dropped.
- **Stored:** one row per member and group, `identity_group_verifications`:
  - `id`, `account_id`, `partner_org_id`, `group_key` (which group, if one partner has several, e.g. students and staff)
  - `email_hash`: a keyed SHA-256 (HMAC with `EMAIL_HASH_SALT`, like `identity_email_links`), so one address can't verify two accounts for the same group
  - `verified_at`, `expires_at`
- **Domains:** each partner organisation gets an admin-only list, `partner_group_domains` (`partner_org_id`, `group_key`, `label_th`, `label_en`, `domain`, `valid_months`). Only a BMA or Jurrgun admin edits it, never the partner. That keeps a partner from widening it to `gmail.com`.
- **Codes:** reuse `identity_login_codes` and `src/services/email-code.ts` as they are. The limits, 10-minute expiry, 5 tries, per-address and per-network limits and 24-hour deletion all stay the same. A new `purpose` value (`group`) keeps these codes apart from sign-in codes.

**The partner sees:** "Verified members: 10 or more" from 10 up, counts only (the 10+ rule), and never who.

**Staff see:** nothing about a member's group. They see no row on `/admin/users`, and the audit log records `group.verify` without the domain.

## Rules

- **Domain match:** exact domain or a listed subdomain only. Domains are lower-cased and punycode-normalised, and no wildcards are typed by hand.
- **Expiry:** set by the domain row (default 12 months for students, 24 for staff). Thirty days before it, the member sees "Verify again to keep booking Chula events". Expired rows are deleted by retention.
- **Leaving:** the member can remove a verification any time in Settings, My groups. Account deletion and the data export include the rows (counted in the export, as for push subscriptions).
- **Mixing:**
  - An event restricted by email follows the same mixing rules as join-code groups.
  - Health partners never run email-restricted events, since a private talk should not tie attendance to an institution address.
  - 💘 events can't be group-restricted at all, so nobody's dating opt-in is linked to their workplace or school.
- **Abuse:**
  - One address can verify one account per group.
  - Removing a verification frees the address after 30 days, so it can't be passed around.
  - Moderators can revoke a verification from a report without ever seeing the address.

## Build checklist

1. **Migration (additive):** `partner_group_domains` and `identity_group_verifications`, plus `purpose` on `identity_login_codes` (default `login`). It ships alone first, per the migration ship order.
2. **Admin:** a domain list on `/admin/partners/:id`, BMA admin only.
3. **Event form:** the group rule gets "Join code / Email domain / Either".
4. **Member flow:** an event-page panel plus Settings, My groups, reusing the email-code screens.
5. **Retention:** expired verifications are deleted, and the export and deletion are covered.
6. **Privacy notice:** one line under "Who sees what" ("If you verify for a university or club, we keep that you're verified and until when, never your address"). Also update the record of processing.
7. **Tests:**
   - The address is never in the database.
   - A partner and staff never see who is verified.
   - Counts appear only from 10.
   - The domain must match exactly.
   - Expiry and re-verify work.
   - 💘 events can't be restricted.
8. **Needs:** `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM` and `EMAIL_HASH_SALT` set. Until they are, the email option stays hidden and join codes are the only way, as today.

## Open questions for when it's built

- Do universities want alumni included? Alumni addresses often outlive enrolment, so it would need its own group and expiry.
- Should a partner be able to see that a domain list exists, and ask an admin to change it?
