export const JOB_STATUSES = ["queued", "processing", "completed", "failed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const CLASSIFY_OPERATION = "classify";

/**
 * Deterministic idempotency key for a classification job: task id + operation.
 * Used both as the BullMQ job ID (Redis-level dedupe) and as the unique
 * constraint in the jobs table (DB-level dedupe).
 */
export function classifyIdempotencyKey(taskId: number): string {
  return `task:${taskId}:${CLASSIFY_OPERATION}`;
}

export interface JobRecord {
  id: string;
  idempotencyKey: string;
  taskId: number;
  operation: string;
  status: JobStatus;
  attempts: number;
  result: unknown | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FailureRecord {
  id: string;
  jobId: string;
  taskId: number;
  operation: string;
  error: string;
  attempts: number;
  createdAt: string;
}
