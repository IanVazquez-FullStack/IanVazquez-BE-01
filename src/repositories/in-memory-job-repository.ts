import { randomUUID } from "crypto";
import { FailureRecord, JobRecord, JobStatus } from "../models/job";
import { JobRepository } from "./job-repository";

/**
 * In-memory JobRepository for tests. It mirrors the Postgres semantics that
 * matter for idempotency: `createOrGet` refuses to create a second row for an
 * existing idempotency key (the analogue of the UNIQUE constraint + ON
 * CONFLICT DO NOTHING), so a duplicate enqueue is a read, not an insert.
 */
export class InMemoryJobRepository implements JobRepository {
  readonly byKey = new Map<string, JobRecord>();
  readonly byId = new Map<string, JobRecord>();
  readonly failures: FailureRecord[] = [];

  async createOrGet(
    key: string,
    input: { taskId: number; operation: string }
  ): Promise<JobRecord> {
    const existing = this.byKey.get(key);
    if (existing) return existing;
    const now = new Date().toISOString();
    const record: JobRecord = {
      id: randomUUID(),
      idempotencyKey: key,
      taskId: input.taskId,
      operation: input.operation,
      status: "queued",
      attempts: 0,
      result: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    this.byKey.set(key, record);
    this.byId.set(record.id, record);
    return record;
  }

  async findByKey(key: string): Promise<JobRecord | null> {
    return this.byKey.get(key) ?? null;
  }

  async findById(id: string): Promise<JobRecord | null> {
    return this.byId.get(id) ?? null;
  }

  async markProcessing(key: string, attempt: number): Promise<void> {
    const record = this.byKey.get(key);
    if (!record) return;
    record.status = "processing";
    record.attempts = attempt;
    record.updatedAt = new Date().toISOString();
  }

  async markCompleted(key: string, result: unknown): Promise<void> {
    const record = this.byKey.get(key);
    if (!record) return;
    record.status = "completed";
    record.result = result;
    record.error = null;
    record.updatedAt = new Date().toISOString();
  }

  async markFailed(key: string, error: string): Promise<void> {
    const record = this.byKey.get(key);
    if (!record) return;
    record.status = "failed";
    record.result = null;
    record.error = error;
    record.updatedAt = new Date().toISOString();
  }

  async resetForRetry(key: string): Promise<void> {
    const record = this.byKey.get(key);
    if (!record) return;
    record.status = "queued";
    record.attempts = 0;
    record.result = null;
    record.error = null;
    record.updatedAt = new Date().toISOString();
  }

  async recordFailure(key: string, error: string, attempts: number): Promise<void> {
    const record = this.byKey.get(key);
    if (!record) return;
    this.failures.push({
      id: randomUUID(),
      jobId: record.id,
      taskId: record.taskId,
      operation: record.operation,
      error,
      attempts,
      createdAt: new Date().toISOString(),
    });
  }

  list(): JobRecord[] {
    return [...this.byId.values()];
  }

  get statuses(): JobStatus[] {
    return [...this.byId.values()].map((j) => j.status);
  }
}
