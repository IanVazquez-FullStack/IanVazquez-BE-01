# Task API

A CRUD API for a to-do list. Started as **A1** (in-memory, plain Node `http`),
layered into **routes → service → repository** so storage can be swapped
without touching business logic, then given a real database twice over:
**SQLite** for local persistence (**W3·A2**), and **Postgres** in Docker for
a production-shaped setup (**BE-04**).

## Architecture

```
routes/task-routes.ts   → parses HTTP, calls the service, maps errors to status codes
services/task-service.ts → validation + business rules, depends only on TaskRepository
repositories/task-repository.ts → the interface (the contract)
  ├── in-memory-task-repository.ts   → array in memory (opt-in: STORAGE=memory)
  ├── sqlite-task-repository.ts      → tasks.db, a single file on disk (the local default)
  └── postgres-task-repository.ts    → real Postgres table (used when DATABASE_URL is set)
server.ts → composition root: the ONLY file that picks which repository to use
```

`TaskService` and the routes never import `better-sqlite3` or `pg`, and don't
know a database exists. They only see `TaskRepository`. Swapping storage
means changing one file (`sqlite-task-repository.ts`) plus one `if` branch in
`server.ts` — everything else is honestly untouched. That's the whole point
of this layering: the API is the promise, the database is just where the
promise gets kept.

## Run it

**Locally, no Docker (SQLite — the default):**

```bash
npm install
npm run dev
```

No `DATABASE_URL` set → `server.ts` opens (and, on first run, creates)
`tasks.db` in the project root via `SqliteTaskRepository`. API on
`http://localhost:3000`, Swagger UI on `http://localhost:3000/docs`.

**With Docker (Postgres — BE-04):**

```bash
cp .env.example .env    # only needed if you run the app outside Docker
docker compose up
```

That starts Postgres (with a named volume) and the app together, wired via
`DATABASE_URL`, which is what makes `server.ts` pick `PostgresTaskRepository`
instead.

## Why SQLite

SQLite was the right fit for the W3·A2 stage because it needs zero setup: no
server process, no container, no credentials — opening a file that doesn't
exist yet *is* creating the database. That matches what this stage is
actually teaching (memory to disk is the change; everything else about the
API stays put) without Postgres/Docker's extra moving parts. The trade-off is
concurrency: SQLite is superb for one process talking to one file (this app,
local dev, small tools) but doesn't scale to many concurrent writers the way
Postgres does — which is exactly why BE-04 later moves to Postgres for the
containerized, production-shaped version of this same API.

## Where the database lives

`tasks.db` (plus its `-wal` / `-shm` sidecar files, from WAL mode) sits in the
project root, next to `package.json`. It's git-ignored — each clone starts
with no database and gets its own freshly-seeded copy on first run. Override
the path with `SQLITE_DB_PATH` if you want it elsewhere.

## Endpoints

| Method | Path          | Meaning                    |
|--------|---------------|-----------------------------|
| GET    | `/`           | API description             |
| GET    | `/api/health` | Health check                |
| GET    | `/tasks`      | List tasks (`?done=&search=&limit=&offset=&sort=title`) |
| GET    | `/tasks/:id`  | Get one task                |
| POST   | `/tasks`      | Create a task (`{ "title": "..." }`) |
| PUT    | `/tasks/:id`  | Update a task (`title` and/or `done`) |
| DELETE | `/tasks/:id`  | Delete a task               |
| GET    | `/stats`      | `{ total, done, open }` — computed with SQL `COUNT()`, not in JS |
| POST   | `/reset`      | Reset to the 3 seed tasks   |
| GET    | `/docs`       | Swagger UI                  |

Example:

```bash
curl -i -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Buy milk"}'

HTTP/1.1 201 Created
Content-Type: application/json; charset=utf-8

{"id":4,"title":"Buy milk","done":false}
```

Status codes: `200` reads, `201` create, `204` delete, `400` invalid body, `404` unknown id.

## Storage: honestly, what changed and what didn't

- **Changed:** `server.ts` (picks the repository), added
  `sqlite-task-repository.ts` and `postgres-task-repository.ts`, added
  `db/init.sql`, `docker-compose.yml`, `Dockerfile`, `.env.example`.
- **Did not change:** `task-service.ts` and `task-routes.ts`. Same files,
  same logic, same validation, whether the app is talking to a JS array, a
  SQLite file, or a real Postgres table. That's the thing this assignment is
  actually testing.

## Exploring the database by hand (Stage 4)

Opened `tasks.db` in DB Browser for SQLite after seeding and running a few
requests. Example query run in its "Execute SQL" tab:

```sql
SELECT * FROM tasks WHERE done = 1;
```

