import { Pool } from "pg";
import { Task, TaskFilters, UpdateTaskInput } from "../models/task";
import { TaskRepository } from "./task-repository";

const SEED = [
  { title: "Buy milk", done: false },
  { title: "Write README", done: false },
  { title: "Ship the API", done: true },
];

function toTask(row: { id: number; title: string; done: boolean }): Task {
  return { id: row.id, title: row.title, done: row.done };
}

export class PostgresTaskRepository implements TaskRepository {
  constructor(private readonly pool: Pool) {}

  async findAll(filters: TaskFilters = {}): Promise<Task[]> {
    const clauses: string[] = [];
    const values: unknown[] = [];

    if (filters.done !== undefined) {
      values.push(filters.done);
      clauses.push(`done = $${values.length}`);
    }
    if (filters.search) {
      values.push(`%${filters.search.toLowerCase()}%`);
      clauses.push(`LOWER(title) LIKE $${values.length}`);
    }

    let query = `SELECT id, title, done FROM tasks`;
    if (clauses.length) query += ` WHERE ${clauses.join(" AND ")}`;
    query += filters.sort === "title" ? ` ORDER BY title ASC` : ` ORDER BY id ASC`;

    if (filters.limit !== undefined) {
      values.push(filters.limit);
      query += ` LIMIT $${values.length}`;
    }
    if (filters.offset !== undefined) {
      values.push(filters.offset);
      query += ` OFFSET $${values.length}`;
    }

    const { rows } = await this.pool.query(query, values);
    return rows.map(toTask);
  }

  async findById(id: number): Promise<Task | null> {
    const { rows } = await this.pool.query(
      `SELECT id, title, done FROM tasks WHERE id = $1`,
      [id]
    );
    return rows[0] ? toTask(rows[0]) : null;
  }

  async create(title: string): Promise<Task> {
    const { rows } = await this.pool.query(
      `INSERT INTO tasks (title, done) VALUES ($1, false) RETURNING id, title, done`,
      [title]
    );
    return toTask(rows[0]);
  }

  async update(id: number, data: UpdateTaskInput): Promise<Task | null> {
    const sets: string[] = [];
    const values: unknown[] = [];

    if (data.title !== undefined) {
      values.push(data.title);
      sets.push(`title = $${values.length}`);
    }
    if (data.done !== undefined) {
      values.push(data.done);
      sets.push(`done = $${values.length}`);
    }
    if (sets.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const { rows } = await this.pool.query(
      `UPDATE tasks SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING id, title, done`,
      values
    );
    return rows[0] ? toTask(rows[0]) : null;
  }

  async remove(id: number): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM tasks WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async reset(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`TRUNCATE tasks RESTART IDENTITY`);
      for (const t of SEED) {
        await client.query(
          `INSERT INTO tasks (title, done) VALUES ($1, $2)`,
          [t.title, t.done]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async stats(): Promise<{ total: number; done: number; open: number }> {
    const { rows } = await this.pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE done)::int AS done
       FROM tasks`
    );
    const total = rows[0].total as number;
    const done = rows[0].done as number;
    return { total, done, open: total - done };
  }
}
