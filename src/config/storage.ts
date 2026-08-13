import path from "path";
import { Pool } from "pg";
import { TaskRepository } from "../repositories/task-repository";
import { InMemoryTaskRepository } from "../repositories/in-memory-task-repository";
import { SqliteTaskRepository } from "../repositories/sqlite-task-repository";
import { PostgresTaskRepository } from "../repositories/postgres-task-repository";
import { ReportRepository } from "../repositories/report-repository";
import { InMemoryReportRepository } from "../repositories/in-memory-report-repository";
import { SqliteReportRepository } from "../repositories/sqlite-report-repository";
import { PostgresReportRepository } from "../repositories/postgres-report-repository";
import { JobRepository } from "../repositories/job-repository";
import { InMemoryJobRepository } from "../repositories/in-memory-job-repository";
import { SqliteJobRepository } from "../repositories/sqlite-job-repository";
import { PostgresJobRepository } from "../repositories/postgres-job-repository";
import { createPool } from "./db";

export interface Storage {
  storageName: string;
  pool?: Pool;
  taskRepository: TaskRepository;
  reportRepository: ReportRepository;
  jobRepository: JobRepository;
}

/**
 * Single storage-selection point, shared by the API server and the background
 * worker so both always use the same engine. Previously this branching lived
 * inline in server.ts; extracting it lets src/worker.ts reuse it verbatim.
 */
export function createStorage(): Storage {
  const databaseUrl = process.env.DATABASE_URL;
  const storageOverride = process.env.STORAGE;

  if (databaseUrl) {
    const pool = createPool(databaseUrl);
    return {
      storageName: "PostgresTaskRepository",
      pool,
      taskRepository: new PostgresTaskRepository(pool),
      reportRepository: new PostgresReportRepository(pool),
      jobRepository: new PostgresJobRepository(pool),
    };
  }

  if (storageOverride === "memory") {
    return {
      storageName: "InMemoryTaskRepository",
      taskRepository: new InMemoryTaskRepository(),
      reportRepository: new InMemoryReportRepository(),
      jobRepository: new InMemoryJobRepository(),
    };
  }

  const sqlitePath = process.env.SQLITE_DB_PATH || path.join(process.cwd(), "tasks.db");
  return {
    storageName: `SqliteTaskRepository (${sqlitePath})`,
    taskRepository: new SqliteTaskRepository(sqlitePath),
    reportRepository: new SqliteReportRepository(sqlitePath),
    jobRepository: new SqliteJobRepository(sqlitePath),
  };
}
