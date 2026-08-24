PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sites (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    hostname TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 22,
    username TEXT NOT NULL,
    working_directory TEXT NOT NULL DEFAULT '/',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sites_user_id
ON sites(user_id);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    site_id TEXT,
    title TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (site_id)
        REFERENCES sites(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id
ON sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_site_id
ON sessions(site_id);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    site_id TEXT,
    session_id TEXT,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    requires_approval INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TEXT,
    completed_at TEXT,
    error_message TEXT,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (site_id)
        REFERENCES sites(id)
        ON DELETE SET NULL,

    FOREIGN KEY (session_id)
        REFERENCES sessions(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_id
ON tasks(user_id);

CREATE INDEX IF NOT EXISTS idx_tasks_status
ON tasks(status);

CREATE TABLE IF NOT EXISTS logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    site_id TEXT,
    task_id TEXT,
    level TEXT NOT NULL DEFAULT 'info',
    event TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE SET NULL,

    FOREIGN KEY (site_id)
        REFERENCES sites(id)
        ON DELETE SET NULL,

    FOREIGN KEY (task_id)
        REFERENCES tasks(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_site_id
ON logs(site_id);

CREATE INDEX IF NOT EXISTS idx_logs_task_id
ON logs(task_id);

CREATE INDEX IF NOT EXISTS idx_logs_created_at
ON logs(created_at);

CREATE TABLE IF NOT EXISTS backups (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    site_id TEXT NOT NULL,
    task_id TEXT,
    location TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'created',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (site_id)
        REFERENCES sites(id)
        ON DELETE CASCADE,

    FOREIGN KEY (task_id)
        REFERENCES tasks(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_backups_site_id
ON backups(site_id);

CREATE INDEX IF NOT EXISTS idx_backups_created_at
ON backups(created_at);
