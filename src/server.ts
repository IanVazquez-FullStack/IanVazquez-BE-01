import "dotenv/config";
import path from "path";
import { createApp } from "./app";
import { TaskService } from "./services/task-service";
import { ReportService } from "./services/report-service";
import { PdfkitReportGenerator } from "./services/report-pdf-generator";
import { InProcessReportJobQueue } from "./jobs/report-job-queue";
import { createReportRouter } from "./routes/report-routes";
import { TaskClassifyService } from "./llm/classify-service";
import { ClassifyQueue } from "./jobs/classify-queue";
import { createStorage } from "./config/storage";

const port = process.env.PORT || 3000;
const storage = createStorage();

console.log(`[storage] using ${storage.storageName}`);

const storageRoot = process.env.REPORT_STORAGE_DIR || path.join(process.cwd(), "storage", "reports");

const taskService = new TaskService(storage.taskRepository);
const reportService = new ReportService(
  storage.reportRepository,
  storage.taskRepository,
  new PdfkitReportGenerator(),
  storageRoot
);
const reportJobQueue = new InProcessReportJobQueue((reportId) => reportService.processReport(reportId));
const reportRouter = createReportRouter(reportService, reportJobQueue);

const classifyQueue = new ClassifyQueue();
const app = createApp(taskService, reportRouter, new TaskClassifyService(), {
  queue: classifyQueue,
  jobRepository: storage.jobRepository,
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