Returned exactly the completed tasks (`Ship the API` from the seed, plus
whatever I'd marked done through the API in that session) — confirming the
API and DB Browser are reading the same file with no syncing step in between.

*(screenshot of DB Browser here — add `docs/db-browser.png` and embed it as
`![DB Browser](docs/db-browser.png)`)*

## `.env`

`.env` is gitignored; `.env.example` is committed as the template. It's only
needed for two cases: pointing `SQLITE_DB_PATH` somewhere non-default, or
running the Node process directly on your host against the Dockerized
Postgres (`docker-compose.yml` builds `DATABASE_URL` itself for the `app`
service).

## Proving persistence (SQLite)

```bash
curl -s -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"prueba persistencia"}'
# {"id":4,"title":"prueba persistencia","done":false}

# stop the server (Ctrl+C), then start it again:
npm run dev

curl -s http://localhost:3000/tasks | python3 -m json.tool
```

Result — the row created before the restart is still there, and the three
seed tasks were not duplicated:

```json
[
    {"id": 1, "title": "Buy milk", "done": false},
    {"id": 2, "title": "Write README", "done": false},
    {"id": 3, "title": "Ship the API", "done": true},
    {"id": 4, "title": "prueba persistencia", "done": false}
]
```

## Proving persistence (Postgres / BE-04)

Tested with the exact command the BE-04 assignment asked for — create a row,
tear down the whole stack, bring it back up, confirm the row survived:

```bash
curl -s -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"prueba persistencia"}'
# {"id":7,"title":"prueba persistencia","done":false}

docker compose down
#  Container ianvazquez-be-01-app-1  Removed
#  Container ianvazquez-be-01-db-1   Removed
#  Network ianvazquez-be-01_default  Removed

docker compose up -d
#  Container ianvazquez-be-01-db-1   Started
#  Container ianvazquez-be-01-db-1   Healthy
#  Container ianvazquez-be-01-app-1  Started

sleep 3
curl -s http://localhost:3000/tasks | python3 -m json.tool
```

Result — row `id: 7` ("prueba persistencia") is still there after the
containers and network were fully removed and recreated from scratch:

```json
[
    {"id": 1, "title": "Buy milk", "done": false},
    {"id": 2, "title": "Write README", "done": false},
    {"id": 3, "title": "Ship the API", "done": true},
    {"id": 7, "title": "prueba persistencia", "done": false}
]
```

`docker compose down` removes the containers and the network, but the named
volume (`pgdata`) is untouched — that's what makes the row survive. Only
`docker compose down -v` would wipe it.

## Extras included

- **Search** — `GET /tasks?search=milk` via SQL `LIKE` (`WHERE LOWER(title) LIKE ?`).
- **Filter by status** — `GET /tasks?done=true` via `WHERE done = ?`.
- **Sort alphabetically** — `GET /tasks?sort=title` via `ORDER BY title ASC`
  (implemented in all three repositories, so the contract stays consistent).
- **Statistics** — `GET /stats`, computed with SQL `COUNT()` / `SUM(CASE...)`,
  not counted in application code.
- **Index** — `CREATE INDEX idx_tasks_title ON tasks(title)`, added because
  both the search extra (`LIKE` on `title`) and the sort extra (`ORDER BY
  title`) read that column; an index trades a small write-time cost for
  faster reads on exactly the queries this app runs most.
- **Transaction** — seeding the three example tasks (and resetting them via
  `POST /reset`) runs inside `db.transaction(...)`, so it's all-or-nothing:
  a crash mid-seed can't leave one or two rows behind with no way to tell the
  app it still needs to finish seeding.

## Extras / stretch not attempted

- `created_at` / `updated_at` timestamps — would mean changing the `tasks`
  schema and the shared `Task` model across all three repositories; skipped
  for this pass rather than done half-way.
- Redis and the `EXPLAIN ANALYZE` index comparison from BE-04 — still not
  included, noted here rather than silently skipped.

## AI vs me (Stage 6)

See [`ai-version/README.md`](ai-version/README.md) for the full prompt, the
AI-generated version (kept in its own folder, untouched otherwise), the diff
against the hand-built `sqlite-task-repository.ts` above, and the concrete
differences found.

## What changed from A1

- Rewritten in TypeScript with Express (was a single `server.js` using the
  raw `http` module with two endpoints).
- Full CRUD on `/tasks` with validation and correct status codes.
- Swagger UI at `/docs`, spec in `openapi.json`.
- Layered into routes / service / repository — the layering that made both
  the SQLite swap (W3·A2) and the Postgres swap (BE-04) possible without
  touching `task-service.ts` or `task-routes.ts`.
