import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import OpenAI from "openai";
import { APIConnectionTimeoutError, RateLimitError, BadRequestError } from "openai/error";
import { createApp } from "../src/app";
import { TaskService } from "../src/services/task-service";
import { InMemoryTaskRepository } from "../src/repositories/in-memory-task-repository";
import { TaskClassifyService } from "../src/llm/classify-service";
import { extractJsonText, tryParseClassification } from "../src/llm/parse";
import { taskClassificationSchema } from "../src/llm/schema";

const VALID_JSON =
  '{"category":"bug","priority":"high","suggested_team":"backend","confidence":0.9,"reason":"Auth endpoint crashes on invalid passwords."}';

function fakeClient(responses: Array<string | ((params: { messages: { content: string }[] }) => string)>): OpenAI {
  let call = 0;
  return {
    chat: {
      completions: {
        create: async (params: { messages: { content: string }[] }) => {
          const spec = responses[Math.min(call, responses.length - 1)];
          const content = typeof spec === "function" ? spec(params) : spec;
          call += 1;
          return {
            choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          };
        },
      },
    },
  } as unknown as OpenAI;
}

function buildApp(service: TaskClassifyService) {
  return createApp(new TaskService(new InMemoryTaskRepository()), undefined, service);
}

function fakeClientWithCalls(
  behaviors: Array<{ error?: Error; content?: string }>
): { client: OpenAI; calls: string[] } {
  const calls: string[] = [];
  const client = {
    chat: {
      completions: {
        create: async (params: { messages: { content: string }[] }) => {
          const user = params.messages.find((m) => m.role === "user")!.content;
          calls.push(user);
          const behavior = behaviors[Math.min(calls.length - 1, behaviors.length - 1)];
          if (behavior.error) throw behavior.error;
          return {
            choices: [{ index: 0, message: { role: "assistant", content: behavior.content }, finish_reason: "stop" }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          };
        },
      },
    },
  } as unknown as OpenAI;
  return { client, calls };
}

describe("TaskClassifyService.extractJsonText", () => {
  it("passes plain JSON through", () => {
    expect(extractJsonText(VALID_JSON)).toBe(VALID_JSON);
  });

  it("strips a json code fence", () => {
    expect(extractJsonText("```json\n" + VALID_JSON + "\n```")).toBe(VALID_JSON);
  });

  it("extracts JSON embedded in prose", () => {
    expect(extractJsonText("Here you go: " + VALID_JSON + " thanks!")).toBe(VALID_JSON);
  });
});

describe("TaskClassifyService.tryParseClassification", () => {
  it("accepts a valid classification", () => {
    const result = tryParseClassification(VALID_JSON);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.category).toBe("bug");
  });

  it("rejects an invented category", () => {
    const result = tryParseClassification(
      '{"category":"sports","priority":"low","suggested_team":"unassigned","confidence":0.5,"reason":"nope."}'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("category");
  });

  it("rejects extra fields (closed schema)", () => {
    const result = tryParseClassification(
      '{"category":"bug","priority":"low","suggested_team":"backend","confidence":0.5,"reason":"x.","evil":"x"}'
    );
    expect(result.ok).toBe(false);
  });

  it("rejects non-JSON text without throwing", () => {
    const result = tryParseClassification("This is not JSON at all");
    expect(result.ok).toBe(false);
  });
});

describe("POST /tasks/classify", () => {
  let quarantineDir: string;

  beforeEach(() => {
    process.env.LLM_STUB = "";
    delete process.env.LLM_STUB;
    quarantineDir = fs.mkdtempSync(path.join(os.tmpdir(), "classify-quarantine-"));
  });

  afterEach(() => {
    fs.rmSync(quarantineDir, { recursive: true, force: true });
  });

  it("returns 503 when the classifier is not wired", async () => {
    const app = createApp(new TaskService(new InMemoryTaskRepository()));
    const res = await request(app)
      .post("/tasks/classify")
      .send({ description: "anything" });
    expect(res.status).toBe(503);
  });

  it("rejects an empty description with 400 naming the field", async () => {
    const app = buildApp(new TaskClassifyService());
    const res = await request(app).post("/tasks/classify").send({ description: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("description");
  });

  it("returns the stub classification when LLM_STUB=1", async () => {
    process.env.LLM_STUB = "1";
    const app = buildApp(new TaskClassifyService());
    const res = await request(app)
      .post("/tasks/classify")
      .send({ description: "Fix the login endpoint" });
    expect(res.status).toBe(200);
    expect(taskClassificationSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.category).toBe("feature");
  });

  it("parses, validates and returns the model's classification", async () => {
    const app = buildApp(new TaskClassifyService(fakeClient([VALID_JSON])));
    const res = await request(app)
      .post("/tasks/classify")
      .send({ description: "Fix the login endpoint" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(JSON.parse(VALID_JSON));
  });

  it("strips code fences from the model output", async () => {
    const app = buildApp(new TaskClassifyService(fakeClient(["```json\n" + VALID_JSON + "\n```"])));
    const res = await request(app)
      .post("/tasks/classify")
      .send({ description: "Fix the login endpoint" });
    expect(res.status).toBe(200);
    expect(res.body.category).toBe("bug");
  });

  it("repairs once when the first model response is invalid", async () => {
    const app = buildApp(
      new TaskClassifyService(fakeClient(["This is not JSON at all", VALID_JSON]), quarantineDir)
    );
    const res = await request(app)
      .post("/tasks/classify")
      .send({ description: "Fix the login endpoint" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(JSON.parse(VALID_JSON));
  });

  it("returns 422 and quarantines when repair also fails", async () => {
    const app = buildApp(
      new TaskClassifyService(fakeClient(["garbage", "more garbage"]), quarantineDir)
    );
    const res = await request(app)
      .post("/tasks/classify")
      .send({ description: "Fix the login endpoint" });
    expect(res.status).toBe(422);

    const line = fs.readFileSync(path.join(quarantineDir, "quarantine.jsonl"), "utf8").trim();
    const entry = JSON.parse(line);
    expect(entry.input).toBe("Fix the login endpoint");
    expect(entry.promptVersion).toBe("classify-task-v1");
    expect(entry.error).toBeTruthy();
  });

  it("never leaks raw model text to the caller", async () => {
    const app = buildApp(new TaskClassifyService(fakeClient(["garbage", "more garbage"]), quarantineDir));
    const res = await request(app)
      .post("/tasks/classify")
      .send({ description: "Fix the login endpoint" });
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).not.toContain("garbage");
  });
});

describe("POST /tasks/classify — Stage 4 behavior", () => {
  let quarantineDir: string;

  beforeEach(() => {
    process.env.LLM_STUB = "";
    delete process.env.LLM_STUB;
    process.env.LLM_ENABLED = "";
    delete process.env.LLM_ENABLED;
    quarantineDir = fs.mkdtempSync(path.join(os.tmpdir(), "classify-quarantine-"));
  });

  afterEach(() => {
    fs.rmSync(quarantineDir, { recursive: true, force: true });
  });

  it("kill switch: LLM_ENABLED=false returns 503 without calling the model", async () => {
    process.env.LLM_ENABLED = "false";
    let called = false;
    const client = {
      chat: {
        completions: {
          create: async () => {
            called = true;
            throw new Error("should never be called");
          },
        },
      },
    } as unknown as OpenAI;
    const app = buildApp(new TaskClassifyService(client, quarantineDir));
    const res = await request(app)
      .post("/tasks/classify")
      .send({ description: "anything" });
    expect(res.status).toBe(503);
    expect(called).toBe(false);
  });

  it("retries on 429 honoring Retry-After, then succeeds", async () => {
    const { client, calls } = fakeClientWithCalls([
      { error: new RateLimitError(429, { message: "rate limited" }, { "retry-after": "0" }) },
      { content: VALID_JSON },
    ]);
    const app = buildApp(new TaskClassifyService(client, quarantineDir));
    const res = await request(app)
      .post("/tasks/classify")
      .send({ description: "Fix the login endpoint" });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toBe("Fix the login endpoint");
    expect(calls[1]).toBe("Fix the login endpoint");
  });

  it("does not retry on 400 — fails fast with 503", async () => {
    const { client, calls } = fakeClientWithCalls([
      { error: new BadRequestError(400, { message: "bad request" }, "bad request", undefined) },
    ]);
    const app = buildApp(new TaskClassifyService(client, quarantineDir));
    const res = await request(app)
      .post("/tasks/classify")
      .send({ description: "Fix the login endpoint" });
    expect(res.status).toBe(503);
    expect(calls).toHaveLength(1);
  });

  it("returns 504 when the request times out through all retries", async () => {
    const { client, calls } = fakeClientWithCalls([
      { error: new APIConnectionTimeoutError({ message: "timed out" }) },
      { error: new APIConnectionTimeoutError({ message: "timed out" }) },
      { error: new APIConnectionTimeoutError({ message: "timed out" }) },
      { error: new APIConnectionTimeoutError({ message: "timed out" }) },
    ]);
    const app = buildApp(new TaskClassifyService(client, quarantineDir));
    const res = await request(app)
      .post("/tasks/classify")
      .send({ description: "Fix the login endpoint" });
    expect(res.status).toBe(504);
    expect(calls).toHaveLength(4);
  }, 15000);
});
