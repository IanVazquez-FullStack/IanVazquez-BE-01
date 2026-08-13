import { Router, Request, Response, NextFunction } from "express";
import { TaskService } from "../services/task-service";
import { ClassificationRejectedError, LLMTimeoutError, NotFoundError, UpstreamUnavailableError, ValidationError } from "../services/errors";
import { TaskClassifyService } from "../llm/classify-service";
import { classifyRequestSchema, formatZodIssues } from "../llm/schema";
import { ClassifyQueue } from "../jobs/classify-queue";
import { JobRepository } from "../repositories/job-repository";
import { classifyIdempotencyKey, CLASSIFY_OPERATION } from "../models/job";

/** Minimal surface the async classify route needs, so tests can stub it. */
export interface ClassifyJobDeps {
  queue: Pick<ClassifyQueue, "enqueue" | "remove">;
  jobRepository: JobRepository;
}

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id)) throw new ValidationError(`Invalid task id: ${raw}`);
  return id;
}

function parseBoolQuery(raw: unknown): boolean | undefined {
  if (raw === undefined) return undefined;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new ValidationError("'done' query param must be 'true' or 'false'");
}

function parseSortQuery(raw: unknown): "title" | undefined {
  if (raw === undefined) return undefined;
  if (raw === "title") return "title";
  throw new ValidationError("'sort' query param must be 'title'");
}

export function createTaskRouter(
  taskService: TaskService,
  taskClassifier?: TaskClassifyService,
  classifyJobDeps?: ClassifyJobDeps
): Router {
  const router = Router();

  router.get("/tasks", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { search, limit, offset } = req.query;
      const tasks = await taskService.listTasks({
        done: parseBoolQuery(req.query.done),
        search: typeof search === "string" ? search : undefined,
        limit: limit !== undefined ? Number(limit) : undefined,
        offset: offset !== undefined ? Number(offset) : undefined,
        sort: parseSortQuery(req.query.sort),
      });
      res.status(200).json(tasks);
    } catch (err) {
      next(err);
    }
  });

  router.get("/tasks/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const task = await taskService.getTask(parseId(req.params.id));
      res.status(200).json(task);
    } catch (err) {
      next(err);
    }
  });

  router.post("/tasks", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const task = await taskService.createTask(req.body?.title);
      res.status(201).json(task);
    } catch (err) {
      next(err);
    }
  });

  router.post("/tasks/classify", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!taskClassifier) {
        throw new UpstreamUnavailableError("LLM classifier is not configured");
      }
      const raw =
        req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
      const input = classifyRequestSchema.safeParse(raw);
      if (!input.success) {
        throw new ValidationError(formatZodIssues(input.error, "description"));
      }
      const classification = await taskClassifier.classify(input.data.description);
      res.status(200).json(classification);
    } catch (err) {
      next(err);
    }
  });

  // Async variant: no LLM call happens in this request. The route validates,
  // claims an idempotency key, enqueues to Redis and returns 202 immediately.
  // The worker (src/worker.ts) performs the actual classification.
  router.post("/tasks/:id/classify", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!classifyJobDeps) {
        throw new UpstreamUnavailableError("Background job queue is not configured");
      }
      const taskId = parseId(req.params.id);
      await taskService.getTask(taskId);

      const raw =
        req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
      const input = classifyRequestSchema.safeParse(raw);
      if (!input.success) {
        throw new ValidationError(formatZodIssues(input.error, "description"));
      }
      const description = input.data.description;

      const key = classifyIdempotencyKey(taskId);
      const { job, created } = await classifyJobDeps.jobRepository.createOrGet(key, {
        taskId,
        operation: CLASSIFY_OPERATION,
      });

      if (!created) {
        if (job.status !== "failed") {
          return res.status(202).json({
            job_id: job.id,
            status: job.status,
            status_url: `/jobs/${job.id}`,
            duplicate: true,
          });
        }
        // The previous attempt failed terminally — reset the row and retry.
        await classifyJobDeps.jobRepository.resetForRetry(key);
        await classifyJobDeps.queue.remove(key).catch(() => 0);
      }

      try {
        await classifyJobDeps.queue.enqueue({ taskId, description, idempotencyKey: key });
      } catch (err) {
        await classifyJobDeps.jobRepository.markFailed(
          key,
          `enqueue failed: ${err instanceof Error ? err.message : String(err)}`
        ).catch(() => undefined);
        throw err;
      }

      res.status(202).json({
        job_id: job.id,
        status: "queued",
        status_url: `/jobs/${job.id}`,
      });
    } catch (err) {
      next(err);
    }
  });

  router.put("/tasks/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const task = await taskService.updateTask(parseId(req.params.id), {
        title: req.body?.title,
        done: req.body?.done,
      });
      res.status(200).json(task);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/tasks/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      await taskService.deleteTask(parseId(req.params.id));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  router.post("/reset", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await taskService.resetTasks();
      const tasks = await taskService.listTasks({});
      res.status(200).json(tasks);
    } catch (err) {
      next(err);
    }
  });

  router.get("/stats", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(200).json(await taskService.stats());
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function taskErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  if (err instanceof ValidationError) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof UpstreamUnavailableError) {
    res.status(503).json({ error: err.message });
    return;
  }
  if (err instanceof ClassificationRejectedError) {
    res.status(422).json({ error: err.message });
    return;
  }
  if (err instanceof LLMTimeoutError) {
    res.status(504).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
