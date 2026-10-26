/**
 * Member event flows (PRD §7–§10, §13.1, §24):
 *
 *   GET  /events                     Discover — "What can I do in Bangkok this week?"
 *                                    (also sends a pending bkk_invite cookie back to /invite/:token)
 *   POST /events/quiz-hint/dismiss   Hide the "Find your Bangkok Type" card (cookie)
 *   GET  /events/:id                 Event detail, my registration state, buddy box, invite box
 *   GET  /events/:id/cover           Cover image (signed-URL redirect; bytes only locally)
 *   POST /events/:id/invite          Create or reuse my +1 invite link (PRD §8.2)
 *   POST /events/:id/rsvp            RSVP (age, strikes, single-upcoming, seats, quota, +1, buddy)
 *   POST /events/:id/cancel          Cancel (late cancel = 1 strike)
 *   POST /events/:id/offer           Accept / decline a waitlist offer
 *   GET  /events/:id/live            Onsite page after check-in
 *   POST /events/:id/signal          Social signal (§9.2)
 *   GET  /events/:id/feedback        Post-event feedback form
 *   POST /events/:id/feedback        Save (upsert) feedback
 *   GET  /me/events                  My events + private strike standing
 *   GET  /me/events/:id/pass         Personal event pass (QR + short code)
 *
 * Every route is member-only. Middleware is attached per route (never with
 * `use("*")`): this sub-app is mounted at "/" and must not touch other areas.
 */
// Parts register their routes on import, in the original file's order.
import "./shared";
import "./discover";
import "./detail";
import "./rsvp";
import "./actions";
import "./my-events";
import "./pass";
import "./live";
import "./feedback";
export { eventRoutes } from "./app";
export { whenWindow, ageText, costText, coverEmoji, INVITE_COOKIE, INVITE_TOKEN_RE, coverSrc, directionsUrl, eventIcs, byMonth, firstName } from "./shared";
export { SMALL_TABLE_MAX, rankPopular } from "./discover";
export { hostTextLead, StatusStrip } from "./detail";
export { rsvpGate, commitRsvp } from "./rsvp";
export type { RsvpRefusal } from "./rsvp";
export { pastCutoff } from "./my-events";
export { PassSteps } from "./pass";
