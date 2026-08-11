import fs from "fs";
import path from "path";
import { callLlm, ChatCompletionsApi, getClient } from "./client";
import { loadPrompt, PROMPT_VERSION } from "./prompt";
import { tryParseClassification } from "./parse";
import { TaskClassification, taskClassificationSchema } from "./schema";
import { ClassificationRejectedError, UpstreamUnavailableError } from "../services/errors";

const STUB_CLASSIFICATION: TaskClassification = taskClassificationSchema.parse({
  category: "feature",
  priority: "normal",
  suggested_team: "backend",
  confidence: 0.9,
  reason: "Stub mode: deterministic classification, no model call.",
});

interface CostLogEntry {
  event: "llm_cost";
  ts: string;
  mode: "stub" | "live";
  promptVersion: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  repairNeeded: boolean;
  retries: number;
}

export class TaskClassifyService {
  constructor(
    private readonly clientOverride?: ChatCompletionsApi,
    private readonly quarantineDir?: string
  ) {}

  async classify(description: string): Promise<TaskClassification> {
    const startedAt = Date.now();
    const model = process.env.LLM_MODEL || "openrouter/free";

    if (process.env.LLM_ENABLED === "false") {
      throw new UpstreamUnavailableError("LLM is disabled (LLM_ENABLED=false) — no model call made");
    }
    if (process.env.LLM_STUB === "1") {
      this.logCost({ mode: "stub", model, inputTokens: 0, outputTokens: 0, durationMs: Date.now() - startedAt, repairNeeded: false, retries: 0 });
      return STUB_CLASSIFICATION;
    }

    const system = loadPrompt(PROMPT_VERSION);
    const client = this.clientOverride ?? getClient();

    const primary = await callLlm({ model, system, user: description, temperature: 0.1 }, client);
    let outcome = tryParseClassification(primary.text);
    let repairNeeded = false;
    let inputTokens = primary.inputTokens;
    let outputTokens = primary.outputTokens;
    let retries = primary.retries;

    if (!outcome.ok) {
      repairNeeded = true;
      const repairMessage = [
        "Your previous response could not be validated. Reply with ONLY the corrected JSON object, following the system instructions exactly.",
        "",
        `Task description: ${description}`,
        `Previous (invalid) response: ${primary.text}`,
        `Validation error: ${outcome.error}`,
      ].join("\n");
      const repair = await callLlm({ model, system, user: repairMessage, temperature: 0.1 }, client);
      inputTokens += repair.inputTokens;
      outputTokens += repair.outputTokens;
      retries += repair.retries;
      outcome = tryParseClassification(repair.text);

      if (!outcome.ok) {
        this.logCost({ mode: "live", model, inputTokens, outputTokens, durationMs: Date.now() - startedAt, repairNeeded, retries });
        this.quarantine({
          promptVersion: PROMPT_VERSION,
          model,
          input: description,
          error: outcome.error,
        });
        throw new ClassificationRejectedError(
          "The LLM could not produce a valid classification after one repair attempt"
        );
      }
    }

    this.logCost({ mode: "live", model, inputTokens, outputTokens, durationMs: Date.now() - startedAt, repairNeeded, retries });
    return outcome.value;
  }

  private logCost(entry: Omit<CostLogEntry, "event" | "ts" | "promptVersion">): void {
    const line: CostLogEntry = {
      event: "llm_cost",
      ts: new Date().toISOString(),
      promptVersion: PROMPT_VERSION,
      ...entry,
    };
    console.log(JSON.stringify(line));
  }

  private quarantine(entry: {
    promptVersion: string;
    model: string;
    input: string;
    error: string;
  }): void {
    const dir = this.quarantineDir ?? path.join(process.cwd(), "logs");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, "quarantine.jsonl"),
      JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n"
    );
  }
}
