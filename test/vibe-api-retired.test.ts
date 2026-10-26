/**
 * The public Bangkok Vibe prototype API is retired (owner card C1, 2026-10-26).
 * Both routes must stay gone; the member quiz lives at /quiz.
 */
import { describe, expect, it } from "vitest";
import app from "../src/index";

describe("retired /api/vibe routes", () => {
  it("GET /api/vibe/quiz is not found", async () => {
    expect((await app.request("/api/vibe/quiz?seed=demo&lang=en")).status).toBe(404);
  });

  it("POST /api/vibe/score is not found", async () => {
    const res = await app.request("/api/vibe/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seed: "demo", answers: {} }),
    });
    expect(res.status).toBe(404);
  });
});
