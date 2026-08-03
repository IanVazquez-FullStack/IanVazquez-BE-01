import { Pool } from "pg";
import { CreateReportInput, Report, ReportStatus } from "../models/report";
import { ReportRepository } from "./report-repository";

type ReportRow = {
  id: string;
  user_id: string;
  status: string;
  file_path: string | null;
  error_message: string | null;
  created_at: Date;
  completed_at: Date | null;
};

function toReport(row: ReportRow): Report {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status as ReportStatus,
    filePath: row.file_path,
    errorMessage: row.error_message,
    createdAt: row.created_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
  };
}

export class PostgresReportRepository implements ReportRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateReportInput): Promise<Report> {
    const createdAt = new Date().toISOString();
    const { rows } = await this.pool.query(
      `INSERT INTO reports (id, user_id, status, file_path, error_message, created_at, completed_at)
       VALUES ($1, $2, 'pending', NULL, NULL, $3, NULL)
       RETURNING id, user_id, status, file_path, error_message, created_at, completed_at`,
      [input.id, input.userId, createdAt]
    );
    return toReport(rows[0]);
  }

  async findById(id: string): Promise<Report | null> {
    const { rows } = await this.pool.query(
      `SELECT id, user_id, status, file_path, error_message, created_at, completed_at
       FROM reports WHERE id = $1`,
      [id]
    );
    return rows[0] ? toReport(rows[0]) : null;
  }

  async markCompleted(id: string, filePath: string): Promise<Report | null> {
    const completedAt = new Date().toISOString();
    const { rows } = await this.pool.query(
      `UPDATE reports
       SET status = 'completed', file_path = $2, error_message = NULL, completed_at = $3
       WHERE id = $1
       RETURNING id, user_id, status, file_path, error_message, created_at, completed_at`,
      [id, filePath, completedAt]
    );
    return rows[0] ? toReport(rows[0]) : null;
  }

  async markFailed(id: string, errorMessage: string): Promise<Report | null> {
    const completedAt = new Date().toISOString();
    const { rows } = await this.pool.query(
      `UPDATE reports
       SET status = 'failed', error_message = $2, completed_at = $3
       WHERE id = $1
       RETURNING id, user_id, status, file_path, error_message, created_at, completed_at`,
      [id, errorMessage, completedAt]
    );
    return rows[0] ? toReport(rows[0]) : null;
  }
}
