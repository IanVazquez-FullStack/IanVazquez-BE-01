import { z } from "zod";

export const CATEGORIES = ["bug", "feature", "chore", "research", "other"] as const;
export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const SUGGESTED_TEAMS = ["backend", "frontend", "infra", "design", "unassigned"] as const;

const descriptionError = (issue: { input: unknown }): string =>
  issue.input === undefined ? "is required" : "must be a string";

export const classifyRequestSchema = z.object({
  description: z
    .string({ error: descriptionError })
    .trim()
    .min(1, "must not be empty")
    .max(2000, "must be at most 2000 characters"),
});

export const taskClassificationSchema = z
  .object({
    category: z.enum(CATEGORIES),
    priority: z.enum(PRIORITIES),
    suggested_team: z.enum(SUGGESTED_TEAMS),
    confidence: z
      .number({ error: "must be a number" })
      .min(0, "must be at least 0")
      .max(1, "must be at most 1"),
    reason: z
      .string({ error: "must be a string" })
      .min(1, "must not be empty")
      .max(200, "must be a short sentence (at most 200 characters)"),
  })
  .strict();

export type TaskClassification = z.infer<typeof taskClassificationSchema>;
export type ClassifyRequest = z.infer<typeof classifyRequestSchema>;

export function formatZodIssues(error: z.ZodError, fallbackField = "body"): string {
  return error.issues
    .map((issue) => {
      const field = issue.path.length > 0 ? issue.path.join(".") : fallbackField;
      return `'${field}' ${issue.message}`;
    })
    .join("; ");
}
