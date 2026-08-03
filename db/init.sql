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
