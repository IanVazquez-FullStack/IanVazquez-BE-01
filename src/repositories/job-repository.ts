import { JobRecord } from "../models/job";

/**
 * Storage-agnostic contract for the background-jobs table. Follows the same
 * pattern as TaskRepository / ReportRepository: services and the worker talk
 * only to this interface, never to a concrete storage engine.
 *
 * `createOrGet` is the idempotency keystone: it atomically claims an
 * idempotency key (INSERT ... ON CONFLICT DO NOTHING in Postgres) so two
 * concurrent enqueues of the same task+operation can only ever produce one
 * job row. The unique constraint on the key is the DB layer's second line of
 * defense behind BullMQ's job-ID dedupe.
 */
export interface JobRepository {
  createOrGet(
    key: string,
    input: { taskId: number; operation: string }
  ): Promise<JobRecord>;
  findByKey(key: string): Promise<JobRecord | null>;
  findById(id: string): Promise<JobRecord | null>;
  markProcessing(key: string, attempt: number): Promise<void>;
  markCompleted(key: string, result: unknown): Promise<void>;
  markFailed(key: string, error: string): Promise<void>;
  resetForRetry(key: string): Promise<void>;
  /** Writes a durable failure record a future alerting system can consume. */
  recordFailure(key: string, error: string, attempts: number): Promise<void>;
}
