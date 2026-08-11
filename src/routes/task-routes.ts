import { Router, Request, Response, NextFunction } from "express";
import { TaskService } from "../services/task-service";
import { ClassificationRejectedError, NotFoundError, UpstreamUnavailableError, ValidationError } from "../services/errors";
import { TaskClassifyService } from "../llm/classify-service";
import { classifyRequestSchema, formatZodIssues } from "../llm/schema";

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

export function createTaskRouter(taskService: TaskService, taskClassifier?: TaskClassifyService): Router {
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
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
