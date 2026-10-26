/**
 * Settings ("Me" tab): profile, connection preferences, Privacy Center
 * (PRD §12.2), data export, deactivation and password change.
 *
 *   GET  /settings                  hub
 *   GET  /settings/profile          edit profile (+ optional photo, PRD §5.3)
 *   POST /settings/profile
 *   GET  /settings/photo            my own photo (redirect to a signed URL; bytes only locally)
 *   GET  /settings/connections      relationship, age preference, romance mode (PRD §4.4)
 *   POST /settings/connections
 *   GET  /settings/privacy          Privacy Center: consents, data stores, retention
 *   POST /settings/privacy          appends NEW consent rows for changed categories
 *   GET  /settings/privacy/export   JSON download of my data
 *   POST /settings/deactivate
 *   GET  /settings/password
 *   POST /settings/password
 *   POST /settings/badge            show / hide the Registered Resident badge (verified only)
 */
// Parts register their routes on import, in the original file's order.
import "./shared";
import "./hub";
import "./profile";
import "./connections";
import "./privacy";
import "./account";
import "./dating";
export { settingsRoutes } from "./app";
