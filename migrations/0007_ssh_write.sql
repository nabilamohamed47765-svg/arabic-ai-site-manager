ALTER TABLE ssh_requests
ADD COLUMN file_content TEXT;

ALTER TABLE ssh_requests
ADD COLUMN overwrite_confirmed INTEGER NOT NULL DEFAULT 0;