// AI-generated (v1) — from the prompt in ai-version/README.md.
// Deliberately left as-is, flaws included, for the Stage 6 diff/review.
// Not wired into the real app; not imported anywhere outside this folder.

const express = require("express");
const Database = require("better-sqlite3");

const app = express();
app.use(express.json());

const db = new Database("tasks.db");

// Creates the table if it's missing — this part it got right.
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    done BOOLEAN DEFAULT 0
  )
`);

// FLAW: no "insert only if empty" check — this runs on every boot,
// so restarting the server re-adds three rows every single time.
db.exec(`
  INSERT INTO tasks (title, done) VALUES
    ('Buy milk', 0),
    ('Write README', 0),
    ('Ship the API', 1)
`);

app.get("/tasks", (req, res) => {
  const { search } = req.query;
  // FLAW: search term is glued directly into the SQL string instead of
  // using a parameterized placeholder — classic SQL injection surface.
  let query = "SELECT * FROM tasks";
  if (search) {
    query += ` WHERE title LIKE '%${search}%'`;
  }
  const tasks = db.prepare(query).all();
  res.json(tasks);
});

app.get("/tasks/:id", (req, res) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  if (!task) {
    // FLAW: error shape doesn't match the spec ({ "error": "..." }) —
    // returns a bare string instead of JSON.
    return res.status(404).send("Task not found");
  }
  res.json(task);
});

app.post("/tasks", (req, res) => {
  const { title } = req.body;
  if (!title) {
    return res.status(400).send("Title is required");
  }
  const info = db.prepare("INSERT INTO tasks (title, done) VALUES (?, 0)").run(title);
  res.status(201).json({ id: info.lastInsertRowid, title, done: false });
});

app.put("/tasks/:id", (req, res) => {
  const { title, done } = req.body;
  db.prepare("UPDATE tasks SET title = ?, done = ? WHERE id = ?").run(
    title,
    done,
    req.params.id
  );
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  res.json(task);
});

app.delete("/tasks/:id", (req, res) => {
  db.prepare("DELETE FROM tasks WHERE id = ?").run(req.params.id);
  // FLAW: always returns 200, even for an id that didn't exist, and never
  // returns 204 on success — the assignment's status-code table asked for
  // 204 on delete.
  res.status(200).json({ message: "deleted" });
});

app.listen(3000, () => console.log("AI version running on http://localhost:3000"));
