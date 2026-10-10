import { defineConfig } from "vitest/config";

// Every run gets its own database (see test/global-setup.ts): two runs at once
// (two terminals, an agent and a person) must never drop each other's data.
const testDb = process.env.TEST_DB_NAME ?? `cloud_test_${process.pid}`;
process.env.TEST_DB_NAME = testDb;

export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.ts"],
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? `postgres://postgres:postgres@localhost:5432/${testDb}`,
    },
  },
});
