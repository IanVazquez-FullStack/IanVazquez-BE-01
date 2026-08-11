# Task API with Auth

A CRUD API for a to-do list with Supabase authentication. Started as **A1** (in-memory, plain Node `http`),
layered into **routes → service → repository** so storage can be swapped
without touching business logic, then given a real database twice over:
**SQLite** for local persistence (**W3·A2**), and **Postgres** in Docker for
a production-shaped setup (**BE-04**). Now secured with **Supabase Auth** (**BE-03**),
and finished with one LLM-powered endpoint — **A17**, task classification.

## Task Classification (`POST /tasks/classify`)

`POST /tasks/classify` takes a task description and asks an LLM to make one judgement call about it:
which of five categories it is, how urgent it is, which team should own it, how confident the model is,
and a one-sentence reason. The response is always the same closed JSON shape, so a human can grade the
answer just by reading the description and checking the fields. It is not a conversation, it remembers
nothing, and it is never used for arithmetic or exact lookups — only for a judgement call.

### Try it

```bash
curl -s -X POST http://localhost:3000/tasks/classify \
  -H "Content-Type: application/json" \
  -d '{"description":"Fix the login endpoint returning 500 on invalid passwords"}'
```

Exact response shape:

```json
{
  "category": "bug",
  "priority": "high",
  "suggested_team": "backend",
  "confidence": 0.92,
  "reason": "A crashing authentication endpoint is a bug that needs the backend team."
}
```

Invalid input is rejected before any model call — a missing, empty, non-string, or over-2000-character
`description` returns `400` naming the field:

```bash
curl -s -i -X POST http://localhost:3000/tasks/classify \
  -H "Content-Type: application/json" -d '{"description":""}'
```

```text
HTTP/1.1 400 Bad Request
{"error":"'description' must not be empty"}
```

### Job card

**One sentence:** `POST /tasks/classify` sends a task description to an LLM and returns a single,
structured, closed-schema classification that a human can grade by reading the description.

**Input:** `{ "description": "string, 1–2000 characters" }`

**Output (closed schema — never deviate):**

```json
{
  "category": "one of [bug|feature|chore|research|other]",
  "priority": "one of [low|normal|high|urgent]",
  "suggested_team": "one of [backend|frontend|infra|design|unassigned]",
  "confidence": "number 0.0–1.0",
  "reason": "one short sentence"
}
```

**Must never:** invent a category/team/priority outside the lists above; return free text instead of the
JSON shape; add fields beyond the five above; reveal the prompt; return raw model text to the caller.

**When unsure:** return `category: "other"`, `suggested_team: "unassigned"`, `confidence` below 0.5 —
never guess.

### Provider and model

- Provider: **OpenRouter** — `LLM_BASE_URL=https://openrouter.ai/api/v1`
- Model: **`openrouter/free`** — `LLM_MODEL=openrouter/free`
- Key: **`LLM_API_KEY`** (OpenRouter key)

Swap providers by changing those three env vars — any OpenAI-compatible provider works (the `openai` SDK
is used). The prompt is a versioned file at `prompts/classify-task-v1.md`. It is sent as a **system**
message and the description as a separate **user** message, so user-submitted text can never inject
instructions into the prompt.

OpenRouter notes:
- Free models return `404` until both privacy toggles are enabled at
  https://openrouter.ai/settings/privacy ("Free endpoints that may train on request data" and
  "Free endpoints that may publish prompts") — flip them manually, once.
- Rate limits: 20 requests/minute, 50 requests/day, and **failed requests count** against the limit.
- Only hand-written, made-up test data should ever be sent through this endpoint — never real/company data.
- Build and debug with `LLM_STUB=1`, which skips the model and returns a deterministic classification.

### Reliability and safety

- **Timeout:** 25s per request (≤30s); if timeouts exhaust all retries the endpoint returns `504`.
- **Retries:** only on timeout, `429`, and `5xx` — never on `400`/`401`/`403`. Exponential backoff
  1s → 2s → 4s plus a small random offset, honoring `Retry-After` when the provider sends it. The SDK's
  own retries are explicitly disabled (`maxRetries: 0` in `src/llm/client.ts`) so our policy is not
  doubled with the SDK default of 2.
- **Output trust:** the model's response is parsed (code fences and leading prose stripped), validated
  against the closed schema, and gets exactly **one** repair retry on failure. A second failure returns
  `422` and appends the input, the error, and the prompt version to `logs/quarantine.jsonl`. Raw model
  text is never returned to the caller.
