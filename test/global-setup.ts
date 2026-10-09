/**
 * Gives the test suite its OWN database, rebuilt fresh on every run, so test
 * data never piles up in the development database (cloud_dev) and tests never
 * depend on what earlier runs left behind.
 *
 * `cloud_test` is created and owned by this file alone. If Postgres isn't
 * reachable (CI), it does nothing and the database-backed tests skip.
 */
import postgres from "postgres";
import { MIGRATIONS } from "../src/migrations";

export const TEST_DB = "cloud_test";
const SERVER = process.env.TEST_PG_SERVER ?? "postgres://postgres:postgres@localhost:5432";

export default async function setup(): Promise<void> {
  const admin = postgres(`${SERVER}/postgres`, { max: 1, connect_timeout: 2, onnotice: () => {} });
  try {
    await admin`select 1`;
  } catch {
    await admin.end({ timeout: 1 }).catch(() => {});
    return; // no Postgres here: integration tests will skip
  }
  await admin.unsafe(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  const db = postgres(`${SERVER}/${TEST_DB}`, { max: 1, onnotice: () => {} });
  try {
    for (const m of MIGRATIONS) for (const s of m.statements) await db.unsafe(s);
  } finally {
    await db.end();
  }
}
