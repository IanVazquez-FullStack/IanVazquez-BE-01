import path from "path";
import Database from "better-sqlite3";
import { CreateReportInput, Report, ReportStatus } from "../models/report";
import { ReportRepository } from "./report-repository";

type ReportRow = {
  id: string;
  user_id: string;
  status: string;
  file_path: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

function toReport(row: ReportRow): Report {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status as ReportStatus,
    filePath: row.file_path,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export class SqliteReportRepository implements ReportRepository {
  private readonly db: Database.Database;

  constructor(dbPath: string = path.join(process.cwd(), "tasks.db")) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reports (
        id            TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'pending',
        file_path     TEXT,
        error_message TEXT,
        created_at    TEXT NOT NULL,
        completed_at  TEXT
      );
    `);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports (user_id);`);
  }

  async create(input: CreateReportInput): Promise<Report> {
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO reports (id, user_id, status, file_path, error_message, created_at, completed_at)
         VALUES (?, ?, 'pending', NULL, NULL, ?, NULL)`
      )
      .run(input.id, input.userId, createdAt);
    return {
      id: input.id,
      userId: input.userId,
      status: "pending",
      filePath: null,
      errorMessage: null,
      createdAt,
      completedAt: null,
    };
  }

  async findById(id: string): Promise<Report | null> {
    const row = this.db
      .prepare(
        `SELECT id, user_id, status, file_path, error_message, created_at, completed_at
         FROM reports WHERE id = ?`
      )
      .get(id) as ReportRow | undefined;
    return row ? toReport(row) : null;
  }

  async markCompleted(id: string, filePath: string): Promise<Report | null> {
    const completedAt = new Date().toISOString();
    const info = this.db
      .prepare(
        `UPDATE reports
         SET status = 'completed', file_path = ?, error_message = NULL, completed_at = ?
         WHERE id = ?`
      )
      .run(filePath, completedAt, id);
    return info.changes === 0 ? null : this.findById(id);
  }

  async markFailed(id: string, errorMessage: string): Promise<Report | null> {
    const info = this.db
      .prepare(
        `UPDATE reports
         SET status = 'failed', error_message = ?, completed_at = ?
         WHERE id = ?`
      )
      .run(errorMessage, new Date().toISOString(), id);
    return info.changes === 0 ? null : this.findById(id);
  }
}
