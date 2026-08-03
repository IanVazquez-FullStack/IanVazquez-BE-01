import { CreateReportInput, Report } from "../models/report";
import { ReportRepository } from "./report-repository";

export class InMemoryReportRepository implements ReportRepository {
  private readonly reports = new Map<string, Report>();

  async create(input: CreateReportInput): Promise<Report> {
    const report: Report = {
      id: input.id,
      userId: input.userId,
      status: "pending",
      filePath: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    this.reports.set(report.id, report);
    return report;
  }

  async findById(id: string): Promise<Report | null> {
    return this.reports.get(id) ?? null;
  }

  async markCompleted(id: string, filePath: string): Promise<Report | null> {
    const report = this.reports.get(id);
    if (!report) return null;
    const updated: Report = {
      ...report,
      status: "completed",
      filePath,
      errorMessage: null,
      completedAt: new Date().toISOString(),
    };
    this.reports.set(id, updated);
    return updated;
  }

  async markFailed(id: string, errorMessage: string): Promise<Report | null> {
    const report = this.reports.get(id);
    if (!report) return null;
    const updated: Report = {
      ...report,
      status: "failed",
      errorMessage,
      completedAt: new Date().toISOString(),
    };
    this.reports.set(id, updated);
    return updated;
  }
}
