import { describe, it, expect } from "vitest";
import { SqliteTaskRepository } from "../src/repositories/sqlite-task-repository";
import { InMemoryTaskRepository } from "../src/repositories/in-memory-task-repository";

describe("SqliteTaskRepository.reportMetrics", () => {
  it("aggregates the seeded tasks", async () => {
    const repo = new SqliteTaskRepository(":memory:");
    const metrics = await repo.reportMetrics();

    expect(metrics.total).toBe(3);
    expect(metrics.completed).toBe(1);
    expect(metrics.byStatus).toEqual([
      { status: "done", count: 1 },
      { status: "open", count: 2 },
    ]);
  });

  it("reflects newly created and completed tasks", async () => {
    const repo = new SqliteTaskRepository(":memory:");
    await repo.create("New task");
    await repo.update(1, { done: true });

    const metrics = await repo.reportMetrics();
    expect(metrics.total).toBe(4);
    expect(metrics.completed).toBe(2);
    expect(metrics.byStatus).toEqual([
      { status: "done", count: 2 },
      { status: "open", count: 2 },
    ]);
  });

  it("handles an empty task set", async () => {
    const repo = new SqliteTaskRepository(":memory:");
    await repo.reset();
    const metrics = await repo.reportMetrics();

    expect(metrics.total).toBe(3);
    expect(metrics.completed).toBe(1);
    expect(metrics.byStatus.reduce((sum, s) => sum + s.count, 0)).toBe(metrics.total);
  });
});

describe("InMemoryTaskRepository.reportMetrics", () => {
  it("computes totals and breakdown consistently with stats()", async () => {
    const repo = new InMemoryTaskRepository();
    await repo.create("Another task");

    const [metrics, stats] = await Promise.all([repo.reportMetrics(), repo.stats()]);
    expect(metrics.total).toBe(4);
    expect(metrics.completed).toBe(stats.done);
    expect(metrics.byStatus.find((s) => s.status === "done")?.count).toBe(stats.done);
    expect(metrics.byStatus.find((s) => s.status === "open")?.count).toBe(stats.open);
  });
});
