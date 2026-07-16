import { Task, TaskFilters, UpdateTaskInput } from "../models/task";
import { TaskRepository } from "./task-repository";

const SEED: ReadonlyArray<Omit<Task, "id">> = [
  { title: "Buy milk", done: false },
  { title: "Write README", done: false },
  { title: "Ship the API", done: true },
];

export class InMemoryTaskRepository implements TaskRepository {
  private tasks: Task[] = [];
  private nextId = 1;

  constructor() {
    this.seed();
  }

  private seed(): void {
    this.tasks = SEED.map((t) => ({ ...t, id: this.nextId++ }));
  }

  async findAll(filters: TaskFilters = {}): Promise<Task[]> {
    let result = [...this.tasks];

    if (filters.done !== undefined) {
      result = result.filter((t) => t.done === filters.done);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter((t) => t.title.toLowerCase().includes(q));
    }
    if (filters.offset !== undefined) {
      result = result.slice(filters.offset);
    }
    if (filters.limit !== undefined) {
      result = result.slice(0, filters.limit);
    }
    return result;
  }

  async findById(id: number): Promise<Task | null> {
    return this.tasks.find((t) => t.id === id) ?? null;
  }

  async create(title: string): Promise<Task> {
    const task: Task = { id: this.nextId++, title, done: false };
    this.tasks.push(task);
    return task;
  }

  async update(id: number, data: UpdateTaskInput): Promise<Task | null> {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return null;
    if (data.title !== undefined) task.title = data.title;
    if (data.done !== undefined) task.done = data.done;
    return task;
  }

  async remove(id: number): Promise<boolean> {
    const index = this.tasks.findIndex((t) => t.id === id);
    if (index === -1) return false;
    this.tasks.splice(index, 1);
    return true;
  }

  async reset(): Promise<void> {
    this.nextId = 1;
    this.seed();
  }

  async stats(): Promise<{ total: number; done: number; open: number }> {
    const total = this.tasks.length;
    const done = this.tasks.filter((t) => t.done).length;
    return { total, done, open: total - done };
  }
}