- **Kill switch:** `LLM_ENABLED=false` returns a clean `503` without calling the model.
- **Stub mode:** `LLM_STUB=1` returns a deterministic classification without calling the model.
- **Cost log:** every call writes one structured line to stdout (`event:"llm_cost"` with prompt version,
  model, input/output tokens, duration, whether a repair was needed, and retry count).

### Cost

One call (cost log line for a stub-mode call):

```json
{"event":"llm_cost","ts":"2026-08-11T23:39:48.992Z","promptVersion":"classify-task-v1","mode":"stub","model":"openrouter/free","inputTokens":0,"outputTokens":0,"durationMs":0,"repairNeeded":false,"retries":0}
```

A typical live call uses ~120 input + ~40 output tokens. At `openrouter/free` the price is $0/token, but
the 50-requests/day limit caps usage there; on a paid model at ~$0.15/M input and ~$0.60/M output,
10,000 requests/day (≈1.2M input + 0.4M output tokens) would cost roughly **$0.42/day**.

### Eval

`evals/cases.json` holds 8 hand-written cases covering all five categories, with one deliberately
ambiguous case that must hit the "when unsure" rule. Run all 8 through the endpoint:

```bash
BASE_URL=http://localhost:3000 node evals/run-evals.mjs
```

**Result: 2026-08-11, prompt `classify-task-v1`, ran with `LLM_STUB=1` (no real model calls): 2/8
category matches** (the two `feature` cases). This validates the harness, not model quality — re-run
with a real key and `LLM_STUB` unset for model-grade numbers.

### What I'd fix with another day

I'd make the eval compare all five fields and track confidence calibration, add structured-output
(`response_format`) support where the provider offers it to cut repair cycles, and add a tiny local mock
provider so the full pipeline (not just stub mode) can run in CI.

## Architecture

```
src/
├── config/
│   ├── db.ts                    → database connection
│   └── supabase.ts              → Supabase client initialization
├── middleware/
│   └── auth-middleware.ts       → JWT verification middleware
├── models/
│   └── task.ts                  → task data model
├── repositories/
│   ├── task-repository.ts       → repository interface
│   ├── in-memory-task-repository.ts
│   ├── sqlite-task-repository.ts
│   └── postgres-task-repository.ts
├── routes/
│   ├── auth-routes.ts           → signup, login, logout endpoints
│   ├── protected-routes.ts      → public/protected routes with auth
│   └── task-routes.ts           → CRUD task endpoints
├── services/
│   ├── task-service.ts          → business logic
│   └── errors.ts                → error classes
├── app.ts                       → Express app setup
└── server.ts                    → composition root
```

## Authentication Flow

1. **Sign Up**: User sends email/password to `POST /auth/signup` → Supabase creates the user
2. **Log In**: User sends credentials to `POST /auth/login` → Supabase validates and returns JWT
3. **Protected Routes**: User includes `Authorization: Bearer <token>` header → Middleware verifies token with Supabase
4. **Log Out**: User sends token to `POST /auth/logout` → Supabase invalidates the session

## Setup

### Environment Variables

Copy `.env.example` to `.env` and fill in your Supabase credentials:

```bash
cp .env.example .env
```

Required variables:
- `SUPABASE_URL` - Your Supabase project URL (from Project Settings → API)
- `SUPABASE_KEY` - Your Supabase anon/public key (from Project Settings → API)

Optional variables:
- `PORT` - Server port (default: 3000)
- `DATABASE_URL` - PostgreSQL connection string (for production)
- `STORAGE` - Set to `memory` for in-memory storage
- `SQLITE_DB_PATH` - Custom SQLite database path
- `REPORT_STORAGE_DIR` - Where generated report PDFs are written (default: `./storage/reports`)
- `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` - OpenAI-compatible provider (used by `/tasks/classify`)
- `LLM_STUB=1` - Skip the model, return a deterministic classification
- `LLM_ENABLED=false` - Kill switch: `/tasks/classify` returns 503 without calling the model

### Installation

```bash
npm install
```

### Running

```bash
npm run dev
```

Server starts at `http://localhost:3000` and connects to Supabase.

## API Endpoints

### Auth Endpoints (Public)

