ALTER TABLE backups
ADD COLUMN file_path TEXT;

ALTER TABLE backups
ADD COLUMN file_content TEXT;