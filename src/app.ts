import express, { Express } from "express";
import swaggerUi from "swagger-ui-express";
import { TaskService } from "./services/task-service";
import { createTaskRouter, taskErrorHandler } from "./routes/task-routes";
import { createAuthRouter } from "./routes/auth-routes";
import { createProtectedRouter } from "./routes/protected-routes";
import openapiSpec from "../openapi.json";

export function createApp(taskService: TaskService): Express {
  const app = express();
  app.use(express.json());

  app.get("/", (_req, res) => {
    res.status(200).json({
      name: "Task API",
      version: "2.0",
      endpoints: ["/tasks", "/tasks/:id", "/stats", "/reset", "/api/health", "/docs", "/auth/signup", "/auth/login", "/auth/logout", "/public/info", "/protected/profile", "/protected/dashboard"],
    });
  });

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

  app.use(createAuthRouter());
  app.use(createProtectedRouter());
  app.use(createTaskRouter(taskService));
  app.use(taskErrorHandler);

  return app;
}
