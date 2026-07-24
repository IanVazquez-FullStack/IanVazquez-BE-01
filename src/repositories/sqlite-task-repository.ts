import Database from "better-sqlite3";
import path from "path";
import { Task, TaskFilters, UpdateTaskInput } from "../models/task";
import { TaskRepository } from "./task-repository";

const SEED: ReadonlyArray<{ title: string; done: boolean }> = [
  { title: "Buy milk", done: false },
  { title: "Write README", done: false },
  { title: "Ship the API", done: true },
];

type TaskRow = { id: number; title: string; done: number };

function toTask(row: TaskRow): Task {
  return { id: row.id, title: row.title, done: row.done === 1 };
}

export class SqliteTaskRepository implements TaskRepository {
  private readonly db: Database.Database;

  constructor(dbPath: string = path.join(process.cwd(), "tasks.db")) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id    INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        done  INTEGER NOT NULL DEFAULT 0
      );
    `);

    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_title ON tasks(title);`);

    const { count } = this.db
      .prepare(`SELECT COUNT(*) AS count FROM tasks`)
      .get() as { count: number };

    if (count === 0) {
      this.seedInitial();
    }
  }

  private seedInitial(): void {
    const insert = this.db.prepare(`INSERT INTO tasks (title, done) VALUES (?, ?)`);
    const seedAll = this.db.transaction((tasks: readonly { title: string; done: boolean }[]) => {
      for (const t of tasks) insert.run(t.title, t.done ? 1 : 0);
    });
    seedAll(SEED);
  }

  async findAll(filters: TaskFilters = {}): Promise<Task[]> {
    const clauses: string[] = [];
    const values: unknown[] = [];

    if (filters.done !== undefined) {
      clauses.push(`done = ?`);
      values.push(filters.done ? 1 : 0);
    }
    if (filters.search) {
      clauses.push(`LOWER(title) LIKE ?`);
      values.push(`%${filters.search.toLowerCase()}%`);
    }

    let query = `SELECT id, title, done FROM tasks`;
    if (clauses.length) query += ` WHERE ${clauses.join(" AND ")}`;
    query += filters.sort === "title" ? ` ORDER BY title ASC` : ` ORDER BY id ASC`;

    if (filters.limit !== undefined) {
      query += ` LIMIT ?`;
      values.push(filters.limit);
    }
    if (filters.offset !== undefined) {
      query += ` OFFSET ?`;
      values.push(filters.offset);
    }

    const rows = this.db.prepare(query).all(...values) as TaskRow[];
    return rows.map(toTask);
  }

  async findById(id: number): Promise<Task | null> {
    const row = this.db
      .prepare(`SELECT id, title, done FROM tasks WHERE id = ?`)
      .get(id) as TaskRow | undefined;
    return row ? toTask(row) : null;
  }

  async create(title: string): Promise<Task> {
    const info = this.db
      .prepare(`INSERT INTO tasks (title, done) VALUES (?, 0)`)
      .run(title);
    return { id: Number(info.lastInsertRowid), title, done: false };
  }

  async update(id: number, data: UpdateTaskInput): Promise<Task | null> {
    const sets: string[] = [];
    const values: unknown[] = [];

    if (data.title !== undefined) {
      sets.push(`title = ?`);
      values.push(data.title);
    }
    if (data.done !== undefined) {
      sets.push(`done = ?`);
      values.push(data.done ? 1 : 0);
    }
    if (sets.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const info = this.db
      .prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`)
      .run(...values);
    if (info.changes === 0) return null;
    return this.findById(id);
  }

  async remove(id: number): Promise<boolean> {
    const info = this.db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
    return info.changes > 0;
  }

  async reset(): Promise<void> {
    const insert = this.db.prepare(`INSERT INTO tasks (title, done) VALUES (?, ?)`);
    const resetAll = this.db.transaction(() => {
      this.db.exec(`DELETE FROM tasks;`);
      this.db.exec(`DELETE FROM sqlite_sequence WHERE name = 'tasks';`);
      for (const t of SEED) insert.run(t.title, t.done ? 1 : 0);
    });
    resetAll();
  }

  async stats(): Promise<{ total: number; done: number; open: number }> {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS total, SUM(CASE WHEN done = 1 THEN 1 ELSE 0 END) AS done FROM tasks`
      )
      .get() as { total: number; done: number | null };
    const total = row.total;
    const done = row.done ?? 0;
    return { total, done, open: total - done };
  }
}
