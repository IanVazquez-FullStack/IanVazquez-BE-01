# Task API with Auth

A CRUD API for a to-do list with Supabase authentication. Started as **A1** (in-memory, plain Node `http`),
layered into **routes → service → repository** so storage can be swapped
without touching business logic, then given a real database twice over:
**SQLite** for local persistence (**W3·A2**), and **Postgres** in Docker for
a production-shaped setup (**BE-04**). Now secured with **Supabase Auth** (**BE-03**).

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
