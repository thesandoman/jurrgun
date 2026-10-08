// Points the migration tooling at your LOCAL database only. Do not edit — see
// AGENTS.md §2. Change your TABLES in src/schema.ts instead.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/cloud_dev",
  },
});
