export interface ReportJob {
  reportId: string;
}

export interface ReportJobQueue {
  enqueue(job: ReportJob): void;
}

/**
 * Minimal in-process FIFO queue. Chosen over Redis/BullMQ because this app
 * has no external queue dependency today; a single Node process consumes one
 * job at a time. Jobs are fire-and-forget from the route's perspective, but
 * the queue still serializes execution so report rows are never marked
 * completed/failed concurrently.
 */
export class InProcessReportJobQueue implements ReportJobQueue {
  private readonly pending: ReportJob[] = [];
  private processing = false;

  constructor(private readonly handler: (reportId: string) => Promise<void>) {}

  enqueue(job: ReportJob): void {
    this.pending.push(job);
    void this.drain();
  }

  get size(): number {
    return this.pending.length;
  }

  get isProcessing(): boolean {
    return this.processing;
  }

  /** Resolves once the queue has drained and every job finished. For tests. */
  async whenIdle(timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (this.processing || this.pending.length > 0) {
      if (Date.now() > deadline) {
        throw new Error("Report job queue did not drain within timeout");
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  private async drain(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.pending.length > 0) {
        const job = this.pending.shift();
        if (!job) continue;
        try {
          await this.handler(job.reportId);
        } catch (err) {
          console.error(`[report-queue] job for report ${job.reportId} failed:`, err);
        }
      }
    } finally {
      this.processing = false;
      if (this.pending.length > 0) {
        void this.drain();
      }
    }
  }
}
