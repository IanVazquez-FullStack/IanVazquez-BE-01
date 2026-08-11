import { getClient } from "./client";
import { loadPrompt, PROMPT_VERSION } from "./prompt";
import { TaskClassification, taskClassificationSchema } from "./schema";

const STUB_CLASSIFICATION: TaskClassification = taskClassificationSchema.parse({
  category: "feature",
  priority: "normal",
  suggested_team: "backend",
  confidence: 0.9,
  reason: "Stub mode: deterministic classification, no model call.",
});

export class TaskClassifyService {
  async classify(description: string): Promise<unknown> {
    if (process.env.LLM_STUB === "1") {
      return STUB_CLASSIFICATION;
    }
    const client = getClient();
    const model = process.env.LLM_MODEL || "openrouter/free";
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: loadPrompt(PROMPT_VERSION) },
        { role: "user", content: description },
      ],
      temperature: 0.1,
    });
    return response.choices[0]?.message?.content ?? "";
  }
}
