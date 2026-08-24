ALTER TABLE sites
ADD COLUMN ssh_test_status TEXT DEFAULT 'not_tested';

ALTER TABLE sites
ADD COLUMN ssh_test_message TEXT DEFAULT NULL;

ALTER TABLE sites
ADD COLUMN ssh_tested_at TEXT DEFAULT NULL;