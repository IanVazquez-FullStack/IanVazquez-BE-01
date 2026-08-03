import { describe, it, expect } from "vitest";
import { PdfkitReportGenerator } from "../src/services/report-pdf-generator";
import { TaskMetrics } from "../src/models/report";

const METRICS: TaskMetrics = {
  total: 5,
  completed: 2,
  byStatus: [
    { status: "done", count: 2 },
    { status: "open", count: 3 },
  ],
};

describe("PdfkitReportGenerator", () => {
  it("renders a non-empty, well-formed PDF with title metadata", async () => {
    const generator = new PdfkitReportGenerator();
    const pdf = await generator.render(METRICS, new Date("2024-01-01T00:00:00.000Z"));

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 4).toString("latin1")).toBe("%PDF");

    const raw = pdf.toString("latin1");
    expect(raw).toContain("%%EOF");
    expect(raw).toContain("(Task Report)");
  });

  it("renders a report for an empty task set", async () => {
    const generator = new PdfkitReportGenerator();
    const pdf = await generator.render(
      { total: 0, completed: 0, byStatus: [{ status: "done", count: 0 }, { status: "open", count: 0 }] },
      new Date("2024-01-01T00:00:00.000Z")
    );

    expect(pdf.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(pdf.toString("latin1")).toContain("%%EOF");
  });
});
