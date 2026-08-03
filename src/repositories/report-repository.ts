import { CreateReportInput, Report } from "../models/report";

/**
 * Storage-agnostic contract for background task reports, mirroring the
 * existing TaskRepository pattern. Only ever holds metadata — the PDF bytes
 * live on disk under the storage root, referenced by filePath.
 */
export interface ReportRepository {
  create(input: CreateReportInput): Promise<Report>;
  findById(id: string): Promise<Report | null>;
  markCompleted(id: string, filePath: string): Promise<Report | null>;
  markFailed(id: string, errorMessage: string): Promise<Report | null>;
}
