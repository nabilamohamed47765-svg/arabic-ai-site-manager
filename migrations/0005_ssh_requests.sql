CREATE TABLE IF NOT EXISTS ssh_requests (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ssh_requests_site
ON ssh_requests(site_id);

CREATE INDEX IF NOT EXISTS idx_ssh_requests_user
ON ssh_requests(user_id);
