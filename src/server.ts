import "dotenv/config";
import path from "path";
import { createApp } from "./app";
import { TaskService } from "./services/task-service";
import { TaskRepository } from "./repositories/task-repository";
import { InMemoryTaskRepository } from "./repositories/in-memory-task-repository";
import { SqliteTaskRepository } from "./repositories/sqlite-task-repository";
import { PostgresTaskRepository } from "./repositories/postgres-task-repository";
import { createPool } from "./config/db";

const port = process.env.PORT || 3000;
const databaseUrl = process.env.DATABASE_URL;
const storageOverride = process.env.STORAGE;

let repository: TaskRepository;
let storageName: string;

if (databaseUrl) {
  repository = new PostgresTaskRepository(createPool(databaseUrl));
  storageName = "PostgresTaskRepository";
} else if (storageOverride === "memory") {
  repository = new InMemoryTaskRepository();
  storageName = "InMemoryTaskRepository";
} else {
  const sqlitePath = process.env.SQLITE_DB_PATH || path.join(process.cwd(), "tasks.db");
  repository = new SqliteTaskRepository(sqlitePath);
  storageName = `SqliteTaskRepository (${sqlitePath})`;
}

console.log(`[storage] using ${storageName}`);

const taskService = new TaskService(repository);
const app = createApp(taskService);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
