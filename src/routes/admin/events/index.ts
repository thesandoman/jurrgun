/**
 * Staff event management (/admin/events) — PRD §7.1, §8, §9, §10.5, §13.0,
 * §13.1, §20, §24.
 *
 * Roles: host, partner_admin, bma_admin (bma_admin passes every check).
 *   bma_admin      sees and edits every event
 *   partner_admin  sees and edits events of their own partner org (and events
 *                  they host); creates events only for their own org
 *   host           sees and OPERATES only events they host (check-in, groups,
 *                  prompts, notices, no-shows, buddy round); never edits details
 *
 * Every handler that touches one event goes through `withEvent`, which loads
 * the event and answers 404 when the caller may not see it.
 *
 * Privacy (§13.0): staff pages never show relationship status, romance data,
 * gender identity, age preferences or connection choices. Usernames are shown
 * to bma_admin only.
 */
// Parts register their routes on import, in the original file's order.
import "./shared";
import "./list";
import "./edit";
import "./operations";
import "./check-in";
import "./groups";
import "./follow-up";
export { adminEvents } from "./app";
export { ORGANISER_MAX_CAPACITY, toBkkInput, fromBkkInput } from "./shared";
export { separateBlocked } from "./groups";
