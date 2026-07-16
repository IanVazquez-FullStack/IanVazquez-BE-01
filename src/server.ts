import "dotenv/config";
import { createApp } from "./app";
import { TaskService } from "./services/task-service";
import { TaskRepository } from "./repositories/task-repository";
import { InMemoryTaskRepository } from "./repositories/in-memory-task-repository";
import { PostgresTaskRepository } from "./repositories/postgres-task-repository";
import { createPool } from "./config/db";

const port = process.env.PORT || 3000;
const databaseUrl = process.env.DATABASE_URL;

// This is the ONLY place storage is chosen. Everything downstream
// (TaskService, the routes, app.ts) only ever sees the TaskRepository
// interface — proving that swapping storage really does change one file.
const repository: TaskRepository = databaseUrl
  ? new PostgresTaskRepository(createPool(databaseUrl))
  : new InMemoryTaskRepository();

console.log(
  `[storage] using ${databaseUrl ? "PostgresTaskRepository" : "InMemoryTaskRepository"}`
);

const taskService = new TaskService(repository);
const app = createApp(taskService);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
