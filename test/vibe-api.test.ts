/**
 * Bangkok Vibe quiz API routes.
 */
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { generateSession } from "../src/vibe/generator";
import { answersAs } from "./quiz-helpers";

describe("GET /api/vibe/quiz", () => {
  it("returns a balanced public session for a seed", async () => {
    const res = await app.request("/api/vibe/quiz?seed=demo");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { seed: string; questions: { id: string }[] };
    expect(body.seed).toBe("demo");
    expect(body.questions).toHaveLength(16);
    expect(JSON.stringify(body)).not.toMatch(/"type"|"district"|"flavour"|BDMN|CFSH/);
  });

  it("flattens to one language when asked", async () => {
    const res = await app.request("/api/vibe/quiz?seed=demo&lang=th");
    const body = (await res.json()) as { questions: { prompt: unknown }[] };
    expect(typeof body.questions[0].prompt).toBe("string");
  });

  it("makes up a seed when none is given", async () => {
    const body = (await (await app.request("/api/vibe/quiz")).json()) as { seed: string };
    expect(body.seed).toMatch(/^[a-f0-9]{32}$/);
  });

  it("rejects bad input with 400", async () => {
    expect((await app.request("/api/vibe/quiz?seed=<script>")).status).toBe(400);
    expect((await app.request("/api/vibe/quiz?seed=a&per=99")).status).toBe(400);
    expect((await app.request("/api/vibe/quiz?seed=a&lang=fr")).status).toBe(400);
  });
});

describe("POST /api/vibe/score", () => {
  const post = (body: unknown) =>
    app.request("/api/vibe/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  it("scores answers against the session rebuilt from the seed", async () => {
    const qs = generateSession({ seed: "s1" });
    const res = await post({ seed: "s1", answers: answersAs(qs, "BDMN") });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { answered: number; vector: Record<string, number>; unsure: string[] };
    expect(body.answered).toBe(16);
    for (const c of ["energy", "explore", "motion", "culture"]) expect(body.vector[c]).toBeGreaterThan(0);
  });

  it("ignores answers to questions that aren't in the session", async () => {
    const body = (await (await post({ seed: "s1", answers: { nope: 1 } })).json()) as { answered: number };
    expect(body.answered).toBe(0);
  });

  it("rejects bad input with 400", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post({ answers: {} })).status).toBe(400);
    expect((await post({ seed: "s1", answers: [] })).status).toBe(400);
  });
});
