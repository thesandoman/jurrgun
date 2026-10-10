/**
 * Gives each test run its OWN database, built fresh and dropped afterwards, so
 * test data never piles up in the development database (cloud_dev), tests
 * never depend on what earlier runs left behind, and two runs at the same time
 * (two terminals, an agent and a person) never wipe each other's data.
 *
 * The name comes from vitest.config.ts (cloud_test_<pid>). Databases left by
 * runs that crashed are cleaned up on the next run. If Postgres isn't
 * reachable (CI), it does nothing and the database-backed tests skip.
 */
import postgres from "postgres";
import { MIGRATIONS } from "../src/migrations";

export const TEST_DB = process.env.TEST_DB_NAME ?? `cloud_test_${process.pid}`;
const SERVER = process.env.TEST_PG_SERVER ?? "postgres://postgres:postgres@localhost:5432";

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export default async function setup(): Promise<(() => Promise<void>) | void> {
  if (!/^cloud_test_\w+$/.test(TEST_DB)) throw new Error(`refusing to use test database name ${TEST_DB}`);
  const admin = postgres(`${SERVER}/postgres`, { max: 1, connect_timeout: 2, onnotice: () => {} });
  try {
    await admin`select 1`;
  } catch {
    await admin.end({ timeout: 1 }).catch(() => {});
    return; // no Postgres here: integration tests will skip
  }
  // Leftovers from runs whose process is gone (crashed or killed).
  const stale = await admin<{ datname: string }[]>`select datname from pg_database where datname like 'cloud_test_%'`;
  for (const { datname } of stale) {
    const pid = Number(datname.slice("cloud_test_".length));
    if (datname !== TEST_DB && Number.isInteger(pid) && !alive(pid)) await admin.unsafe(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`);
  }
  await admin.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB}" WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE "${TEST_DB}"`);
  await admin.end();

  const db = postgres(`${SERVER}/${TEST_DB}`, { max: 1, onnotice: () => {} });
  try {
    for (const m of MIGRATIONS) for (const s of m.statements) await db.unsafe(s);
  } finally {
    await db.end();
  }

  return async () => {
    const end = postgres(`${SERVER}/postgres`, { max: 1, onnotice: () => {} });
    await end.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB}" WITH (FORCE)`).catch(() => {});
    await end.end();
  };
}
