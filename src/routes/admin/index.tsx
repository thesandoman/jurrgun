/**
 * Staff area (/admin). Each module owns its own paths and role checks.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../lib/env";
import { requireRole } from "../../lib/session";
import { adminEvents } from "./events";
import { adminDashboard } from "./dashboard";
import { adminModeration } from "./moderation";
import { adminUsers } from "./users";
import { adminPulse } from "./pulse";
import { adminPulseSuggestions } from "./pulse-suggestions";
import { adminInsights } from "./insights";
import { adminPartners } from "./partners";
import { adminAudit } from "./audit";
import { adminReview } from "./review";
import { adminQuizHealth } from "./quiz-health";
import { adminFeeds, adminPartnerReview } from "./outside";

export const adminRoutes = new Hono<AppEnv>();

// Anyone who isn't plain staff is turned away here; modules narrow further.
adminRoutes.use("*", requireRole("host", "partner_admin", "circle_head", "moderator", "insight_viewer"));

adminRoutes.route("/", adminDashboard);
adminRoutes.route("/events", adminEvents);
adminRoutes.route("/moderation", adminModeration);
adminRoutes.route("/users", adminUsers);
adminRoutes.route("/pulse", adminPulse);
adminRoutes.route("/pulse-suggestions", adminPulseSuggestions);
adminRoutes.route("/insights", adminInsights);
adminRoutes.route("/partners", adminPartners);
adminRoutes.route("/audit", adminAudit);
adminRoutes.route("/review", adminReview);
adminRoutes.route("/quiz-health", adminQuizHealth);
adminRoutes.route("/feeds", adminFeeds);
adminRoutes.route("/partner-review", adminPartnerReview);
