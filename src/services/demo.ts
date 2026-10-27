/**
 * Demo, seed and staff-test accounts (owner C2, 27 Oct 2026). identity_accounts.is_demo
 * marks them; every staff metric leaves them out, and so does anything hosted by one.
 *
 * SQL fragments only, for raw aggregate queries. Research tables are filtered by
 * research id without ever selecting an account: the subquery only removes rows.
 */
import { sql, type SQL } from "drizzle-orm";

/** Account ids flagged as demo. */
export const DEMO_ACCOUNTS = sql`(select id from identity_accounts where is_demo)`;
/** Research codes of demo accounts (research answers are keyed by code, not account). */
export const DEMO_RESEARCH_IDS = sql`(select research_id from identity_accounts where is_demo and research_id is not null)`;
/** Events hosted by a demo account. */
export const DEMO_EVENTS = sql`(select id from social_events where host_account_id in (select id from identity_accounts where is_demo))`;

/** `and <col> is not a demo account`. */
export const notDemo = (col: SQL): SQL => sql`and ${col} not in ${DEMO_ACCOUNTS}`;
/** `and <col> is not a demo event`. */
export const notDemoEvent = (col: SQL): SQL => sql`and ${col} not in ${DEMO_EVENTS}`;
/** `and <col> is not a demo research code`. */
export const notDemoResearch = (col: SQL): SQL => sql`and ${col} not in ${DEMO_RESEARCH_IDS}`;
