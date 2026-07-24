# Stage 6 — the AI rematch

## The prompt (v1, written from memory, before looking anything up again)

> I have a Node/Express CRUD API for a to-do list that currently stores tasks
> in memory. Migrate it to SQLite using better-sqlite3, storing data in a
> file called tasks.db. Keep the same endpoints: GET /tasks, GET /tasks/:id,
> POST /tasks, PUT /tasks/:id, DELETE /tasks/:id. Support a `search` query
> param on GET /tasks. Keep the same status codes as before.

This is `ai-version/server.js` — generated from that prompt, in its own
folder, untouched otherwise. My hand-built version (`src/repositories/
sqlite-task-repository.ts` + the one line in `src/server.ts`) is the real
submission.

## Running it against the Stage 2 / Stage 3 checkpoints

- Seed shows up on first boot: yes, 3 tasks.
- **Restart the server and check again: the seed had grown to 6 rows.**
  `db.exec(INSERT ...)` runs unconditionally on every boot — there's no
  count-first check the way the assignment (and my version) requires.
- Data survives a restart: yes, in the sense that old rows aren't lost — but
  see above, new junk rows keep getting added alongside them.
- `DELETE /tasks/:id` on a real id returns `200`, not the `204` the spec
  asks for, and unknown ids don't get a distinct 404 either — it "succeeds"
  even when nothing was deleted, silently.

## Diff

```
diff -u src/repositories/sqlite-task-repository.ts ai-version/server.js
```

The diff is effectively the entire file both ways — not because either
version is wrong on its face, but because the AI never adopted the
routes → service → repository split my repo already uses. It wrote one
monolithic `server.js` with Express routes calling `better-sqlite3` directly,
because my prompt never mentioned that architecture existed. That's the
single biggest structural difference, and it's on me, not the model.

## AI vs me

**What it did better / worth understanding:**
The `search` handling and the `/tasks/:id` shape are genuinely simpler to
read at a glance — no repository indirection to trace through. For a
one-file throwaway script that's a real advantage; it's only a problem
because this project already committed to the layered architecture in A2.

**What it got wrong or quietly skipped:**
1. **Seed multiplies on every restart.** No `COUNT(*)` check before
   inserting — the exact failure mode the assignment's Stage 0 checkpoint
   exists to catch.
2. **String-glued SQL for search:** `` `WHERE title LIKE '%${search}%'` ``
   pastes the query param directly into the SQL text instead of using a `?`
   placeholder — a SQL injection hole. My prompt said "support a search
   param" but never said *how* to pass it in safely.
3. **Status codes drifted:** delete always returns `200`, and 404s come back
   as a bare string (`res.status(404).send("Task not found")`) instead of
   the `{ "error": "..." }` shape the rest of the API uses. "Keep the same
   status codes as before" wasn't specific enough to survive contact with an
   actual implementation.

**What my prompt forgot to specify — and what the AI silently decided for me:**
- I never said "only insert the seed if the table is empty" — I assumed that
  was obvious from "migrate the in-memory version," but the model had no way
  to know my in-memory repository already did that.
- I never said "use parameterized queries" or mentioned SQL injection at
  all — the model defaulted to the simplest thing that runs, string
  concatenation, rather than the safe thing.
- I never told it about the existing `TaskRepository` interface, so it had
  no reason to produce anything other than a flat, single-file script.
- I never specified the exact error JSON shape (`{ "error": "..." }`) or that
  delete should return `204` — I only said "keep the same status codes,"
  which is a promise, not a specification.

## One rematch

Rewrote the prompt to close those four gaps explicitly: *"insert the seed
only when `SELECT COUNT(*) FROM tasks` is 0", "use `?` parameterized
placeholders everywhere, never string-interpolate a query value", "404s
must return `{ \"error\": \"...\" }` as JSON, and DELETE must return `204`
on success, `404` on an unknown id"* — and named the existing repository
pattern so the regeneration wouldn't default back to a flat script.

One sentence on what changed: the regenerated version fixed all four called-out
issues (idempotent seed, parameterized `LIKE`, correct JSON error shape, `204`
on delete) — confirming the gaps were entirely about what I'd failed to
specify, not something the model couldn't do once asked directly.
