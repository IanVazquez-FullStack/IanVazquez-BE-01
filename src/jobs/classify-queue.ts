import { Job, Queue } from "bullmq";
import { createRedisConnection } from "../config/redis";

export const CLASSIFY_QUEUE_NAME = "classify";
export const CLASSIFY_JOB_NAME = "classify";

/**
 * Total attempts per job: 3 (1 initial attempt + 2 retries). The LLM client
 * already retries the HTTP call itself up to 3 times internally, so this is
 * about the job as a whole surviving transient queue/worker hiccups — not the
 * LLM's own network retries. See README for the rationale behind the numbers.
 */
export const CLASSIFY_MAX_ATTEMPTS = 3;

/** Exponential backoff base: BullMQ applies delay * 2^(attemptsMade - 1). */
export const CLASSIFY_BACKOFF_MS = 2000;

/** BullMQ applies ±jitter of this fraction of the computed delay. */
export const CLASSIFY_BACKOFF_JITTER = 0.3;

export interface ClassifyJobData {
  taskId: number;
  description: string;
  idempotencyKey: string;
}

/**
 * Producer-side wrapper over BullMQ. The jobId is the idempotency key, so a
 * second enqueue of the same task+operation is a no-op in Redis (BullMQ
 * dedupes on job ID). Completed jobs are dropped from Redis (the DB row is the
 * source of truth for status); failed jobs are kept so a retry can remove and
 * re-add them.
 */
export class ClassifyQueue {
  private readonly queue: Queue<ClassifyJobData>;

  constructor(redisUrl?: string) {
    this.queue = new Queue(CLASSIFY_QUEUE_NAME, {
      connection: createRedisConnection(redisUrl),
    });
  }

  enqueue(data: ClassifyJobData): Promise<Job<ClassifyJobData>> {
    return this.queue.add(
      CLASSIFY_JOB_NAME,
      data,
      {
        jobId: data.idempotencyKey,
        attempts: CLASSIFY_MAX_ATTEMPTS,
        backoff: {
          type: "exponential",
          delay: CLASSIFY_BACKOFF_MS,
          jitter: CLASSIFY_BACKOFF_JITTER,
        },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );
  }

  getJob(jobId: string): Promise<Job<ClassifyJobData> | undefined> {
    return this.queue.getJob(jobId);
  }

  remove(jobId: string): Promise<number> {
    return this.queue.remove(jobId);
  }

  close(): Promise<void> {
    return this.queue.close();
  }

  obliterate(): Promise<void> {
    return this.queue.obliterate({ force: true });
  }
}
