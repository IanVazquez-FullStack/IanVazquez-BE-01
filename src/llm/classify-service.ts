import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { getClient } from "./client";
import { loadPrompt, PROMPT_VERSION } from "./prompt";
import { tryParseClassification } from "./parse";
import { TaskClassification, taskClassificationSchema } from "./schema";
import { ClassificationRejectedError } from "../services/errors";

const STUB_CLASSIFICATION: TaskClassification = taskClassificationSchema.parse({
  category: "feature",
  priority: "normal",
  suggested_team: "backend",
  confidence: 0.9,
  reason: "Stub mode: deterministic classification, no model call.",
});

type ChatClient = Pick<OpenAI, "chat">;

export class TaskClassifyService {
  constructor(
    private readonly clientOverride?: ChatClient,
    private readonly quarantineDir?: string
  ) {}

  async classify(description: string): Promise<TaskClassification> {
    if (process.env.LLM_STUB === "1") {
      return STUB_CLASSIFICATION;
    }
    const model = process.env.LLM_MODEL || "openrouter/free";
    const system = loadPrompt(PROMPT_VERSION);

    const primary = await this.callModel(model, system, description);
    let outcome = tryParseClassification(primary.text);

    if (!outcome.ok) {
      const repairMessage = [
        "Your previous response could not be validated. Reply with ONLY the corrected JSON object, following the system instructions exactly.",
        "",
        `Task description: ${description}`,
        `Previous (invalid) response: ${primary.text}`,
        `Validation error: ${outcome.error}`,
      ].join("\n");
      const repair = await this.callModel(model, system, repairMessage);
      outcome = tryParseClassification(repair.text);

      if (!outcome.ok) {
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

    return outcome.value;
  }

  private async callModel(
    model: string,
    system: string,
    userContent: string
  ): Promise<{ text: string }> {
    const client = this.clientOverride ?? getClient();
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      temperature: 0.1,
    });
    return { text: response.choices[0]?.message?.content ?? "" };
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
