# Task API

A CRUD API for a to-do list. Started as **A1** (in-memory, plain Node `http`),
now layered into **routes → service → repository** so storage can be swapped
without touching business logic (**A2**), and containerized with Postgres so
data survives a restart (**BE-04**).

## Architecture

```
routes/task-routes.ts   → parses HTTP, calls the service, maps errors to status codes
services/task-service.ts → validation + business rules, depends only on TaskRepository
repositories/task-repository.ts → the interface (the contract)
  ├── in-memory-task-repository.ts   → array in memory (used when DATABASE_URL is unset)
  └── postgres-task-repository.ts    → real Postgres table (used when DATABASE_URL is set)
server.ts → composition root: the ONLY file that picks which repository to use
```

`TaskService` and the routes never import `pg` or know a database exists.
They only see `TaskRepository`. Swapping storage means changing one line in
`server.ts` — everything else is honestly untouched.

## Run it

```bash
cp .env.example .env    # only needed if you run the app outside Docker
docker compose up
```

That starts Postgres (with a named volume) and the app together. The app
waits for Postgres's healthcheck before booting. API on `http://localhost:3000`,
Swagger UI on `http://localhost:3000/docs`.

To run without Docker (in-memory storage, no `DATABASE_URL` set):

```bash
npm install
npm run dev
```

## Endpoints

| Method | Path          | Meaning                    |
|--------|---------------|-----------------------------|
| GET    | `/`           | API description             |
| GET    | `/api/health` | Health check                |
| GET    | `/tasks`      | List tasks (`?done=&search=&limit=&offset=`) |
| GET    | `/tasks/:id`  | Get one task                |
| POST   | `/tasks`      | Create a task (`{ "title": "..." }`) |
| PUT    | `/tasks/:id`  | Update a task (`title` and/or `done`) |
| DELETE | `/tasks/:id`  | Delete a task               |
| GET    | `/stats`      | `{ total, done, open }`     |
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

- **Changed:** `server.ts` (picks the repository), added `postgres-task-repository.ts`,
  added `db/init.sql`, added `docker-compose.yml` / `Dockerfile` / `.env`.
- **Did not change:** `task-service.ts` and `task-routes.ts`. Same files, same
  logic, same validation, whether the app is talking to a JS array or a real
  Postgres table. That's the thing this assignment is actually testing.

## `.env`

`.env` is gitignored; `.env.example` is committed as the template.
`docker-compose.yml` builds `DATABASE_URL` itself for the `app` service
(pointing at the `db` service by name); `.env` is only needed if you want to
run the Node process directly on your host against the Dockerized Postgres.

## Proving persistence

Tested with the exact command the assignment asks for — create a row, tear
down the whole stack, bring it back up, confirm the row survived:

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

## What changed from A1

- Rewritten in TypeScript with Express (was a single `server.js` using the
  raw `http` module with two endpoints).
- Full CRUD on `/tasks` with validation and correct status codes.
- Swagger UI at `/docs`, spec in `openapi.json`.
- Layered into routes / service / repository (this is what made BE-04
  possible without touching business logic).

## Stretch not attempted

Redis and the `EXPLAIN ANALYZE` index comparison are not included in this
pass — noted here rather than silently skipped.
