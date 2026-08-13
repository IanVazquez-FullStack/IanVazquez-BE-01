import { randomUUID } from "crypto";
import { Pool } from "pg";
import { FailureRecord, JobRecord, JobStatus } from "../models/job";
import { JobRepository } from "./job-repository";

type JobRow = {
  id: string;
  idempotency_key: string;
  task_id: number;
  operation: string;
  status: string;
  attempts: number;
  result: unknown;
  error: string | null;
  created_at: string;
  updated_at: string;
};

type FailureRow = {
  id: string;
  job_id: string;
  task_id: number;
  operation: string;
  error: string;
  attempts: number;
  created_at: string;
};

const COLUMNS = `id, idempotency_key, task_id, operation, status, attempts, result, error, created_at, updated_at`;

function toJob(row: JobRow): JobRecord {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    taskId: row.task_id,
    operation: row.operation,
    status: row.status as JobStatus,
    attempts: row.attempts,
    result: row.result,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toFailure(row: FailureRow): FailureRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    taskId: row.task_id,
    operation: row.operation,
    error: row.error,
    attempts: row.attempts,
    createdAt: row.created_at,
  };
}

export class PostgresJobRepository implements JobRepository {
  constructor(private readonly pool: Pool) {}

  async createOrGet(
    key: string,
    input: { taskId: number; operation: string }
  ): Promise<{ job: JobRecord; created: boolean }> {
    const now = new Date().toISOString();
    const { rows } = await this.pool.query<JobRow>(
      `INSERT INTO jobs (id, idempotency_key, task_id, operation, status, attempts, result, error, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'queued', 0, NULL, NULL, $5, $5)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING ${COLUMNS}`,
      [randomUUID(), key, input.taskId, input.operation, now]
    );
    if (rows[0]) return { job: toJob(rows[0]), created: true };
    const existing = await this.findByKey(key);
    if (!existing) {
      throw new Error(`job row vanished between insert and select for key ${key}`);
    }
    return { job: existing, created: false };
  }

  async findByKey(key: string): Promise<JobRecord | null> {
    const { rows } = await this.pool.query<JobRow>(
      `SELECT ${COLUMNS} FROM jobs WHERE idempotency_key = $1`,
      [key]
    );
    return rows[0] ? toJob(rows[0]) : null;
  }

  async findById(id: string): Promise<JobRecord | null> {
    const { rows } = await this.pool.query<JobRow>(
      `SELECT ${COLUMNS} FROM jobs WHERE id = $1`,
      [id]
    );
    return rows[0] ? toJob(rows[0]) : null;
  }

  async markProcessing(key: string, attempt: number): Promise<void> {
    await this.pool.query(
      `UPDATE jobs SET status = 'processing', attempts = $2, updated_at = $3
       WHERE idempotency_key = $1`,
      [key, attempt, new Date().toISOString()]
    );
  }

  async markCompleted(key: string, result: unknown): Promise<void> {
    await this.pool.query(
      `UPDATE jobs SET status = 'completed', result = $2::jsonb, error = NULL, updated_at = $3
       WHERE idempotency_key = $1`,
      [key, JSON.stringify(result), new Date().toISOString()]
    );
  }

  async markFailed(key: string, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE jobs SET status = 'failed', result = NULL, error = $2, updated_at = $3
       WHERE idempotency_key = $1`,
      [key, error, new Date().toISOString()]
    );
  }

  async resetForRetry(key: string): Promise<void> {
    await this.pool.query(
      `UPDATE jobs SET status = 'queued', attempts = 0, result = NULL, error = NULL, updated_at = $2
       WHERE idempotency_key = $1`,
      [key, new Date().toISOString()]
    );
  }

  async recordFailure(key: string, error: string, attempts: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO job_failures (id, job_id, task_id, operation, error, attempts, created_at)
       SELECT $1, id, task_id, operation, $2, $3, $4 FROM jobs WHERE idempotency_key = $5`,
      [randomUUID(), error, attempts, new Date().toISOString(), key]
    );
  }

  async listFailures(): Promise<FailureRecord[]> {
    const { rows } = await this.pool.query<FailureRow>(
      `SELECT id, job_id, task_id, operation, error, attempts, created_at
       FROM job_failures ORDER BY created_at DESC`
    );
    return rows.map(toFailure);
  }
}
