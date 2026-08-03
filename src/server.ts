import "dotenv/config";
import path from "path";
import { createApp } from "./app";
import { TaskService } from "./services/task-service";
import { TaskRepository } from "./repositories/task-repository";
import { InMemoryTaskRepository } from "./repositories/in-memory-task-repository";
import { SqliteTaskRepository } from "./repositories/sqlite-task-repository";
import { PostgresTaskRepository } from "./repositories/postgres-task-repository";
import { ReportRepository } from "./repositories/report-repository";
import { InMemoryReportRepository } from "./repositories/in-memory-report-repository";
import { SqliteReportRepository } from "./repositories/sqlite-report-repository";
import { PostgresReportRepository } from "./repositories/postgres-report-repository";
import { ReportService } from "./services/report-service";
import { PdfkitReportGenerator } from "./services/report-pdf-generator";
import { InProcessReportJobQueue } from "./jobs/report-job-queue";
import { createReportRouter } from "./routes/report-routes";
import { createPool } from "./config/db";

const port = process.env.PORT || 3000;
const databaseUrl = process.env.DATABASE_URL;
const storageOverride = process.env.STORAGE;

let repository: TaskRepository;
let reportRepository: ReportRepository;
let storageName: string;

if (databaseUrl) {
  const pool = createPool(databaseUrl);
  repository = new PostgresTaskRepository(pool);
  reportRepository = new PostgresReportRepository(pool);
  storageName = "PostgresTaskRepository";
} else if (storageOverride === "memory") {
  repository = new InMemoryTaskRepository();
  reportRepository = new InMemoryReportRepository();
  storageName = "InMemoryTaskRepository";
} else {
  const sqlitePath = process.env.SQLITE_DB_PATH || path.join(process.cwd(), "tasks.db");
  repository = new SqliteTaskRepository(sqlitePath);
  reportRepository = new SqliteReportRepository(sqlitePath);
  storageName = `SqliteTaskRepository (${sqlitePath})`;
}

console.log(`[storage] using ${storageName}`);

const storageRoot = process.env.REPORT_STORAGE_DIR || path.join(process.cwd(), "storage", "reports");

const taskService = new TaskService(repository);
const reportService = new ReportService(
  reportRepository,
  repository,
  new PdfkitReportGenerator(),
  storageRoot
);
const reportJobQueue = new InProcessReportJobQueue((reportId) => reportService.processReport(reportId));
const reportRouter = createReportRouter(reportService, reportJobQueue);

const app = createApp(taskService, reportRouter);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
