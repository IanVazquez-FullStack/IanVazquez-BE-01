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
