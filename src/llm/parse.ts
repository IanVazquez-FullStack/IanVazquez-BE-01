import { TaskClassification, formatZodIssues, taskClassificationSchema } from "./schema";

export function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    const fenced = trimmed.match(/^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/);
    if (fenced) return fenced[1].trim();
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) {
    return trimmed.slice(first, last + 1);
  }
  return trimmed;
}

export type ClassificationParseResult =
  | { ok: true; value: TaskClassification }
  | { ok: false; error: string };

export function tryParseClassification(raw: string): ClassificationParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonText(raw));
  } catch (err) {
    return { ok: false, error: `model output is not valid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  const result = taskClassificationSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, error: formatZodIssues(result.error) };
  }
  return { ok: true, value: result.data };
}
