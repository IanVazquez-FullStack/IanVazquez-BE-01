import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { createReportRouter } from "../src/routes/report-routes";
import { createAuthMiddleware } from "../src/middleware/auth-middleware";
import { TaskService } from "../src/services/task-service";
import { SqliteTaskRepository } from "../src/repositories/sqlite-task-repository";
import { SqliteReportRepository } from "../src/repositories/sqlite-report-repository";
import { TaskRepository } from "../src/repositories/task-repository";
import { ReportPdfGenerator } from "../src/services/report-pdf-generator";
import { PdfkitReportGenerator } from "../src/services/report-pdf-generator";
import { ReportService } from "../src/services/report-service";
import { TaskMetrics } from "../src/models/report";
import { InProcessReportJobQueue } from "../src/jobs/report-job-queue";
import { Express } from "express";

const USER_A = "user-a-id";
const USER_B = "user-b-id";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Harness {
  app: Express;
  queue: InProcessReportJobQueue;
  storageRoot: string;
  dir: string;
  taskRepo: TaskRepository;
  reportRepo: SqliteReportRepository;
}

const tmpDirs: string[] = [];

function buildHarness(overrides: { taskRepository?: TaskRepository; pdfGenerator?: ReportPdfGenerator } = {}): Harness {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reports-test-"));
  tmpDirs.push(dir);
  const dbPath = path.join(dir, "test.db");
  const storageRoot = path.join(dir, "storage", "reports");

  const taskRepo = overrides.taskRepository ?? new SqliteTaskRepository(dbPath);
  const reportRepo = new SqliteReportRepository(dbPath);

  const reportService = new ReportService(
    reportRepo,
    taskRepo,
    overrides.pdfGenerator ?? new PdfkitReportGenerator(),
    storageRoot
  );
  const queue = new InProcessReportJobQueue((reportId) => reportService.processReport(reportId));

  const auth = createAuthMiddleware(async (token) => {
    if (token === "token-a") return { id: USER_A, email: "a@example.com" };
    if (token === "token-b") return { id: USER_B, email: "b@example.com" };
    return null;
  });

  const app = createApp(new TaskService(taskRepo), createReportRouter(reportService, queue, auth));
  return { app, queue, storageRoot, dir, taskRepo, reportRepo };
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("POST /reports/tasks", () => {
  it("requires authentication", async () => {
    const { app } = buildHarness();
    const res = await request(app).post("/reports/tasks");
    expect(res.status).toBe(401);
  });

  it("enqueues a job and returns pending immediately", async () => {
    const { app } = buildHarness();
    const res = await request(app)
      .post("/reports/tasks")
      .set("Authorization", "Bearer token-a");

    expect(res.status).toBe(202);
    expect(res.body.status).toBe("pending");
    expect(res.body.reportId).toMatch(UUID);
  });
});

describe("reports: full background flow", () => {
  it("generates a PDF on disk and serves it via the download route", async () => {
    const { app, queue, storageRoot } = buildHarness();

    const post = await request(app)
      .post("/reports/tasks")
      .set("Authorization", "Bearer token-a");
    const reportId = post.body.reportId;

    await queue.whenIdle();

    const get = await request(app)
      .get(`/reports/${reportId}`)
      .set("Authorization", "Bearer token-a");
    expect(get.status).toBe(200);
    expect(get.body.status).toBe("completed");
    expect(get.body.downloadUrl).toBe(`/reports/${reportId}/download`);

    const onDisk = path.join(storageRoot, "reports", `${reportId}.pdf`);
    expect(fs.existsSync(onDisk)).toBe(true);
    const fileBuf = fs.readFileSync(onDisk);
    expect(fileBuf.length).toBeGreaterThan(0);
    expect(fileBuf.subarray(0, 4).toString("latin1")).toBe("%PDF");

    const dl = await request(app)
      .get(`/reports/${reportId}/download`)
      .set("Authorization", "Bearer token-a");
    expect(dl.status).toBe(200);
    expect(dl.headers["content-type"]).toContain("application/pdf");
    expect(dl.body.length).toBeGreaterThan(0);
    expect(dl.body.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("feeds the live aggregation into the PDF renderer", async () => {
    let capturedMetrics: TaskMetrics | undefined;
    const spyGenerator: ReportPdfGenerator = {
      render: async (metrics) => {
        capturedMetrics = metrics;
        return new PdfkitReportGenerator().render(metrics);
      },
    };

    const { app, queue, taskRepo } = buildHarness({ pdfGenerator: spyGenerator });

    const post = await request(app)
      .post("/reports/tasks")
      .set("Authorization", "Bearer token-a");
    const reportId = post.body.reportId;

    await queue.whenIdle();

    const expected = await taskRepo.reportMetrics();
    expect(capturedMetrics).toEqual(expected);
    expect(expected.total).toBe(3);
    expect(expected.completed).toBe(1);
    expect(expected.byStatus).toEqual([
      { status: "done", count: 1 },
      { status: "open", count: 2 },
    ]);
    expect(reportId).toMatch(UUID);
  });

  it("stays pending while the job is still running", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slowGenerator: ReportPdfGenerator = {
      render: async () => {
        await gate;
        return Buffer.from("%PDF-1.7 placeholder");
      },
    };

    const { app, queue } = buildHarness({ pdfGenerator: slowGenerator });
    const post = await request(app)
      .post("/reports/tasks")
      .set("Authorization", "Bearer token-a");
    const reportId = post.body.reportId;

    const pending = await request(app)
      .get(`/reports/${reportId}`)
      .set("Authorization", "Bearer token-a");
    expect(pending.status).toBe(200);
    expect(pending.body.status).toBe("pending");

    release();
    await queue.whenIdle();
  });
});

describe("reports: authorization", () => {
  it("forbids another user from reading or downloading the report", async () => {
    const { app, queue } = buildHarness();

    const post = await request(app)
      .post("/reports/tasks")
      .set("Authorization", "Bearer token-a");
    const reportId = post.body.reportId;
    await queue.whenIdle();

    const read = await request(app)
      .get(`/reports/${reportId}`)
      .set("Authorization", "Bearer token-b");
    expect(read.status).toBe(404);

    const dl = await request(app)
      .get(`/reports/${reportId}/download`)
      .set("Authorization", "Bearer token-b");
    expect(dl.status).toBe(404);
  });

  it("returns 404 for a report that does not exist", async () => {
    const { app } = buildHarness();
    const id = "00000000-0000-4000-8000-000000000000";

    const read = await request(app)
      .get(`/reports/${id}`)
      .set("Authorization", "Bearer token-a");
    expect(read.status).toBe(404);
  });

  it("rejects a malformed report id before touching storage", async () => {
    const { app } = buildHarness();

    const res = await request(app)
      .get("/reports/not-a-uuid")
      .set("Authorization", "Bearer token-a");
    expect(res.status).toBe(400);
  });
});

describe("reports: failure path", () => {
  it("marks the report failed with a stored reason when rendering throws", async () => {
    const failingGenerator: ReportPdfGenerator = {
      render: async () => {
        throw new Error("simulated render failure");
      },
    };

    const { app, queue, reportRepo } = buildHarness({ pdfGenerator: failingGenerator });
    const post = await request(app)
      .post("/reports/tasks")
      .set("Authorization", "Bearer token-a");
    const reportId = post.body.reportId;

    await queue.whenIdle();

    const report = await reportRepo.findById(reportId);
    expect(report?.status).toBe("failed");
    expect(report?.errorMessage).toBe("simulated render failure");
    expect(report?.completedAt).toBeTruthy();

    const get = await request(app)
      .get(`/reports/${reportId}`)
      .set("Authorization", "Bearer token-a");
    expect(get.status).toBe(200);
    expect(get.body.status).toBe("failed");
    expect(get.body.errorMessage).toBeUndefined();

    const dl = await request(app)
      .get(`/reports/${reportId}/download`)
      .set("Authorization", "Bearer token-a");
    expect(dl.status).toBe(404);
  });

  it("marks the report failed when the aggregation query errors", async () => {
    const brokenTaskRepo = {
      reportMetrics: async () => {
        throw new Error("simulated db failure");
      },
    } as unknown as TaskRepository;

    const { app, queue, reportRepo } = buildHarness({ taskRepository: brokenTaskRepo });
    const post = await request(app)
      .post("/reports/tasks")
      .set("Authorization", "Bearer token-a");
    const reportId = post.body.reportId;

    await queue.whenIdle();

    const report = await reportRepo.findById(reportId);
    expect(report?.status).toBe("failed");
    expect(report?.errorMessage).toBe("simulated db failure");
  });
});
