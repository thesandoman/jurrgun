# Who on staff can see what

*Audited 2026-10-15 (task 11). The BMA is Jurrgun's main host, moderator and oversight admin, so BMA staff hold these roles. The rule (PRD v3 §3.4, §13.0, and the privacy notice): staff see what safety needs, never a member's private life. `test/staff-privacy.integration.test.ts` checks this on every page for every staff role.*

## Roles

| Role | Who | Pages |
|---|---|---|
| `bma_admin` | BMA oversight admins, Jurrgun admins | Everything below (passes every role check), plus partners, City Pulse admin, the audit log and retention |
| `moderator` | BMA and Jurrgun moderators | Overview, moderation (reports), the review queue (event proposals, Table Host requests), users |
| `insight_viewer` | BMA strategy and data unit | Overview and City Insight (totals only) |
| `host`, `partner_admin`, `circle_head` (Table Host) | Hosts and partners | Their own events and their insights |

## What staff can and can't see

| Data | Staff see it? | Where it's enforced |
|---|---|---|
| Username, nickname, district, role, account status, strikes, verification | ✅ (moderators, admins) | `admin/users.tsx` selects these columns only (the `basics` column list) |
| Reports and their evidence (including a reported chat message) | ✅ (moderators, admins) | `admin/moderation.tsx` |
| Relationship status | ❌ never | not selected anywhere in `admin/`. The audit log redacts it |
| Open to something more (romance mode), its consent, open-to, orientation, gender identity, dating prompts and answers, dating intents | ❌ never | not selected in `admin/`. Audit details redact these keys on write and on display (`redactSensitive` in `src/lib/records.ts`) |
| Private gender for women-only spaces | ❌ never | not selected in `admin/` |
| Private choices after events (People I Met) | ❌ never | only mutual results become connections; staff pages don't read `connection_choices` |
| Members' chats | ❌ unless reported | chat threads open only to their members (`resolveThread`). Staff have no bypass |
| Members' profile cards | ❌ unless they are connected, like anyone else | `visibleProfile` in `routes/profile.tsx` |
| City Pulse answers | Totals only, from 10 or more people | `admin/pulse.tsx` and the CSV export suppress cells under 10 |
| City Insight | Totals only, from 10 or more people | `admin/insights.tsx` suppresses counts and ratios under 10 |

## What changed in this audit

1. **Leak closed:** a member's consent change was written to the audit log with the consent names. A `romance_data` entry showed an admin who had switched "Open to something more" on or off. Audit details now redact every private key (romance, relationship, gender, orientation, dating, open-to, women-only, pronouns) when written, and the audit page redacts them from older rows too. Stored rows are not edited.
2. The audit entry for a relationship change is now a neutral `profile.private_updated`, so the log doesn't single out relationship switches.
3. Regression test: every staff role visits every staff page with a member who has romance on, orientation, gender identity and a dating answer set. None of it may appear. Staff can't open a chat or profile they aren't part of.

## Open (for the owner)

- **Report evidence:** when a member reports a chat message, moderators see that message, which is needed to act on it. If a report is about romance-related behaviour, the message may reveal it. That's expected for safety. Moderators are bound by the code of conduct.
- **BMA staff accounts:** give BMA people `moderator` or `insight_viewer` unless they need the full admin area. `bma_admin` also manages partners, roles and retention.