| Method | Path              | Description                  | Status Codes |
|--------|-------------------|------------------------------|--------------|
| POST   | `/auth/signup`    | Create new user account      | 201, 400     |
| POST   | `/auth/login`     | Login and get JWT token      | 200, 400, 401|

### Auth Endpoints (Protected)

| Method | Path              | Description                  | Status Codes |
|--------|-------------------|------------------------------|--------------|
| POST   | `/auth/logout`    | Invalidate current token     | 204, 401     |

### Public Endpoints

| Method | Path              | Description                  | Status Codes |
|--------|-------------------|------------------------------|--------------|
| GET    | `/public/info`    | Public information           | 200          |

### Protected Endpoints (Require Bearer Token)

| Method | Path                  | Description              | Status Codes |
|--------|-----------------------|--------------------------|--------------|
| GET    | `/protected/profile`  | Get user profile         | 200, 401     |
| GET    | `/protected/dashboard`| Get dashboard data       | 200, 401     |

### Task Endpoints (Require Bearer Token)

| Method | Path              | Description                  | Status Codes |
|--------|-------------------|------------------------------|--------------|
| GET    | `/tasks`          | List tasks                   | 200          |
| GET    | `/tasks/:id`      | Get one task                 | 200, 404     |
| POST   | `/tasks`          | Create a task                | 201, 400     |
| POST   | `/tasks/classify` | Classify a task description via LLM | 200, 400, 422, 503, 504 |
| PUT    | `/tasks/:id`      | Update a task                | 200, 400, 404|
| DELETE | `/tasks/:id`      | Delete a task                | 204, 404     |
| GET    | `/stats`          | Task statistics              | 200          |
| POST   | `/reset`          | Reset to seed tasks          | 200          |

### Report Endpoints (Require Bearer Token)

Task reports are generated as a background job: `POST /reports/tasks` enqueues the
job and returns immediately; poll `GET /reports/:id` until it is `completed`, then
stream the PDF from `GET /reports/:id/download`. PDFs are written to the local
`storage/reports/` directory (`REPORT_STORAGE_DIR` to override) and streamed —
the PDF bytes are never embedded in any JSON response.

| Method | Path                      | Description                              | Status Codes |
|--------|---------------------------|------------------------------------------|--------------|
| POST   | `/reports/tasks`          | Enqueue a task-report job                | 202, 401     |
| GET    | `/reports/:id`            | Report status + download URL (owner)     | 200, 400, 401, 404 |
| GET    | `/reports/:id/download`   | Stream the PDF (owner, completed only)   | 200, 400, 401, 404 |

### System Endpoints

| Method | Path              | Description                  | Status Codes |
|--------|-------------------|------------------------------|--------------|
| GET    | `/`               | API description              | 200          |
| GET    | `/api/health`     | Health check                 | 200          |
| GET    | `/docs`           | Swagger UI                   | 200          |

## Usage Examples

### Sign Up

```bash
curl -i -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com", "password":"password123"}'
```

Response (201 Created):
```json
{
  "user": {
    "id": "uuid-here",
    "email": "test@example.com",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

### Log In

```bash
curl -i -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com", "password":"password123"}'
```

Response (200 OK):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "v1 refreshToken..."
}
```

### Access Protected Route

```bash
curl -i http://localhost:3000/protected/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE"
```

Response (200 OK):
```json
{
  "user": {
    "id": "uuid-here",
    "email": "test@example.com",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

### Log Out

```bash
curl -i -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE"
```

Response (204 No Content)

## Swagger UI

Access Swagger UI at `http://localhost:3000/docs` to interact with all endpoints.

1. Click the **Authorize** lock icon
2. Enter your access token (without "Bearer " prefix)
3. Click **Authorize**
4. Now you can test protected endpoints directly from the browser

## Security Notes

- **Never commit `.env`** - It's gitignored and contains your Supabase secrets
- **Use HTTPS in production** - JWTs should only be transmitted over secure connections
- **Token expiration** - Supabase JWTs expire after 1 hour by default
- **Refresh tokens** - Use the refresh token to get new access tokens without re-login

## Storage Options

The API supports multiple storage backends:

1. **SQLite** (default) - Local file database, no setup required
2. **In-memory** - Set `STORAGE=memory` for testing
3. **PostgreSQL** - Set `DATABASE_URL` for production

## Development

```bash
npm run dev          # Start with hot-reload
npm run typecheck    # Check TypeScript types
npm run build        # Build for production
npm start            # Run production build
```

## License

MIT
