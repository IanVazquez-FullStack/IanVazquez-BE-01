import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { Report } from "../models/report";
import { ReportRepository } from "../repositories/report-repository";
import { TaskRepository } from "../repositories/task-repository";
import { ReportPdfGenerator } from "./report-pdf-generator";
import { NotFoundError } from "./errors";

export class ReportService {
  constructor(
    private readonly reportRepository: ReportRepository,
    private readonly taskRepository: TaskRepository,
    private readonly pdfGenerator: ReportPdfGenerator,
    private readonly storageRoot: string
  ) {}

  async create(userId: string): Promise<Report> {
    return this.reportRepository.create({ id: randomUUID(), userId });
  }

  /**
   * Runs a report job to completion. Never throws: any failure is recorded on
   * the report row as status 'failed' with a stored reason, so a job can never
   * silently hang as 'pending'.
   */
  async processReport(reportId: string): Promise<void> {
    const report = await this.reportRepository.findById(reportId);
    if (!report || report.status !== "pending") return;

    try {
      const metrics = await this.taskRepository.reportMetrics();
      const pdf = await this.pdfGenerator.render(metrics);

      const relPath = path.join("reports", `${report.id}.pdf`);
      const absPath = path.resolve(this.storageRoot, relPath);
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, pdf);

      await this.reportRepository.markCompleted(report.id, relPath);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      console.error(`[reports] generation failed for ${report.id}:`, err);
      await this.reportRepository.markFailed(report.id, reason);
    }
  }

  async get(reportId: string, userId: string): Promise<Report> {
    const report = await this.reportRepository.findById(reportId);
    if (!report || report.userId !== userId) {
      throw new NotFoundError(`Report ${reportId} not found`);
    }
    return report;
  }

  /**
   * Resolves the on-disk PDF path for a completed report owned by `userId`,
   * verifying the stored path stays inside the storage root.
   */
  async resolveDownload(reportId: string, userId: string): Promise<string> {
    const report = await this.get(reportId, userId);
    if (report.status !== "completed" || !report.filePath) {
      throw new NotFoundError(`Report ${reportId} not found`);
    }

    const root = path.resolve(this.storageRoot);
    const absPath = path.resolve(root, report.filePath);
    if (!absPath.startsWith(root + path.sep)) {
      throw new NotFoundError(`Report ${reportId} not found`);
    }
    return absPath;
  }
}
