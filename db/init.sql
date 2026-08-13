CREATE TABLE IF NOT EXISTS tasks (
    id    SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    done  BOOLEAN NOT NULL DEFAULT false
);

-- Seed data, same three tasks the in-memory repository starts with.
INSERT INTO tasks (title, done) VALUES
    ('Buy milk', false),
    ('Write README', false),
    ('Ship the API', true)
ON CONFLICT DO NOTHING;

-- Background task-report jobs. file_path is the PDF path relative to the
-- storage root; bytes never live in the database.
CREATE TABLE IF NOT EXISTS reports (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    file_path     TEXT,
    error_message TEXT,
    created_at    TEXT NOT NULL,
    completed_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports (user_id);

-- Background job lifecycle for the async endpoints. One row per idempotency
-- key: the UNIQUE constraint on idempotency_key is the DB layer's guard
-- against double-enqueues (BullMQ dedupes on the same key as its job ID, so
-- the two defenses are independent). result holds the classification JSON when
-- status = 'completed'; error holds the reason when status = 'failed'.
CREATE TABLE IF NOT EXISTS jobs (
    id              TEXT PRIMARY KEY,
    idempotency_key TEXT NOT NULL UNIQUE,
    task_id         INTEGER NOT NULL,
    operation       TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
    attempts        INTEGER NOT NULL DEFAULT 0,
    result          JSONB,
    error           TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_task_id ON jobs (task_id);

-- Durable failure feed: one row every time a job exhausts its retries. A
-- future alerting system (email/Slack/webhook) can poll this table. Never
-- deleted on job retry, unlike the jobs row which is reset in place.
CREATE TABLE IF NOT EXISTS job_failures (
    id         TEXT PRIMARY KEY,
    job_id     TEXT NOT NULL REFERENCES jobs(id),
    task_id    INTEGER NOT NULL,
    operation  TEXT NOT NULL,
    error      TEXT NOT NULL,
    attempts   INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
