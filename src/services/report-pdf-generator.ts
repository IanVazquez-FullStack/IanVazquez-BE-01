import PDFDocument from "pdfkit";
import { TaskMetrics } from "../models/report";

export interface ReportPdfGenerator {
  render(metrics: TaskMetrics, generatedAt?: Date): Promise<Buffer>;
}

const STATUS_LABELS: Record<TaskMetrics["byStatus"][number]["status"], string> = {
  done: "Done",
  open: "Open",
};

function renderPdf(metrics: TaskMetrics, generatedAt: Date): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.info.Title = "Task Report";
    doc.info.Author = "Task API";

    doc.fontSize(22).text("Task Report", { align: "center" });
    doc.moveDown(0.5);
    doc
      .fontSize(11)
      .fillColor("#444444")
      .text(`Generated: ${generatedAt.toISOString()}`, { align: "center" });
    doc.moveDown(1.5);

    doc.fontSize(14).fillColor("#000000").text("Totals");
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Total tasks: ${metrics.total}`);
    doc.text(`Completed tasks: ${metrics.completed}`);

    doc.moveDown(1.5);
    doc.fontSize(14).text("Breakdown by status");
    doc.moveDown(0.5);
    for (const entry of metrics.byStatus) {
      doc.fontSize(12).text(`${STATUS_LABELS[entry.status]}: ${entry.count}`);
    }

    doc.end();
  });
}

export class PdfkitReportGenerator implements ReportPdfGenerator {
  render(metrics: TaskMetrics, generatedAt: Date = new Date()): Promise<Buffer> {
    return renderPdf(metrics, generatedAt);
  }
}
