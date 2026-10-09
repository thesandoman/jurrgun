import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // A fresh, separate database for every run (see test/global-setup.ts).
    globalSetup: ["./test/global-setup.ts"],
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/cloud_test",
    },
  },
});
