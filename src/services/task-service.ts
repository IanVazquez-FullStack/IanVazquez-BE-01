import { Task, TaskFilters, UpdateTaskInput } from "../models/task";
import { TaskRepository } from "../repositories/task-repository";
import { NotFoundError, ValidationError } from "./errors";

/**
 * All business rules live here. This class depends only on the
 * TaskRepository interface, never on a concrete storage engine —
 * that's the whole point of BE-04: swapping InMemoryTaskRepository
 * for PostgresTaskRepository in server.ts must not require touching
 * a single line in this file.
 */
export class TaskService {
  constructor(private readonly repository: TaskRepository) {}

  listTasks(filters: TaskFilters): Promise<Task[]> {
    return this.repository.findAll(filters);
  }

  async getTask(id: number): Promise<Task> {
    const task = await this.repository.findById(id);
    if (!task) throw new NotFoundError(`Task ${id} not found`);
    return task;
  }

  async createTask(title: unknown): Promise<Task> {
    this.assertValidTitle(title);
    return this.repository.create((title as string).trim());
  }

  async updateTask(id: number, data: UpdateTaskInput): Promise<Task> {
    if (data.title === undefined && data.done === undefined) {
      throw new ValidationError("Provide at least one of: title, done");
    }
    if (data.title !== undefined) {
      this.assertValidTitle(data.title);
      data.title = data.title.trim();
    }
    if (data.done !== undefined && typeof data.done !== "boolean") {
      throw new ValidationError("'done' must be a boolean");
    }

    const updated = await this.repository.update(id, data);
    if (!updated) throw new NotFoundError(`Task ${id} not found`);
    return updated;
  }

  async deleteTask(id: number): Promise<void> {
    const removed = await this.repository.remove(id);
    if (!removed) throw new NotFoundError(`Task ${id} not found`);
  }

  resetTasks(): Promise<void> {
    return this.repository.reset();
  }

  stats(): Promise<{ total: number; done: number; open: number }> {
    return this.repository.stats();
  }

  private assertValidTitle(title: unknown): asserts title is string {
    if (typeof title !== "string" || title.trim().length === 0) {
      throw new ValidationError("'title' is required and must be a non-empty string");
    }
  }
}
