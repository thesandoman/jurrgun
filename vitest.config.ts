import { readdirSync, readFileSync } from "node:fs";
import { configDefaults, defineConfig } from "vitest/config";

// Every run gets its own database (see test/global-setup.ts): two runs at once
// (two terminals, an agent and a person) must never drop each other's data.
const testDb = process.env.TEST_DB_NAME ?? `cloud_test_${process.pid}`;
process.env.TEST_DB_NAME = testDb;

// Retention works on every row in the database, not just one test's rows, so a
// file that runs it (directly, or through the clock's retentionIfDue) can clear
// another file's rows between that file's inserts and its own run, and that
// file's counts come back 0. These files run in their own group, one file at a
// time, after every other file has finished. Any new test that calls one of
// these joins the group by itself.
const RETENTION_CALL = /\b(runRetention|retentionIfDue|runClock|onClockTask)\(/;
const retentionFiles = readdirSync("test")
  .filter((f) => /\.test\.tsx?$/.test(f) && RETENTION_CALL.test(readFileSync(`test/${f}`, "utf8")))
  .map((f) => `test/${f}`);

// Agent worktrees live under .claude/worktrees with their own copy of the tests.
const exclude = [...configDefaults.exclude, ".claude/**"];
const env = { DATABASE_URL: process.env.TEST_DATABASE_URL ?? `postgres://postgres:postgres@localhost:5432/${testDb}` };

export default defineConfig({
  test: {
    // Set here only, so it runs once per run. The projects below do not extend this
    // config: each one that did would run it again and rebuild the database.
    globalSetup: ["./test/global-setup.ts"],
    projects: [
      {
        test: {
          name: "parallel",
          env,
          exclude: [...exclude, ...retentionFiles],
        },
      },
      {
        test: {
          name: "retention",
          env,
          include: retentionFiles,
          exclude,
          sequence: { groupOrder: 1 },
          poolOptions: { forks: { singleFork: true } },
        },
      },
    ],
  },
});
