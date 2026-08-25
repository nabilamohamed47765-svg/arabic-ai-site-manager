ALTER TABLE ssh_requests
ADD COLUMN operation TEXT NOT NULL DEFAULT 'test';

ALTER TABLE ssh_requests
ADD COLUMN target_path TEXT;

ALTER TABLE ssh_requests
ADD COLUMN output TEXT;