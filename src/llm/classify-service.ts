import { UpstreamUnavailableError } from "../services/errors";
import { TaskClassification, taskClassificationSchema } from "./schema";

const STUB_CLASSIFICATION: TaskClassification = taskClassificationSchema.parse({
  category: "feature",
  priority: "normal",
  suggested_team: "backend",
  confidence: 0.9,
  reason: "Stub mode: deterministic classification, no model call.",
});

export class TaskClassifyService {
  async classify(description: string): Promise<TaskClassification> {
    if (process.env.LLM_STUB === "1") {
      return STUB_CLASSIFICATION;
    }
    throw new UpstreamUnavailableError("LLM call not wired yet (Stage 2)");
  }
}
