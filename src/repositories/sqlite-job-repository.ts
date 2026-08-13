import { randomUUID } from "crypto";
import Database from "better-sqlite3";
import path from "path";
import { FailureRecord, JobRecord, JobStatus } from "../models/job";
import { JobRepository } from "./job-repository";

type JobRow = {
  id: string;
  idempotency_key: string;
  task_id: number;
  operation: string;
  status: string;
  attempts: number;
  result: string | null;
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
  let result: unknown = null;
  if (row.result !== null) {
    try {
      result = JSON.parse(row.result);
    } catch {
      result = row.result;
    }
  }
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    taskId: row.task_id,
    operation: row.operation,
    status: row.status as JobStatus,
    attempts: row.attempts,
    result,
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

export class SqliteJobRepository implements JobRepository {
  private readonly db: Database.Database;

  constructor(dbPath: string = path.join(process.cwd(), "tasks.db")) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id              TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        task_id         INTEGER NOT NULL,
        operation       TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
        attempts        INTEGER NOT NULL DEFAULT 0,
        result          TEXT,
        error           TEXT,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_task_id ON jobs (task_id);

      CREATE TABLE IF NOT EXISTS job_failures (
        id         TEXT PRIMARY KEY,
        job_id     TEXT NOT NULL REFERENCES jobs(id),
        task_id    INTEGER NOT NULL,
        operation  TEXT NOT NULL,
        error      TEXT NOT NULL,
        attempts   INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  async createOrGet(
    key: string,
    input: { taskId: number; operation: string }
  ): Promise<{ job: JobRecord; created: boolean }> {
    const now = new Date().toISOString();
    const insert = this.db
      .prepare(
        `INSERT INTO jobs (id, idempotency_key, task_id, operation, status, attempts, result, error, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'queued', 0, NULL, NULL, ?, ?)
         ON CONFLICT (idempotency_key) DO NOTHING`
      )
      .run(randomUUID(), key, input.taskId, input.operation, now, now);
    if (insert.changes === 1) {
      const job = await this.findByKey(key);
      if (!job) throw new Error(`job row vanished after insert for key ${key}`);
      return { job, created: true };
    }
    const existing = await this.findByKey(key);
    if (!existing) {
      throw new Error(`job row vanished between insert and select for key ${key}`);
    }
    return { job: existing, created: false };
  }

  async findByKey(key: string): Promise<JobRecord | null> {
    const row = this.db
      .prepare(`SELECT ${COLUMNS} FROM jobs WHERE idempotency_key = ?`)
      .get(key) as JobRow | undefined;
    return row ? toJob(row) : null;
  }

  async findById(id: string): Promise<JobRecord | null> {
    const row = this.db
      .prepare(`SELECT ${COLUMNS} FROM jobs WHERE id = ?`)
      .get(id) as JobRow | undefined;
    return row ? toJob(row) : null;
  }

  async markProcessing(key: string, attempt: number): Promise<void> {
    this.db
      .prepare(
        `UPDATE jobs SET status = 'processing', attempts = ?, updated_at = ?
         WHERE idempotency_key = ?`
      )
      .run(attempt, new Date().toISOString(), key);
  }

  async markCompleted(key: string, result: unknown): Promise<void> {
    this.db
      .prepare(
        `UPDATE jobs SET status = 'completed', result = ?, error = NULL, updated_at = ?
         WHERE idempotency_key = ?`
      )
      .run(JSON.stringify(result), new Date().toISOString(), key);
  }

  async markFailed(key: string, error: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE jobs SET status = 'failed', result = NULL, error = ?, updated_at = ?
         WHERE idempotency_key = ?`
      )
      .run(error, new Date().toISOString(), key);
  }

  async resetForRetry(key: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE jobs SET status = 'queued', attempts = 0, result = NULL, error = NULL, updated_at = ?
         WHERE idempotency_key = ?`
      )
      .run(new Date().toISOString(), key);
  }

  async recordFailure(key: string, error: string, attempts: number): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO job_failures (id, job_id, task_id, operation, error, attempts, created_at)
         SELECT ?, id, task_id, operation, ?, ?, ? FROM jobs WHERE idempotency_key = ?`
      )
      .run(randomUUID(), error, attempts, new Date().toISOString(), key);
  }

  async listFailures(): Promise<FailureRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT id, job_id, task_id, operation, error, attempts, created_at
         FROM job_failures ORDER BY created_at DESC`
      )
      .all() as FailureRow[];
    return rows.map(toFailure);
  }
}
