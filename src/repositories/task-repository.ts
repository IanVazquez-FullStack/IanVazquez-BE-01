import { Task, TaskFilters, UpdateTaskInput } from "../models/task";

/**
 * Storage-agnostic contract. TaskService only ever talks to this interface —
 * it never knows whether tasks live in a JS array or a Postgres table.
 * That's what lets BE-04 swap the implementation without touching the
 * service or the routes.
 */
export interface TaskRepository {
  findAll(filters?: TaskFilters): Promise<Task[]>;
  findById(id: number): Promise<Task | null>;
  create(title: string): Promise<Task>;
  update(id: number, data: UpdateTaskInput): Promise<Task | null>;
  remove(id: number): Promise<boolean>;
  reset(): Promise<void>;
  stats(): Promise<{ total: number; done: number; open: number }>;
}
