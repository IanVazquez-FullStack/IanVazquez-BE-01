import { Router, Request, Response, NextFunction, RequestHandler } from "express";
import { AuthRequest, authMiddleware } from "../middleware/auth-middleware";
import { ReportService } from "../services/report-service";
import { ReportJobQueue } from "../jobs/report-job-queue";
import { ValidationError } from "../services/errors";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseReportId(raw: string): string {
  if (!UUID_PATTERN.test(raw)) {
    throw new ValidationError(`Invalid report id: ${raw}`);
  }
  return raw;
}

export function createReportRouter(
  reportService: ReportService,
  reportJobQueue: ReportJobQueue,
  authenticate: RequestHandler = authMiddleware
): Router {
  const router = Router();
  router.use(authenticate);

  router.post("/reports/tasks", async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const report = await reportService.create(req.user!.id);
      reportJobQueue.enqueue({ reportId: report.id });
      res.status(202).json({ reportId: report.id, status: "pending" });
    } catch (err) {
      next(err);
    }
  });

  router.get("/reports/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reportId = parseReportId(req.params.id);
      const report = await reportService.get(reportId, (req as AuthRequest).user!.id);
      if (report.status !== "completed") {
        res.status(200).json({ status: report.status });
        return;
      }
      res.status(200).json({ status: "completed", downloadUrl: `/reports/${report.id}/download` });
    } catch (err) {
      next(err);
    }
  });

  router.get("/reports/:id/download", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reportId = parseReportId(req.params.id);
      const filePath = await reportService.resolveDownload(reportId, (req as AuthRequest).user!.id);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="task-report-${reportId}.pdf"`);
      res.sendFile(filePath);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
